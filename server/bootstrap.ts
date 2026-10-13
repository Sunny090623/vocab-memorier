import crypto from 'node:crypto';
import { getDb } from './db.ts';
import { hashPassword } from './crypto.ts';

export function bootstrapAdmin(): void {
  const db = getDb();
  const adminRow = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").get() as { count: number };

  if (adminRow.count === 0) {
    const email = (process.env.ADMIN_EMAIL || 'admin@vocab.local').trim().toLowerCase();
    const password = process.env.ADMIN_PASSWORD || 'admin123456';
    const username = process.env.ADMIN_USERNAME || '系统管理员';

    const { hash, salt } = hashPassword(password);
    const userId = crypto.randomUUID();
    const now = Date.now();

    db.prepare(`
      INSERT INTO users (id, email, username, password_hash, password_salt, role, created_at, updated_at, last_login_at)
      VALUES (?, ?, ?, ?, ?, 'admin', ?, ?, NULL)
    `).run(userId, email, username, hash, salt, now, now);

    console.log(`[VocabServer] 首次启动自动初始化管理员账户: ${email}`);
  }
}

