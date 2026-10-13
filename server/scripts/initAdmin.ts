import crypto from 'node:crypto';
import { initDatabase } from '../db.ts';
import { hashPassword } from '../crypto.ts';

// CLI 用法: node server/scripts/initAdmin.ts --email <email> --password <password> --username <username>
const args = process.argv.slice(2);
let email = '';
let password = '';
let username = '系统管理员';

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--email' && args[i + 1]) email = args[++i].trim().toLowerCase();
  if (args[i] === '--password' && args[i + 1]) password = args[++i];
  if (args[i] === '--username' && args[i + 1]) username = args[++i].trim();
}

if (!email || !password) {
  console.error('用法: tsx server/scripts/initAdmin.ts --email <邮箱> --password <密码> [--username <昵称>]');
  process.exit(1);
}

const db = initDatabase();
const existing = db.prepare('SELECT id, role FROM users WHERE email = ?').get(email) as { id: string; role: string } | undefined;

const { hash, salt } = hashPassword(password);
const now = Date.now();

if (existing) {
  db.prepare('UPDATE users SET password_hash = ?, password_salt = ?, role = ?, updated_at = ? WHERE id = ?')
    .run(hash, salt, 'admin', now, existing.id);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(existing.id);
  console.log(`用户 ${email} 已成功提升为管理员并更新密码！`);
} else {
  const userId = crypto.randomUUID();
  db.prepare(`
    INSERT INTO users (id, email, username, password_hash, password_salt, role, created_at, updated_at, last_login_at)
    VALUES (?, ?, ?, ?, ?, 'admin', ?, ?, NULL)
  `).run(userId, email, username, hash, salt, now, now);
  console.log(`管理员 ${email} (${username}) 创建成功！`);
}

