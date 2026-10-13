import { describe, it, expect, beforeEach } from 'vitest';
import { initDatabase, setDb } from '../../server/db.ts';
import { hashPassword, verifyPassword, generateToken, hashToken } from '../../server/crypto.ts';
import { authRateLimiter } from '../../server/rateLimiter.ts';

describe('Server Auth & Crypto Unit Tests', () => {
  beforeEach(() => {
    // 每次测试使用独立的内存数据库
    const db = initDatabase(':memory:');
    setDb(db);
    authRateLimiter.clearAll();
  });

  it('scrypt加盐哈希与timingSafeEqual验证正确', () => {
    const raw = 'myPassword123!';
    const { hash, salt } = hashPassword(raw);

    expect(hash).toBeTruthy();
    expect(salt).toBeTruthy();
    expect(hash.length).toBe(128); // 64 bytes in hex

    // 正确密码
    expect(verifyPassword(raw, hash, salt)).toBe(true);

    // 错误密码
    expect(verifyPassword('wrongPassword', hash, salt)).toBe(false);

    // 空密码
    expect(verifyPassword('', hash, salt)).toBe(false);
  });

  it('32字节随机Token生成及SHA-256摘要计算符合规范', () => {
    const token1 = generateToken();
    const token2 = generateToken();
    expect(token1).not.toBe(token2);
    expect(token1.length).toBe(64); // 32 bytes in hex

    const hash1 = hashToken(token1);
    const hash2 = hashToken(token1);
    expect(hash1).toBe(hash2);
    expect(hash1.length).toBe(64); // sha256 hex
  });

  it('滑动窗口限流器有效阻止高频暴力请求', () => {
    const testKey = 'test-ip-127.0.0.1';

    // 允许前 10 次请求
    for (let i = 0; i < 10; i++) {
      const res = authRateLimiter.check(testKey);
      expect(res.allowed).toBe(true);
    }

    // 第 11 次应该被阻断
    const blockedRes = authRateLimiter.check(testKey);
    expect(blockedRes.allowed).toBe(false);
    expect(blockedRes.retryAfterSec).toBeGreaterThan(0);

    // 重置后应恢复允许
    authRateLimiter.reset(testKey);
    const resetRes = authRateLimiter.check(testKey);
    expect(resetRes.allowed).toBe(true);
  });

  it('数据库能够安全存储用户与会话，并保证邮箱唯一性', () => {
    const db = initDatabase(':memory:');
    const { hash, salt } = hashPassword('secret123');
    const now = Date.now();

    // 插入普通用户
    db.prepare(`
      INSERT INTO users (id, email, username, password_hash, password_salt, role, created_at, updated_at, last_login_at)
      VALUES (?, ?, ?, ?, ?, 'user', ?, ?, ?)
    `).run('u1', 'user1@test.com', 'Alice', hash, salt, now, now, now);

    // 重复邮箱插入应当抛出 UNIQUE 约束错误
    expect(() => {
      db.prepare(`
        INSERT INTO users (id, email, username, password_hash, password_salt, role, created_at, updated_at, last_login_at)
        VALUES (?, ?, ?, ?, ?, 'user', ?, ?, ?)
      `).run('u2', 'user1@test.com', 'Bob', hash, salt, now, now, now);
    }).toThrow();

    // 创建会话
    const token = generateToken();
    const tokenHash = hashToken(token);
    db.prepare(`
      INSERT INTO sessions (token_hash, user_id, created_at, expires_at)
      VALUES (?, ?, ?, ?)
    `).run(tokenHash, 'u1', now, now + 86400000);

    const session = db.prepare('SELECT * FROM sessions WHERE token_hash = ?').get(tokenHash) as { user_id: string };
    expect(session.user_id).toBe('u1');

    // 级联删除：删除用户后会话应被自动级联清理
    db.prepare('DELETE FROM users WHERE id = ?').run('u1');
    const sessionAfter = db.prepare('SELECT * FROM sessions WHERE token_hash = ?').get(tokenHash);
    expect(sessionAfter).toBeUndefined();
  });
});

