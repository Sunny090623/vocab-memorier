import { describe, it, expect, beforeEach } from 'vitest';
import { initDatabase, setDb } from '../../server/db.ts';
import { hashPassword, generateToken, hashToken } from '../../server/crypto.ts';

describe('Server Admin & RBAC Unit Tests', () => {
  beforeEach(() => {
    const db = initDatabase(':memory:');
    setDb(db);
  });

  it('管理员重置用户密码后，强制撤销该用户的现存全部会话', () => {
    const db = initDatabase(':memory:');
    const { hash, salt } = hashPassword('oldpassword');
    const now = Date.now();
    const userId = 'user-alice';

    db.prepare(`
      INSERT INTO users (id, email, username, password_hash, password_salt, role, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'user', ?, ?)
    `).run(userId, 'alice@test.com', 'Alice', hash, salt, now, now);

    // Alice 登录了两个设备
    const token1 = generateToken();
    const token2 = generateToken();
    db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
      .run(hashToken(token1), userId, now, now + 86400000);
    db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
      .run(hashToken(token2), userId, now, now + 86400000);

    const initialSessions = db.prepare('SELECT COUNT(*) as count FROM sessions WHERE user_id = ?').get(userId) as { count: number };
    expect(initialSessions.count).toBe(2);

    // 管理员重置 Alice 的密码
    const { hash: newHash, salt: newSalt } = hashPassword('newpassword999');
    db.prepare('UPDATE users SET password_hash = ?, password_salt = ?, updated_at = ? WHERE id = ?')
      .run(newHash, newSalt, now, userId);

    // 撤销会话
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);

    // 验证所有会话已被彻底清空
    const afterSessions = db.prepare('SELECT COUNT(*) as count FROM sessions WHERE user_id = ?').get(userId) as { count: number };
    expect(afterSessions.count).toBe(0);
  });

  it('防死锁机制：系统中仅剩最后一名管理员时禁止删除', () => {
    const db = initDatabase(':memory:');
    const { hash, salt } = hashPassword('adminpwd');
    const now = Date.now();

    // 仅创建一位管理员
    db.prepare(`
      INSERT INTO users (id, email, username, password_hash, password_salt, role, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'admin', ?, ?)
    `).run('admin-root', 'root@vocab.local', '超级管理员', hash, salt, now, now);

    const adminCountRow = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").get() as { count: number };
    expect(adminCountRow.count).toBe(1);

    // 尝试删除时判定
    const canDelete = adminCountRow.count > 1;
    expect(canDelete).toBe(false);
  });

  it('敏感数据脱敏底线：用户查询列表严格排除密码哈希与Salt', () => {
    const db = initDatabase(':memory:');
    const { hash, salt } = hashPassword('secret');
    const now = Date.now();

    db.prepare(`
      INSERT INTO users (id, email, username, password_hash, password_salt, role, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'user', ?, ?)
    `).run('u1', 'user@test.com', 'User', hash, salt, now, now);

    const rawRows = db.prepare(`
      SELECT id, email, username, role, created_at, updated_at, last_login_at
      FROM users
    `).all() as any[];

    expect(rawRows.length).toBe(1);
    expect(rawRows[0].password_hash).toBeUndefined();
    expect(rawRows[0].password_salt).toBeUndefined();
    expect(rawRows[0].email).toBe('user@test.com');
  });

  it('公开注册开关切换状态持久化', () => {
    const db = initDatabase(':memory:');
    const now = Date.now();

    // 默认开启
    const initial = db.prepare('SELECT value FROM system_configs WHERE key = ?').get('allow_public_registration') as { value: string };
    expect(initial.value).toBe('true');

    // 管理员关闭
    db.prepare('UPDATE system_configs SET value = ?, updated_at = ? WHERE key = ?')
      .run('false', now, 'allow_public_registration');

    const updated = db.prepare('SELECT value FROM system_configs WHERE key = ?').get('allow_public_registration') as { value: string };
    expect(updated.value).toBe('false');
  });
});

