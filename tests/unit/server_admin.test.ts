import { describe, it, expect, beforeEach } from 'vitest';
import { Readable } from 'node:stream';
import type { ServerResponse } from 'node:http';
import { initDatabase, setDb, getDb } from '../../server/db.ts';
import { hashPassword, generateToken, hashToken } from '../../server/crypto.ts';
import { authenticate, type CustomRequest } from '../../server/auth.ts';
import {
  handleAdminListUsers,
  handleAdminCreateUser,
  handleAdminResetPassword,
  handleAdminDeleteUser,
  handleAdminPutConfig,
  handleAdminAuditLogs,
} from '../../server/admin.ts';

function createMockReqRes(options: {
  method?: string;
  url?: string;
  body?: unknown;
  token?: string;
}): {
  req: CustomRequest;
  res: ServerResponse;
  getStatus: () => number;
  getJson: () => any;
} {
  const payload = options.body !== undefined ? JSON.stringify(options.body) : '';
  const stream = Readable.from(payload ? [Buffer.from(payload, 'utf-8')] : []);
  const req = Object.assign(stream, {
    method: options.method || 'GET',
    url: options.url || '/',
    headers: {
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      'content-type': 'application/json',
    },
    socket: { remoteAddress: '127.0.0.1' },
  }) as unknown as CustomRequest;

  let statusCode = 200;
  let bodyStr = '';
  const res = {
    get statusCode() {
      return statusCode;
    },
    set statusCode(val: number) {
      statusCode = val;
    },
    setHeader() {},
    end(chunk?: string) {
      if (chunk) bodyStr += chunk;
    },
  } as unknown as ServerResponse;

  return {
    req,
    res,
    getStatus: () => statusCode,
    getJson: () => (bodyStr ? JSON.parse(bodyStr) : null),
  };
}

