import crypto from 'node:crypto';
import type { ServerResponse } from 'node:http';
import { getDb } from './db.ts';
import type { UserRow } from './db.ts';
import { hashPassword } from './crypto.ts';
import { json, error, parseBody } from './httpUtils.ts';
import type { CustomRequest } from './auth.ts';

export function requireAdmin(req: CustomRequest, res: ServerResponse): boolean {
  if (!req.user) {
    error(res, '请先登录', 401);
    return false;
  }
  if (req.user.role !== 'admin') {
    error(res, '权限不足，仅管理员可执行该操作', 403);
    return false;
  }
  return true;
}

export async function handleAdminGetConfig(req: CustomRequest, res: ServerResponse): Promise<void> {
  if (!requireAdmin(req, res)) return;
  const db = getDb();
  const config = db.prepare('SELECT value FROM system_configs WHERE key = ?').get('allow_public_registration') as
    | { value: string }
    | undefined;
  json(res, { allowPublicRegistration: config?.value !== 'false' });
}

export async function handleAdminPutConfig(req: CustomRequest, res: ServerResponse): Promise<void> {
  if (!requireAdmin(req, res)) return;
  const body = await parseBody<{ allowPublicRegistration?: boolean }>(req);
  if (typeof body.allowPublicRegistration !== 'boolean') {
    error(res, '参数格式错误');
    return;
  }

  const db = getDb();
  const now = Date.now();
  db.prepare('INSERT OR REPLACE INTO system_configs (key, value, updated_at) VALUES (?, ?, ?)')
    .run('allow_public_registration', body.allowPublicRegistration ? 'true' : 'false', now);

  // 写入审计日志
  db.prepare(`
    INSERT INTO admin_audit_logs (id, admin_id, admin_email, action, target_user_id, target_user_email, details, timestamp)
    VALUES (?, ?, ?, 'CONFIG_CHANGED', NULL, NULL, ?, ?)
  `).run(
    crypto.randomUUID(),
    req.user!.id,
    req.user!.email,
    `将公开注册切换为: ${body.allowPublicRegistration ? '开放' : '关闭'}`,
    now
  );

  json(res, { success: true, allowPublicRegistration: body.allowPublicRegistration });
}

export async function handleAdminListUsers(req: CustomRequest, res: ServerResponse, url: URL): Promise<void> {
  if (!requireAdmin(req, res)) return;
  const q = (url.searchParams.get('q') || '').trim().toLowerCase();
  const pageParam = Number(url.searchParams.get('page'));
  const pageSizeParam = Number(url.searchParams.get('pageSize'));
  const hasPagination = url.searchParams.has('page') || url.searchParams.has('pageSize');
  const page = Number.isFinite(pageParam) && pageParam >= 1 ? Math.floor(pageParam) : 1;
  const pageSize = Number.isFinite(pageSizeParam) && pageSizeParam >= 1 ? Math.min(100, Math.floor(pageSizeParam)) : 20;

  const db = getDb();
  let whereClause = '';
  const whereParams: (string | number)[] = [];

  if (q) {
    whereClause = ` WHERE LOWER(u.email) LIKE ? OR LOWER(u.username) LIKE ? `;
    whereParams.push(`%${q}%`, `%${q}%`);
  }

  const countRow = db.prepare(`SELECT COUNT(*) as total FROM users u ${whereClause}`).get(...whereParams) as {
    total: number;
  };
  const total = countRow.total;

  let query = `
    SELECT 
      u.id, 
      u.email, 
      u.username, 
      u.role, 
      u.created_at, 
      u.updated_at, 
      u.last_login_at,
      (SELECT COUNT(*) FROM cloud_decks d WHERE d.user_id = u.id AND d.is_deleted = 0) as deck_count,
      (SELECT COUNT(*) FROM cloud_cards c WHERE c.user_id = u.id) as card_count
    FROM users u
    ${whereClause}
    ORDER BY u.created_at DESC
  `;

  const queryParams: (string | number)[] = [...whereParams];
  if (hasPagination) {
    const offset = (page - 1) * pageSize;
    query += ` LIMIT ? OFFSET ?`;
    queryParams.push(pageSize, offset);
  }

  const rows = db.prepare(query).all(...queryParams) as Array<{
    id: string;
    email: string;
    username: string;
    role: 'admin' | 'user';
    created_at: number;
    updated_at: number;
    last_login_at: number | null;
    deck_count: number;
    card_count: number;
  }>;

  // 严格脱敏：排除 password_hash 与 password_salt
  const users = rows.map((r) => ({
    id: r.id,
    email: r.email,
    username: r.username,
    role: r.role,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    lastLoginAt: r.last_login_at,
    deckCount: r.deck_count,
    cardCount: r.card_count,
  }));

  json(res, {
    users,
    total,
    page,
    pageSize: hasPagination ? pageSize : Math.max(total, 1),
    totalPages: hasPagination ? Math.max(1, Math.ceil(total / pageSize)) : 1,
  });
}

