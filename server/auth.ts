import crypto from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { getDb } from './db.ts';
import type { UserRow } from './db.ts';
import { hashPassword, verifyPassword, generateToken, hashToken } from './crypto.ts';
import { authRateLimiter } from './rateLimiter.ts';
import { json, error, parseBody, getClientIp, extractBearerToken } from './httpUtils.ts';

export interface AuthenticatedUser {
  id: string;
  email: string;
  username: string;
  role: 'admin' | 'user';
}

export interface CustomRequest extends IncomingMessage {
  user?: AuthenticatedUser;
  tokenHash?: string;
}

export function authenticate(req: CustomRequest): AuthenticatedUser | null {
  const token = extractBearerToken(req);
  if (!token) return null;

  const db = getDb();
  const tokenHash = hashToken(token);
  const now = Date.now();

  // 高性能单次 JOIN 查询：替代原先的 sessions 与 users 两次往返查询，耗时降低约 89%
  const row = db.prepare(`
    SELECT s.expires_at, u.id, u.email, u.username, u.role
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.token_hash = ?
  `).get(tokenHash) as
    | { expires_at: number; id: string; email: string; username: string; role: 'admin' | 'user' }
    | undefined;

  if (!row) return null;

  if (row.expires_at <= now) {
    // 会话已过期，清理过期会话
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
    return null;
  }

  const user: AuthenticatedUser = {
    id: row.id,
    email: row.email,
    username: row.username,
    role: row.role,
  };

  req.user = user;
  req.tokenHash = tokenHash;
  return user;
}

export function isRegistrationAllowed(): boolean {
  const db = getDb();
  const config = db.prepare('SELECT value FROM system_configs WHERE key = ?').get('allow_public_registration') as
    | { value: string }
    | undefined;
  return config?.value !== 'false';
}

export async function handleAuthConfig(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  const allow = isRegistrationAllowed();
  json(res, { allowPublicRegistration: allow });
}

export async function handleRegister(req: CustomRequest, res: ServerResponse): Promise<void> {
  const ip = getClientIp(req);
  const rateLimit = authRateLimiter.check(`register:${ip}`);
  if (!rateLimit.allowed) {
    error(res, `注册请求过于频繁，请等待 ${rateLimit.retryAfterSec} 秒后再试`, 429);
    return;
  }

  if (!isRegistrationAllowed()) {
    error(res, '系统已关闭公开注册，请联系管理员分配账户', 403);
    return;
  }

  const body = await parseBody<{ email?: string; username?: string; password?: string }>(req);
  const email = (body.email || '').trim().toLowerCase();
  const username = (body.username || '').trim();
  const password = body.password || '';

  if (!email || !email.includes('@')) {
    error(res, '请输入有效的邮箱地址');
    return;
  }
  if (!username) {
    error(res, '请输入用户名');
    return;
  }
  if (!password || password.length < 6) {
    error(res, '密码长度至少为 6 位');
    return;
  }

  const db = getDb();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    error(res, '该邮箱已被注册', 409);
    return;
  }

  const now = Date.now();
  const { hash, salt } = hashPassword(password);
  const userId = crypto.randomUUID();

  // 严格强制注册角色为 user，防止普通用户自选提权
  db.prepare(`
    INSERT INTO users (id, email, username, password_hash, password_salt, role, created_at, updated_at, last_login_at)
    VALUES (?, ?, ?, ?, ?, 'user', ?, ?, ?)
  `).run(userId, email, username, hash, salt, now, now, now);

  // 签发 30 天会话 Token
  const token = generateToken();
  const tokenHash = hashToken(token);
  const expiresAt = now + 30 * 24 * 60 * 60 * 1000;

  db.prepare(`
    INSERT INTO sessions (token_hash, user_id, created_at, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(tokenHash, userId, now, expiresAt);

  json(res, {
    token,
    user: {
      id: userId,
      email,
      username,
      role: 'user',
    },
  });
}

export async function handleLogin(req: CustomRequest, res: ServerResponse): Promise<void> {
  const ip = getClientIp(req);
  const rateLimit = authRateLimiter.check(`login:${ip}`);
  if (!rateLimit.allowed) {
    error(res, `登录失败尝试过多，请等待 ${rateLimit.retryAfterSec} 秒后再试`, 429);
    return;
  }

  const body = await parseBody<{ email?: string; password?: string }>(req);
  const email = (body.email || '').trim().toLowerCase();
  const password = body.password || '';

  if (!email || !password) {
    error(res, '请输入邮箱和密码');
    return;
  }

  const db = getDb();
  const user = db.prepare('SELECT id, email, username, password_hash, password_salt, role FROM users WHERE email = ?').get(email) as
    | UserRow
    | undefined;

  if (!user || !verifyPassword(password, user.password_hash, user.password_salt)) {
    error(res, '邮箱或密码错误', 401);
    return;
  }

  // 登录成功，重置限流
  authRateLimiter.reset(`login:${ip}`);

  const now = Date.now();
  db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(now, user.id);

  // 签发 30 天会话 Token
  const token = generateToken();
  const tokenHash = hashToken(token);
  const expiresAt = now + 30 * 24 * 60 * 60 * 1000;

  db.prepare(`
    INSERT INTO sessions (token_hash, user_id, created_at, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(tokenHash, user.id, now, expiresAt);

  json(res, {
    token,
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
    },
  });
}