describe('Server Admin & RBAC Unit Tests', () => {
  let adminToken = '';
  let userToken = '';
  const adminId = 'admin-1';
  const normalUserId = 'user-1';

  beforeEach(() => {
    const db = initDatabase(':memory:');
    setDb(db);
    const now = Date.now();
    const { hash, salt } = hashPassword('password123');

    db.prepare(`
      INSERT INTO users (id, email, username, password_hash, password_salt, role, created_at, updated_at)
      VALUES (?, 'admin@example.com', 'Admin', ?, ?, 'admin', ?, ?)
    `).run(adminId, hash, salt, now, now);

    db.prepare(`
      INSERT INTO users (id, email, username, password_hash, password_salt, role, created_at, updated_at)
      VALUES (?, 'user@example.com', 'NormalUser', ?, ?, 'user', ?, ?)
    `).run(normalUserId, hash, salt, now + 1, now + 1);

    adminToken = generateToken();
    userToken = generateToken();

    db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
      .run(hashToken(adminToken), adminId, now, now + 86400000);
    db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
      .run(hashToken(userToken), normalUserId, now, now + 86400000);
  });

  it('RBAC 权限拦截：未登录访问返回 401，普通用户访问管理员接口返回 403', async () => {
    const unauth = createMockReqRes({ method: 'GET', url: '/api/admin/users' });
    authenticate(unauth.req);
    await handleAdminListUsers(unauth.req, unauth.res, new URL('http://localhost/api/admin/users'));
    expect(unauth.getStatus()).toBe(401);

    const forbidden = createMockReqRes({ method: 'GET', url: '/api/admin/users', token: userToken });
    authenticate(forbidden.req);
    await handleAdminListUsers(forbidden.req, forbidden.res, new URL('http://localhost/api/admin/users'));
    expect(forbidden.getStatus()).toBe(403);
  });

  it('管理员支持查看、分页与搜索用户，且严格排除敏感字段', async () => {
    // 先由管理员再创建 2 名用户
    for (let i = 1; i <= 2; i++) {
      const createCall = createMockReqRes({
        method: 'POST',
        token: adminToken,
        body: { email: `extra${i}@example.com`, username: `ExtraUser${i}`, password: 'password123', role: 'user' },
      });
      authenticate(createCall.req);
      await handleAdminCreateUser(createCall.req, createCall.res);
      expect(createCall.getStatus()).toBe(200);
    }

    // 分页查询：page=1, pageSize=2
    const page1 = createMockReqRes({ method: 'GET', token: adminToken });
    authenticate(page1.req);
    await handleAdminListUsers(page1.req, page1.res, new URL('http://localhost/api/admin/users?page=1&pageSize=2'));
    expect(page1.getStatus()).toBe(200);
    const page1Data = page1.getJson();
    expect(page1Data.users.length).toBe(2);
    expect(page1Data.total).toBe(4);
    expect(page1Data.totalPages).toBe(2);
    expect(page1Data.users[0].password_hash).toBeUndefined();
    expect(page1Data.users[0].password_salt).toBeUndefined();

    // 关键字搜索
    const searchCall = createMockReqRes({ method: 'GET', token: adminToken });
    authenticate(searchCall.req);
    await handleAdminListUsers(searchCall.req, searchCall.res, new URL('http://localhost/api/admin/users?q=extra2'));
    const searchData = searchCall.getJson();
    expect(searchData.users.length).toBe(1);
    expect(searchData.users[0].email).toBe('extra2@example.com');
  });

  it('管理员重置用户密码后，强制撤销该用户的现存全部会话并写入审计日志', async () => {
    const resetCall = createMockReqRes({
      method: 'POST',
      token: adminToken,
      body: { newPassword: 'newResetPassword99' },
    });
    authenticate(resetCall.req);
    await handleAdminResetPassword(resetCall.req, resetCall.res, normalUserId);
    expect(resetCall.getStatus()).toBe(200);

    // 验证该用户原有的会话已失效
    const checkUser = createMockReqRes({ method: 'GET', token: userToken });
    expect(authenticate(checkUser.req)).toBeNull();

    // 检查审计日志
    const logsCall = createMockReqRes({ method: 'GET', token: adminToken });
    authenticate(logsCall.req);
    await handleAdminAuditLogs(logsCall.req, logsCall.res);
    const logs = logsCall.getJson().logs;
    expect(logs.some((l: any) => l.action === 'PASSWORD_RESET' && l.target_user_id === normalUserId)).toBe(true);
  });

  it('防自删、防删最后一名管理员与级联删除用户数据保护', async () => {
    // 1. 禁止管理员删除当前登录的自己
    const selfDel = createMockReqRes({ method: 'DELETE', token: adminToken });
    authenticate(selfDel.req);
    await handleAdminDeleteUser(selfDel.req, selfDel.res, adminId);
    expect(selfDel.getStatus()).toBe(400);

    // 2. 删除普通用户时，仅清理该用户的个人数据，不影响管理员数据
    const db = getDb();
    db.prepare(`
      INSERT INTO cloud_decks (id, user_id, name, study_mode, word_count, mastered_count, created_at, updated_at, is_deleted)
      VALUES ('d-user', ?, 'UserDeck', 'BATCH_CYCLE', 5, 0, 1000, 1000, 0),
             ('d-admin', ?, 'AdminDeck', 'BATCH_CYCLE', 5, 0, 1000, 1000, 0)
    `).run(normalUserId, adminId);

    const delUser = createMockReqRes({ method: 'DELETE', token: adminToken });
    authenticate(delUser.req);
    await handleAdminDeleteUser(delUser.req, delUser.res, normalUserId);
    expect(delUser.getStatus()).toBe(200);

    expect(db.prepare('SELECT id FROM users WHERE id = ?').get(normalUserId)).toBeUndefined();
    expect(db.prepare('SELECT id FROM cloud_decks WHERE user_id = ?').get(normalUserId)).toBeUndefined();
    expect(db.prepare('SELECT id FROM cloud_decks WHERE user_id = ?').get(adminId)).toBeTruthy();
  });

  it('公开注册开关切换状态持久化并记录审计日志', async () => {
    const toggleOff = createMockReqRes({
      method: 'PUT',
      token: adminToken,
      body: { allowPublicRegistration: false },
    });
    authenticate(toggleOff.req);
    await handleAdminPutConfig(toggleOff.req, toggleOff.res);
    expect(toggleOff.getStatus()).toBe(200);

    const db = getDb();
    const updated = db.prepare('SELECT value FROM system_configs WHERE key = ?').get('allow_public_registration') as {
      value: string;
    };
    expect(updated.value).toBe('false');
  });
});
