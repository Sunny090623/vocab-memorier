import crypto from 'node:crypto';
import { getDb } from './db.ts';
import { hashPassword } from './crypto.ts';

export function bootstrapAdmin(): boolean {
  const db = getDb();
  const adminRow = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").get() as { count: number };

  if (adminRow.count > 0) {
    return false;
  }

  const rawEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const rawPassword = process.env.ADMIN_PASSWORD;
  const username = (process.env.ADMIN_USERNAME || '系统管理员').trim();

  if (!rawEmail || !rawPassword) {
    return false;
  }

  if (!rawEmail.includes('@') || rawPassword.length < 6) {
    console.warn('[VocabServer] ADMIN_EMAIL 或 ADMIN_PASSWORD 格式无效（密码需至少 6 位），跳过自动初始化管理员。');
    return false;
  }

  const { hash, salt } = hashPassword(rawPassword);
  const userId = crypto.randomUUID();
  const now = Date.now();

  db.prepare(`
    INSERT INTO users (id, email, username, password_hash, password_salt, role, created_at, updated_at, last_login_at)
    VALUES (?, ?, ?, ?, ?, 'admin', ?, ?, NULL)
  `).run(userId, rawEmail, username, hash, salt, now, now);

  console.log(`[VocabServer] 首次启动通过环境变量初始化管理员账户: ${rawEmail}`);
  return true;
}