export async function handleAdminCreateUser(req: CustomRequest, res: ServerResponse): Promise<void> {
  if (!requireAdmin(req, res)) return;

  const body = await parseBody<{ email?: string; username?: string; password?: string; role?: string }>(req);
  const email = (body.email || '').trim().toLowerCase();
  const username = (body.username || '').trim();
  const password = body.password || '';
  const role = body.role === 'admin' ? 'admin' : 'user';

  if (!email || !email.includes('@')) {
    error(res, '请输入有效的邮箱地址');
    return;
  }
  if (!username) {
    error(res, '请输入用户名');
    return;
  }
  if (!password || password.length < 6) {
    error(res, '初始密码长度至少为 6 位');
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
  const newUserId = crypto.randomUUID();

  db.prepare(`
    INSERT INTO users (id, email, username, password_hash, password_salt, role, created_at, updated_at, last_login_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)
  `).run(newUserId, email, username, hash, salt, role, now, now);

  // 记录审计日志（严禁包含密码）
  db.prepare(`
    INSERT INTO admin_audit_logs (id, admin_id, admin_email, action, target_user_id, target_user_email, details, timestamp)
    VALUES (?, ?, ?, 'USER_CREATED', ?, ?, ?, ?)
  `).run(
    crypto.randomUUID(),
    req.user!.id,
    req.user!.email,
    newUserId,
    email,
    `创建新用户 [角色: ${role}]`,
    now
  );

  json(res, {
    user: {
      id: newUserId,
      email,
      username,
      role,
      createdAt: now,
      updatedAt: now,
    },
  });
}

export async function handleAdminResetPassword(
  req: CustomRequest,
  res: ServerResponse,
  targetUserId: string
): Promise<void> {
  if (!requireAdmin(req, res)) return;

  const body = await parseBody<{ newPassword?: string }>(req);
  const newPassword = body.newPassword || '';

  if (!newPassword || newPassword.length < 6) {
    error(res, '新密码长度至少为 6 位');
    return;
  }

  const db = getDb();
  const targetUser = db.prepare('SELECT id, email, username FROM users WHERE id = ?').get(targetUserId) as
    | { id: string; email: string; username: string }
    | undefined;

  if (!targetUser) {
    error(res, '目标用户不存在', 404);
    return;
  }

  const { hash, salt } = hashPassword(newPassword);
  const now = Date.now();

  // 更新用户密码哈希
  db.prepare('UPDATE users SET password_hash = ?, password_salt = ?, updated_at = ? WHERE id = ?')
    .run(hash, salt, now, targetUserId);

  // 核心安全机制：重置密码后立即强制撤销该用户的所有现存会话！使旧 Token 全部作废踢下线！
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(targetUserId);

  // 记录审计日志
  db.prepare(`
    INSERT INTO admin_audit_logs (id, admin_id, admin_email, action, target_user_id, target_user_email, details, timestamp)
    VALUES (?, ?, ?, 'PASSWORD_RESET', ?, ?, ?, ?)
  `).run(
    crypto.randomUUID(),
    req.user!.id,
    req.user!.email,
    targetUserId,
    targetUser.email,
    '管理员重置密码并注销所有活跃设备会话',
    now
  );

  json(res, { success: true, message: '密码已成功重置，该用户现存会话已全部注销失效' });
}

export async function handleAdminDeleteUser(
  req: CustomRequest,
  res: ServerResponse,
  targetUserId: string
): Promise<void> {
  if (!requireAdmin(req, res)) return;

  const db = getDb();
  const targetUser = db.prepare('SELECT id, email, username, role FROM users WHERE id = ?').get(targetUserId) as
    | UserRow
    | undefined;

  if (!targetUser) {
    error(res, '目标用户不存在', 404);
    return;
  }

  // 防自删保护：管理员无法在管理后台删除当前正在登录的自身账户
  if (targetUserId === req.user!.id) {
    error(res, '无法在管理后台删除当前正在登录的管理员账户', 400);
    return;
  }

  // 防死锁保护：如果目标用户是管理员，且系统中仅剩最后一名管理员，禁止删除
  if (targetUser.role === 'admin') {
    const adminCountRow = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").get() as {
      count: number;
    };
    if (adminCountRow.count <= 1) {
      error(res, '系统中仅剩最后一名管理员，禁止删除以防止失去管理权限', 400);
      return;
    }
  }

  // 事务中原子级联删除个人数据，保留历史审计日志记录，绝对不触碰其他用户或共享词典
  db.exec('PRAGMA foreign_keys = OFF;');
  db.exec('BEGIN TRANSACTION;');
  try {
    db.prepare('DELETE FROM cloud_logs WHERE user_id = ?').run(targetUserId);
    db.prepare('DELETE FROM cloud_cards WHERE user_id = ?').run(targetUserId);
    db.prepare('DELETE FROM cloud_deck_members WHERE user_id = ?').run(targetUserId);
    db.prepare('DELETE FROM cloud_decks WHERE user_id = ?').run(targetUserId);
    db.prepare('DELETE FROM cloud_settings WHERE user_id = ?').run(targetUserId);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(targetUserId);
    db.prepare('DELETE FROM users WHERE id = ?').run(targetUserId);

    // 记录审计日志
    const now = Date.now();
    db.prepare(`
      INSERT INTO admin_audit_logs (id, admin_id, admin_email, action, target_user_id, target_user_email, details, timestamp)
      VALUES (?, ?, ?, 'USER_DELETED', ?, ?, ?, ?)
    `).run(
      crypto.randomUUID(),
      req.user!.id,
      req.user!.email,
      targetUserId,
      targetUser.email,
      `删除用户 [用户名: ${targetUser.username}, 角色: ${targetUser.role}] 及其云端数据`,
      now
    );

    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  } finally {
    db.exec('PRAGMA foreign_keys = ON;');
  }

  json(res, { success: true, message: '用户及相关云端数据已彻底删除' });
}

export async function handleAdminAuditLogs(req: CustomRequest, res: ServerResponse): Promise<void> {
  if (!requireAdmin(req, res)) return;
  const db = getDb();
  const logs = db.prepare(`
    SELECT id, admin_id, admin_email, action, target_user_id, target_user_email, details, timestamp
    FROM admin_audit_logs
    ORDER BY timestamp DESC
    LIMIT 100
  `).all();
  json(res, { logs });
}

