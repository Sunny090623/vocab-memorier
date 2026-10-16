import crypto from 'node:crypto';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { initDatabase } from '../db.ts';
import { hashPassword } from '../crypto.ts';

// 支持两种传参格式与交互式输入：
// 1. 等号格式: node --experimental-strip-types server/scripts/initAdmin.ts --email=admin@vocab.local --password=your_password --username=系统管理员
// 2. 空格格式: npm run init:admin -- --email admin@vocab.local --password your_password --username 系统管理员
// 3. 交互模式: npm run init:admin
const args = process.argv.slice(2);
let email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
let password = process.env.ADMIN_PASSWORD || '';
let username = (process.env.ADMIN_USERNAME || '').trim();

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg.startsWith('--email=')) {
    email = arg.slice('--email='.length).trim().toLowerCase();
  } else if (arg === '--email' && args[i + 1]) {
    email = args[++i].trim().toLowerCase();
  } else if (arg.startsWith('--password=')) {
    password = arg.slice('--password='.length);
  } else if (arg === '--password' && args[i + 1]) {
    password = args[++i];
  } else if (arg.startsWith('--username=')) {
    username = arg.slice('--username='.length).trim();
  } else if (arg === '--username' && args[i + 1]) {
    username = args[++i].trim();
  }
}

async function main() {
  if (!email || !password) {
    if (input.isTTY) {
      const rl = readline.createInterface({ input, output });
      try {
        if (!email) {
          const ansEmail = await rl.question('请输入管理员邮箱 (默认 admin@vocab.local): ');
          email = (ansEmail.trim() || 'admin@vocab.local').toLowerCase();
        }
        if (!password) {
          const ansPwd = await rl.question('请输入管理员密码 (至少 6 位): ');
          password = ansPwd;
        }
        if (!username) {
          const ansName = await rl.question('请输入管理员昵称 (默认 系统管理员): ');
          username = ansName.trim() || '系统管理员';
        }
      } finally {
        rl.close();
      }
    }
  }

  if (!username) {
    username = '系统管理员';
  }

  if (!email || !email.includes('@')) {
    console.error('错误: 请输入有效的邮箱地址。\n用法: npm run init:admin -- --email=admin@vocab.local --password=<密码> [--username=系统管理员]');
    process.exit(1);
  }

  if (!password || password.length < 6) {
    console.error('错误: 管理员密码长度至少为 6 位。\n用法: npm run init:admin -- --email=admin@vocab.local --password=<至少6位密码> [--username=系统管理员]');
    process.exit(1);
  }

  const db = initDatabase();
  const existing = db.prepare('SELECT id, role FROM users WHERE email = ?').get(email) as { id: string; role: string } | undefined;

  const { hash, salt } = hashPassword(password);
  const now = Date.now();

  if (existing) {
    db.prepare('UPDATE users SET password_hash = ?, password_salt = ?, username = ?, role = ?, updated_at = ? WHERE id = ?')
      .run(hash, salt, username, 'admin', now, existing.id);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(existing.id);
    console.log(`✅ 账户 ${email} (${username}) 已成功设为管理员并更新密码！`);
  } else {
    const userId = crypto.randomUUID();
    db.prepare(`
      INSERT INTO users (id, email, username, password_hash, password_salt, role, created_at, updated_at, last_login_at)
      VALUES (?, ?, ?, ?, ?, 'admin', ?, ?, NULL)
    `).run(userId, email, username, hash, salt, now, now);
    console.log(`✅ 管理员 ${email} (${username}) 创建成功！`);
  }
}

main();