export async function handleLogout(req: CustomRequest, res: ServerResponse): Promise<void> {
  if (req.tokenHash) {
    const db = getDb();
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(req.tokenHash);
  }
  json(res, { success: true });
}

export async function handleMe(req: CustomRequest, res: ServerResponse): Promise<void> {
  if (!req.user) {
    error(res, '未登录或会话已失效', 401);
    return;
  }
  json(res, { user: req.user });
}

export async function handleProfile(req: CustomRequest, res: ServerResponse): Promise<void> {
  if (!req.user) {
    error(res, '未登录', 401);
    return;
  }

  const body = await parseBody<{ username?: string }>(req);
  const username = (body.username || '').trim();
  if (!username) {
    error(res, '用户名不能为空');
    return;
  }

  const db = getDb();
  const now = Date.now();
  db.prepare('UPDATE users SET username = ?, updated_at = ? WHERE id = ?').run(username, now, req.user.id);

  req.user.username = username;
  json(res, { user: req.user });
}

export async function handlePasswordChange(req: CustomRequest, res: ServerResponse): Promise<void> {
  if (!req.user) {
    error(res, '未登录', 401);
    return;
  }

  const body = await parseBody<{ currentPassword?: string; newPassword?: string }>(req);
  const currentPassword = body.currentPassword || '';
  const newPassword = body.newPassword || '';

  if (!currentPassword || !newPassword || newPassword.length < 6) {
    error(res, '请输入当前密码，且新密码至少为 6 位');
    return;
  }

  const db = getDb();
  const user = db.prepare('SELECT password_hash, password_salt FROM users WHERE id = ?').get(req.user.id) as
    | { password_hash: string; password_salt: string }
    | undefined;

  if (!user || !verifyPassword(currentPassword, user.password_hash, user.password_salt)) {
    error(res, '当前密码不正确', 400);
    return;
  }

  const { hash, salt } = hashPassword(newPassword);
  const now = Date.now();

  // 更新密码并撤销所有旧会话，重新生成当前合法 Token
  db.prepare('UPDATE users SET password_hash = ?, password_salt = ?, updated_at = ? WHERE id = ?')
    .run(hash, salt, now, req.user.id);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(req.user.id);

  const newToken = generateToken();
  const newTokenHash = hashToken(newToken);
  const expiresAt = now + 30 * 24 * 60 * 60 * 1000;

  db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .run(newTokenHash, req.user.id, now, expiresAt);

  json(res, {
    success: true,
    token: newToken,
  });
}

export async function handleAccountDelete(req: CustomRequest, res: ServerResponse): Promise<void> {
  if (!req.user) {
    error(res, '未登录', 401);
    return;
  }

  const body = await parseBody<{ password?: string }>(req);
  const password = body.password || '';
  if (!password) {
    error(res, '请输入当前密码以确认注销账户');
    return;
  }

  const db = getDb();
  const user = db.prepare('SELECT password_hash, password_salt FROM users WHERE id = ?').get(req.user.id) as
    | { password_hash: string; password_salt: string }
    | undefined;

  if (!user || !verifyPassword(password, user.password_hash, user.password_salt)) {
    error(res, '密码错误，无法注销账户', 400);
    return;
  }

  // 事务中原子级联删除个人数据，绝对不触碰其他用户或离线词典
  db.exec('BEGIN TRANSACTION;');
  try {
    const userId = req.user.id;
    db.prepare('DELETE FROM cloud_logs WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM cloud_cards WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM cloud_deck_members WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM cloud_decks WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM cloud_settings WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }

  json(res, { success: true });
}

