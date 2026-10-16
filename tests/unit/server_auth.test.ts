import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { initDatabase, setDb, getDb } from '../../server/db.ts';
import { hashPassword, verifyPassword, generateToken, hashToken } from '../../server/crypto.ts';
import { authRateLimiter } from '../../server/rateLimiter.ts';
import { bootstrapAdmin } from '../../server/bootstrap.ts';
import {
  authenticate,
  handleRegister,
  handleLogin,
  handleLogout,
  handleMe,
  handleProfile,
  handlePasswordChange,
  handleAccountDelete,
  type CustomRequest,
} from '../../server/auth.ts';
import { handleAdminListUsers } from '../../server/admin.ts';

function createMockReqRes(options: {
  method?: string;
  url?: string;
  body?: unknown;
  token?: string;
  ip?: string;
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
      ...(options.ip ? { 'x-forwarded-for': options.ip } : {}),
      'content-type': 'application/json',
    },
    socket: { remoteAddress: options.ip || '127.0.0.1' },
  }) as unknown as CustomRequest;

  let statusCode = 200;
  let bodyStr = '';
  const headers: Record<string, string> = {};

  const res = {
    get statusCode() {
      return statusCode;
    },
    set statusCode(val: number) {
      statusCode = val;
    },
    setHeader(name: string, value: string) {
      headers[name.toLowerCase()] = value;
    },
    getHeader(name: string) {
      return headers[name.toLowerCase()];
    },
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

describe('Server Auth, Session, Rate Limiting & Privilege Escalation Tests', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    const db = initDatabase(':memory:');
    setDb(db);
    authRateLimiter.clearAll();
    delete process.env.ADMIN_EMAIL;
    delete process.env.ADMIN_PASSWORD;
    delete process.env.ADMIN_USERNAME;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('scrypt加盐哈希与timingSafeEqual验证正确', () => {
    const raw = 'myPassword123!';
    const { hash, salt } = hashPassword(raw);

    expect(hash).toBeTruthy();
    expect(salt).toBeTruthy();
    expect(hash.length).toBe(128);

    expect(verifyPassword(raw, hash, salt)).toBe(true);
    expect(verifyPassword('wrongPassword', hash, salt)).toBe(false);
    expect(verifyPassword('', hash, salt)).toBe(false);
  });

  it('32字节随机Token生成及SHA-256摘要计算符合规范', () => {
    const token1 = generateToken();
    const token2 = generateToken();
    expect(token1).not.toBe(token2);
    expect(token1.length).toBe(64);

    const hash1 = hashToken(token1);
    const hash2 = hashToken(token1);
    expect(hash1).toBe(hash2);
    expect(hash1.length).toBe(64);
  });

  it('管理员初始化：无环境变量时绝不创建硬编码默认管理员，仅在无管理员且提供环境变量时引导创建', () => {
    const db = getDb();

    // 1. 未设置环境变量时，不创建任何默认管理员
    const createdWithoutEnv = bootstrapAdmin();
    expect(createdWithoutEnv).toBe(false);
    const count0 = (db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").get() as { count: number }).count;
    expect(count0).toBe(0);

    // 2. 设置环境变量且当前无管理员时，成功创建首个管理员
    process.env.ADMIN_EMAIL = 'firstadmin@example.com';
    process.env.ADMIN_PASSWORD = 'StrongAdminPassword!1';
    process.env.ADMIN_USERNAME = '首任管理员';

    const createdWithEnv = bootstrapAdmin();
    expect(createdWithEnv).toBe(true);

    const admin = db.prepare("SELECT email, username, role FROM users WHERE role = 'admin'").get() as {
      email: string;
      username: string;
      role: string;
    };
    expect(admin.email).toBe('firstadmin@example.com');
    expect(admin.username).toBe('首任管理员');
    expect(admin.role).toBe('admin');

    // 3. 已存在管理员时，再次调用不会重复创建
    process.env.ADMIN_EMAIL = 'secondadmin@example.com';
    const createdAgain = bootstrapAdmin();
    expect(createdAgain).toBe(false);
    const countAfter = (db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").get() as { count: number }).count;
    expect(countAfter).toBe(1);
  });

  it('公开注册防提权：即使请求体注入 role=admin，注册出的账户依然强制为普通用户 user', async () => {
    const { req, res, getStatus, getJson } = createMockReqRes({
      method: 'POST',
      url: '/api/auth/register',
      body: {
        email: 'attacker@example.com',
        username: 'Attacker',
        password: 'password123',
        role: 'admin',
      },
    });

    await handleRegister(req, res);
    expect(getStatus()).toBe(200);
    const data = getJson();
    expect(data.user.role).toBe('user');

    // 使用该 Token 访问管理员接口必须返回 403
    const adminCall = createMockReqRes({
      method: 'GET',
      url: '/api/admin/users',
      token: data.token,
    });
    authenticate(adminCall.req);
    await handleAdminListUsers(adminCall.req, adminCall.res, new URL('http://localhost/api/admin/users'));
    expect(adminCall.getStatus()).toBe(403);
  });

  it('完整注册、登录、会话校验、个人资料修改（用户名与邮箱）及退出登录闭环', async () => {
    // 1. 注册
    const reg = createMockReqRes({
      method: 'POST',
      body: { email: 'alice@example.com', username: 'Alice', password: 'password123' },
    });
    await handleRegister(reg.req, reg.res);
    expect(reg.getStatus()).toBe(200);
    const regData = reg.getJson();
    expect(regData.token).toBeTruthy();
    expect(regData.user.email).toBe('alice@example.com');

    // 2. 重复邮箱注册返回 409
    const dupReg = createMockReqRes({
      method: 'POST',
      body: { email: 'alice@example.com', username: 'Alice2', password: 'password123' },
    });
    await handleRegister(dupReg.req, dupReg.res);
    expect(dupReg.getStatus()).toBe(409);

    // 3. 会话验证 (/api/auth/me)
    const meCall = createMockReqRes({ method: 'GET', token: regData.token });
    authenticate(meCall.req);
    await handleMe(meCall.req, meCall.res);
    expect(meCall.getStatus()).toBe(200);
    expect(meCall.getJson().user.username).toBe('Alice');

    // 4. 修改个人资料（同时修改用户名与邮箱，并忽略篡改 role）
    const profileCall = createMockReqRes({
      method: 'PUT',
      token: regData.token,
      body: { username: 'AliceUpdated', email: 'alice_new@example.com', role: 'admin' },
    });
    authenticate(profileCall.req);
    await handleProfile(profileCall.req, profileCall.res);
    expect(profileCall.getStatus()).toBe(200);
    expect(profileCall.getJson().user.username).toBe('AliceUpdated');
    expect(profileCall.getJson().user.email).toBe('alice_new@example.com');
    expect(profileCall.getJson().user.role).toBe('user');

    // 5. 退出登录并验证旧会话立即失效
    const logoutCall = createMockReqRes({ method: 'POST', token: regData.token });
    authenticate(logoutCall.req);
    await handleLogout(logoutCall.req, logoutCall.res);
    expect(logoutCall.getStatus()).toBe(200);

    const meAfterLogout = createMockReqRes({ method: 'GET', token: regData.token });
    authenticate(meAfterLogout.req);
    await handleMe(meAfterLogout.req, meAfterLogout.res);
    expect(meAfterLogout.getStatus()).toBe(401);

    // 6. 使用更新后的新邮箱登录
    const loginCall = createMockReqRes({
      method: 'POST',
      body: { email: 'alice_new@example.com', password: 'password123' },
    });
    await handleLogin(loginCall.req, loginCall.res);
    expect(loginCall.getStatus()).toBe(200);
    expect(loginCall.getJson().user.username).toBe('AliceUpdated');
  });

  it('密码修改：校验旧密码，成功后旧密码与所有旧设备会话全部失效，新密码生效', async () => {
    const reg = createMockReqRes({
      method: 'POST',
      body: { email: 'bob@example.com', username: 'Bob', password: 'oldPassword123' },
    });
    await handleRegister(reg.req, reg.res);
    const tokenDevice1 = reg.getJson().token;

    // 模拟第二台设备登录
    const login2 = createMockReqRes({
      method: 'POST',
      body: { email: 'bob@example.com', password: 'oldPassword123' },
    });
    await handleLogin(login2.req, login2.res);
    const tokenDevice2 = login2.getJson().token;

    // 错误的当前密码应被拒绝 (400)
    const badChange = createMockReqRes({
      method: 'POST',
      token: tokenDevice1,
      body: { currentPassword: 'wrongCurrentPassword', newPassword: 'newPassword456' },
    });
    authenticate(badChange.req);
    await handlePasswordChange(badChange.req, badChange.res);
    expect(badChange.getStatus()).toBe(400);

    // 正确的当前密码修改成功
    const goodChange = createMockReqRes({
      method: 'POST',
      token: tokenDevice1,
      body: { currentPassword: 'oldPassword123', newPassword: 'newPassword456' },
    });
    authenticate(goodChange.req);
    await handlePasswordChange(goodChange.req, goodChange.res);
    expect(goodChange.getStatus()).toBe(200);
    const newToken = goodChange.getJson().token;
    expect(newToken).toBeTruthy();

    // 旧设备1与旧设备2的 Token 均已失效
    const checkOld1 = createMockReqRes({ method: 'GET', token: tokenDevice1 });
    expect(authenticate(checkOld1.req)).toBeNull();
    const checkOld2 = createMockReqRes({ method: 'GET', token: tokenDevice2 });
    expect(authenticate(checkOld2.req)).toBeNull();

    // 新签发的 Token 有效
    const checkNew = createMockReqRes({ method: 'GET', token: newToken });
    expect(authenticate(checkNew.req)?.email).toBe('bob@example.com');

    // 旧密码无法登录 (401)，新密码可以登录 (200)
    const loginWithOld = createMockReqRes({
      method: 'POST',
      body: { email: 'bob@example.com', password: 'oldPassword123' },
    });
    await handleLogin(loginWithOld.req, loginWithOld.res);
    expect(loginWithOld.getStatus()).toBe(401);

    const loginWithNew = createMockReqRes({
      method: 'POST',
      body: { email: 'bob@example.com', password: 'newPassword456' },
    });
    await handleLogin(loginWithNew.req, loginWithNew.res);
    expect(loginWithNew.getStatus()).toBe(200);
  });

  it('服务端限流器：对高频登录与注册请求强制返回 429', async () => {
    const clientIp = '10.0.0.99';

    for (let i = 0; i < 10; i++) {
      const attempt = createMockReqRes({
        method: 'POST',
        ip: clientIp,
        body: { email: 'nonexistent@example.com', password: 'wrong' },
      });
      await handleLogin(attempt.req, attempt.res);
      expect(attempt.getStatus()).toBe(401);
    }

    // 第 11 次登录触发 429 限流
    const blockedLogin = createMockReqRes({
      method: 'POST',
      ip: clientIp,
      body: { email: 'nonexistent@example.com', password: 'wrong' },
    });
    await handleLogin(blockedLogin.req, blockedLogin.res);
    expect(blockedLogin.getStatus()).toBe(429);

    // 注册接口同样执行独立限流
    const regIp = '10.0.0.100';
    for (let i = 0; i < 10; i++) {
      const attempt = createMockReqRes({
        method: 'POST',
        ip: regIp,
        body: { email: 'invalid-email', username: 'u', password: '123' },
      });
      await handleRegister(attempt.req, attempt.res);
      expect(attempt.getStatus()).toBe(400);
    }

    const blockedReg = createMockReqRes({
      method: 'POST',
      ip: regIp,
      body: { email: 'valid@example.com', username: 'Valid', password: 'password123' },
    });
    await handleRegister(blockedReg.req, blockedReg.res);
    expect(blockedReg.getStatus()).toBe(429);
  });

  it('账户自主注销：校验密码并在事务中清理用户所有个人数据与会话', async () => {
    const reg = createMockReqRes({
      method: 'POST',
      body: { email: 'del@example.com', username: 'DeleteMe', password: 'delPassword123' },
    });
    await handleRegister(reg.req, reg.res);
    const { token, user } = reg.getJson();

    const delCall = createMockReqRes({
      method: 'DELETE',
      token,
      body: { password: 'delPassword123' },
    });
    authenticate(delCall.req);
    await handleAccountDelete(delCall.req, delCall.res);
    expect(delCall.getStatus()).toBe(200);

    const db = getDb();
    expect(db.prepare('SELECT id FROM users WHERE id = ?').get(user.id)).toBeUndefined();
    expect(db.prepare('SELECT token_hash FROM sessions WHERE user_id = ?').get(user.id)).toBeUndefined();
  });
});
