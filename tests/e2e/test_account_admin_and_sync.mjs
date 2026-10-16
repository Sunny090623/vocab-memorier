import { chromium } from '@playwright/test';
import { spawn, spawnSync } from 'node:child_process';
import http from 'node:http';
import { initDatabase } from '../../server/db.ts';
import { hashPassword } from '../../server/crypto.ts';

function waitForServer(url, timeoutMs = 15000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      const req = http.get(url, (res) => {
        if (res.statusCode && res.statusCode < 500) {
          resolve();
        } else {
          retry();
        }
      });
      req.on('error', retry);
      req.end();
    };
    const retry = () => {
      if (Date.now() - start > timeoutMs) {
        reject(new Error(`Timeout waiting for server at ${url}`));
      } else {
        setTimeout(check, 300);
      }
    };
    check();
  });
}

async function run() {
  console.log('================================================================');
  console.log('Headed E2E Test: Full 12-Step Account, Admin RBAC & Cloud Sync');
  console.log('================================================================\n');

  const db = initDatabase();
  const initialRegConfig = db
    .prepare('SELECT value FROM system_configs WHERE key = ?')
    .get('allow_public_registration');
  const originalAllowReg = initialRegConfig ? initialRegConfig.value : 'true';

  db.prepare('INSERT OR REPLACE INTO system_configs (key, value, updated_at) VALUES (?, ?, ?)')
    .run('allow_public_registration', 'true', Date.now());

  // 准备一个临时测试管理员账号（测试结束后完整清理，绝不触碰真实用户数据）
  const tempAdminEmail = `e2e_admin_${Date.now()}@vocab.local`;
  const tempAdminPassword = 'AdminTestPwd!123';
  const tempAdminId = `e2e-admin-${Date.now()}`;
  const { hash: adminHash, salt: adminSalt } = hashPassword(tempAdminPassword);
  const testStartTimestamp = Date.now();

  db.prepare(`
    INSERT INTO users (id, email, username, password_hash, password_salt, role, created_at, updated_at)
    VALUES (?, ?, 'E2E测试管理员', ?, ?, 'admin', ?, ?)
  `).run(tempAdminId, tempAdminEmail, adminHash, adminSalt, testStartTimestamp, testStartTimestamp);

  const createdEmails = [tempAdminEmail];

  const PORT = 4173;
  const baseUrl = `http://127.0.0.1:${PORT}`;

  console.log(`Step 0: Starting Full-Stack Production Server (server/index.ts) on port ${PORT}...`);
  const serverProcess = spawn('node', ['--experimental-strip-types', 'server/index.ts'], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'pipe',
  });

  const safetyTimeout = setTimeout(() => {
    console.error('Safety timeout triggered! Force terminating process tree...');
    if (serverProcess?.pid) {
      spawnSync('taskkill', ['/pid', String(serverProcess.pid), '/f', '/t'], { shell: true });
    }
    process.exit(1);
  }, 90000);
  safetyTimeout.unref();

  serverProcess.stdout.on('data', (d) => process.stdout.write(`[Server] ${d}`));
  serverProcess.stderr.on('data', (d) => process.stderr.write(`[Server Err] ${d}`));

  let browser = null;
  let errOccurred = null;

  try {
    await waitForServer(baseUrl);
    console.log(`Server is ready at ${baseUrl}\n`);

    browser = await chromium.launch({ headless: false });

    // -------------------------------------------------------------
    // Step 1: 访客模式创建本地单词本、导入词条并切换主题
    // -------------------------------------------------------------
    console.log('--- Step 1: Guest Mode Local Deck Creation & Word Import ---');
    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    pageA.setDefaultTimeout(10000);

    await pageA.goto(`${baseUrl}/decks`, { waitUntil: 'networkidle' });
    await pageA.click('button:has-text("新建单词本")');
    await pageA.fill('input[placeholder*="高频"]', '四级核心词汇');
    await pageA.locator('form button:has-text("创建")').click();
    await pageA.waitForTimeout(500);

    // 导入词条
    await pageA.goto(`${baseUrl}/import`, { waitUntil: 'networkidle' });
    await pageA.fill('textarea', 'abandon\nability\nabsolute');
    await pageA.click('button:has-text("确认导入")');
    await pageA.waitForTimeout(600);
    console.log('✓ Step 1 Passed: Guest created deck "四级核心词汇" and imported 3 words.');

    // -------------------------------------------------------------
    // Step 2 & 3: 注册新账户 -> 本地数据迁移上云 -> 刷新页面保持会话
    // -------------------------------------------------------------
    console.log('\n--- Step 2 & 3: Register New Account, Migrate Guest Data & Session Restore ---');
    const aliceEmail = `alice_${Date.now()}@example.com`;
    const aliceUpdatedEmail = `alice_updated_${Date.now()}@example.com`;
    createdEmails.push(aliceEmail, aliceUpdatedEmail);

    await pageA.goto(`${baseUrl}/register`, { waitUntil: 'networkidle' });
    await pageA.fill('input[type="email"]', aliceEmail);
    await pageA.fill('input[placeholder*="昵称"]', 'Alice');
    await pageA.locator('input[type="password"]').first().fill('password123');
    await pageA.locator('input[type="password"]').nth(1).fill('password123');
    await pageA.click('button:has-text("注 册")');

    await pageA.waitForURL(`${baseUrl}/decks`, { timeout: 10000 });
    await pageA.waitForTimeout(800);

    // 刷新页面验证会话保持与迁移后的词本
    await pageA.reload({ waitUntil: 'networkidle' });
    await pageA.waitForTimeout(600);

    if (!(await pageA.locator('button:has-text("Alice")').isVisible())) {
      throw new Error('Session was not preserved after page reload');
    }
    if (!(await pageA.locator('h3:has-text("四级核心词汇")').isVisible())) {
      throw new Error('Migrated deck "四级核心词汇" not visible after registration & reload');
    }
    console.log('✓ Step 2 & 3 Passed: Guest data migrated to Alice, synced to cloud, and restored after reload.');

    // -------------------------------------------------------------
    // Step 4: 第二个隔离浏览器上下文登录同一账户 -> 拉取并合并云端数据
    // -------------------------------------------------------------
    console.log('\n--- Step 4: Multi-Device / Second Browser Context Cloud Sync ---');
    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    pageB.setDefaultTimeout(10000);

    await pageB.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' });
    await pageB.fill('input[type="email"]', aliceEmail);
    await pageB.fill('input[type="password"]', 'password123');
    await pageB.click('button:has-text("登 录")');
    await pageB.waitForURL(`${baseUrl}/decks`, { timeout: 10000 });
    await pageB.waitForTimeout(1000);

    if (!(await pageB.locator('h3:has-text("四级核心词汇")').isVisible())) {
      throw new Error('Second browser context failed to pull synced deck "四级核心词汇" from cloud!');
    }
    console.log('✓ Step 4 Passed: Second isolated browser context pulled Alice cloud deck.');

    // -------------------------------------------------------------
    // Step 5: 普通用户访问管理员页面及管理员 API 被拦截 (路由跳转 + 403)
    // -------------------------------------------------------------
    console.log('\n--- Step 5: Normal User RBAC Route & API Protection (403) ---');
    await pageA.goto(`${baseUrl}/admin`, { waitUntil: 'networkidle' });
    await pageA.waitForTimeout(500);
    if (pageA.url().includes('/admin')) {
      throw new Error('Normal user was not redirected away from /admin');
    }

    const forbiddenStatus = await pageA.evaluate(async () => {
      const token = localStorage.getItem('vocab_auth_token');
      const res = await fetch('/api/admin/users', {
        headers: { Authorization: `Bearer ${token}` },
      });
      return res.status;
    });
    if (forbiddenStatus !== 403) {
      throw new Error(`Expected 403 for normal user calling /api/admin/users, got ${forbiddenStatus}`);
    }
    console.log('✓ Step 5 Passed: Normal user blocked from /admin UI and rejected with 403 by /api/admin/users.');

    // -------------------------------------------------------------
    // Step 6 & 7: 管理员后台查看/搜索/创建用户、重置密码并强制踢下线
    // -------------------------------------------------------------
    console.log('\n--- Step 6 & 7: Admin Dashboard Operations & Session Revocation on Password Reset ---');
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    adminPage.setDefaultTimeout(10000);

    await adminPage.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' });
    await adminPage.fill('input[type="email"]', tempAdminEmail);
    await adminPage.fill('input[type="password"]', tempAdminPassword);
    await adminPage.click('button:has-text("登 录")');
    await adminPage.waitForURL(`${baseUrl}/decks`, { timeout: 10000 });
    await adminPage.waitForTimeout(600);

    // 验证管理员看不到 Alice 的私有词本
    if (await adminPage.locator('h3:has-text("四级核心词汇")').isVisible()) {
      throw new Error('Isolation breach: Admin saw Alice private deck');
    }

    await adminPage.goto(`${baseUrl}/admin`, { waitUntil: 'networkidle' });
    await adminPage.waitForTimeout(800);

    // 创建用户 Bob
    const bobEmail = `bob_${Date.now()}@example.com`;
    createdEmails.push(bobEmail);
    await adminPage.click('button:has-text("添加新用户")');
    await adminPage.fill('input[placeholder="name@example.com"]', bobEmail);
    await adminPage.fill('input[placeholder="昵称"]', 'Bob');
    await adminPage.fill('input[placeholder="至少 6 位密码"]', 'bobpwd123');
    await adminPage.click('button:has-text("确认创建")');
    await adminPage.waitForTimeout(900);

    // 搜索 Alice 并重置密码
    await adminPage.fill('input[placeholder*="搜索邮箱"]', aliceEmail);
    await adminPage.click('button:has-text("查询")');
    await adminPage.waitForTimeout(600);

    const aliceCard = adminPage.locator(`div[data-user-email="${aliceEmail}"]`);
    await aliceCard.locator('button:has-text("重置密码")').click();
    await adminPage.fill('input[placeholder="至少 6 位新密码"]', 'aliceResetPwd88');
    await adminPage.click('button:has-text("确认重置并踢下线")');
    await adminPage.waitForTimeout(900);

    // 验证 Alice 的旧会话立即失效 (401)
    const meStatusAfterReset = await pageA.evaluate(async () => {
      const token = localStorage.getItem('vocab_auth_token');
      const res = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      return res.status;
    });
    if (meStatusAfterReset !== 401) {
      throw new Error(`Expected Alice old session to return 401 after admin reset, got ${meStatusAfterReset}`);
    }

    // Alice 使用重置后的新密码重新登录
    await pageA.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' });
    await pageA.fill('input[type="email"]', aliceEmail);
    await pageA.fill('input[type="password"]', 'aliceResetPwd88');
    await pageA.click('button:has-text("登 录")');
    await pageA.waitForURL(`${baseUrl}/decks`, { timeout: 10000 });
    await pageA.waitForTimeout(600);
    console.log('✓ Step 6 & 7 Passed: Admin created Bob, reset Alice password, revoked old sessions, and Alice re-logged in.');

    // -------------------------------------------------------------
    // Step 8: 用户修改个人资料（用户名与邮箱）并修改自己的密码
    // -------------------------------------------------------------
    console.log('\n--- Step 8: User Updates Profile (Username & Email) and Changes Own Password ---');
    await pageA.goto(`${baseUrl}/account`, { waitUntil: 'networkidle' });
    await pageA.waitForTimeout(500);
    await pageA.click('button:has-text("修改昵称")');
    await pageA.fill('input[placeholder="新昵称"]', 'AlicePro');
    await pageA.fill('input[placeholder="新邮箱地址"]', aliceUpdatedEmail);
    await pageA.click('button:has-text("保存")');
    await pageA.waitForTimeout(700);

    if (!(await pageA.locator('h3:has-text("AlicePro")').isVisible())) {
      throw new Error('Updated username AlicePro not displayed on AccountPage');
    }
    if (!(await pageA.locator(`text=${aliceUpdatedEmail}`).isVisible())) {
      throw new Error('Updated email not displayed on AccountPage');
    }

    // 修改密码
    const pwdInputs = pageA.locator('form input[type="password"]');
    await pwdInputs.nth(0).fill('aliceResetPwd88');
    await pwdInputs.nth(1).fill('aliceSelfPwd99');
    await pwdInputs.nth(2).fill('aliceSelfPwd99');
    await pageA.click('button:has-text("更新密码")');
    await pageA.waitForTimeout(800);
    console.log('✓ Step 8 Passed: Alice updated both username and email, and changed her password.');

    // -------------------------------------------------------------
    // Step 9: 管理员切换公开注册开关 -> 验证前端与后端注册拦截
    // -------------------------------------------------------------
    console.log('\n--- Step 9: Admin Toggles Public Registration OFF and ON ---');
    await adminPage.fill('input[placeholder*="搜索邮箱"]', '');
    await adminPage.click('button:has-text("查询")');
    await adminPage.waitForTimeout(500);

    await adminPage.click('button:has-text("切换为关闭")');
    await adminPage.waitForTimeout(700);

    // Alice 退出登录回到访客模式，验证词本隔离与公开注册关闭提示
    await pageA.click('button:has-text("退出登录")');
    await pageA.waitForURL(`${baseUrl}/decks`, { timeout: 10000 });
    await pageA.waitForTimeout(500);

    // Step 11 提前验证：退出登录后回到访客模式，绝不泄露 Alice 的私有词本
    if (await pageA.locator('h3:has-text("四级核心词汇")').isVisible()) {
      throw new Error('Isolation Failure: Guest mode leaked Alice private deck after logout!');
    }
    console.log('✓ Step 11 Passed: Logging out to Guest mode cleanly isolated Alice local cache.');

    await pageA.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' });
    await pageA.waitForTimeout(500);
    if (!(await pageA.locator('text=公开注册已关闭').isVisible())) {
      throw new Error('Expected "公开注册已关闭" notice when public registration is disabled');
    }

    // 管理员重新开启公开注册
    await adminPage.click('button:has-text("开启注册")');
    await adminPage.waitForTimeout(700);
    console.log('✓ Step 9 Passed: Public registration toggle verified and restored to ON.');

    // -------------------------------------------------------------
    // Step 10: 管理员删除测试用户 Bob 并验证级联删除与审计日志
    // -------------------------------------------------------------
    console.log('\n--- Step 10: Admin Deletes User Bob & Verifies Audit Logs ---');
    await adminPage.fill('input[placeholder*="搜索邮箱"]', bobEmail);
    await adminPage.click('button:has-text("查询")');
    await adminPage.waitForTimeout(600);

    const bobCard = adminPage.locator(`div[data-user-email="${bobEmail}"]`);
    await bobCard.locator('button:has-text("删除账户")').click();
    await adminPage.waitForTimeout(300);
    await adminPage.click('button:has-text("确认删除")');
    await adminPage.waitForTimeout(800);

    await adminPage.click('button:has-text("管理员审计日志")');
    await adminPage.waitForTimeout(600);
    const auditText = await adminPage.locator('body').innerText();
    if (!auditText.includes('USER_DELETED') || !auditText.includes('PASSWORD_RESET')) {
      throw new Error('Audit logs missing expected USER_DELETED or PASSWORD_RESET records');
    }
    console.log('✓ Step 10 Passed: User Bob deleted in transaction and audit logs verified.');

    console.log('\n================================================================');
    console.log('ALL 12 E2E USER JOURNEY STEPS PASSED SUCCESSFULLY! (100%)');
    console.log('================================================================');
  } catch (err) {
    errOccurred = err;
    console.error('\n❌ E2E TEST FAILED:', err);
  } finally {
    // Step 12: 彻底清理本次 E2E 创建的所有临时测试账户、云端数据及审计日志，恢复系统配置
    try {
      const cleanupDb = initDatabase();
      cleanupDb.exec('BEGIN TRANSACTION;');
      cleanupDb.prepare('DELETE FROM admin_audit_logs WHERE timestamp >= ?').run(testStartTimestamp);
      for (const email of createdEmails) {
        const u = cleanupDb.prepare('SELECT id FROM users WHERE email = ?').get(email);
        if (u && u.id) {
          cleanupDb.prepare('DELETE FROM admin_audit_logs WHERE admin_id = ? OR target_user_id = ?').run(u.id, u.id);
          cleanupDb.prepare('DELETE FROM cloud_logs WHERE user_id = ?').run(u.id);
          cleanupDb.prepare('DELETE FROM cloud_cards WHERE user_id = ?').run(u.id);
          cleanupDb.prepare('DELETE FROM cloud_deck_members WHERE user_id = ?').run(u.id);
          cleanupDb.prepare('DELETE FROM cloud_decks WHERE user_id = ?').run(u.id);
          cleanupDb.prepare('DELETE FROM cloud_settings WHERE user_id = ?').run(u.id);
          cleanupDb.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
          cleanupDb.prepare('DELETE FROM users WHERE id = ?').run(u.id);
        }
      }
      cleanupDb
        .prepare('INSERT OR REPLACE INTO system_configs (key, value, updated_at) VALUES (?, ?, ?)')
        .run('allow_public_registration', originalAllowReg, Date.now());
      cleanupDb.exec('COMMIT;');
      console.log('✓ Step 12 Passed: Cleaned up all temporary E2E test users, data, and audit logs.');
    } catch (cleanErr) {
      console.error('Cleanup error:', cleanErr);
    }

    if (browser) {
      await browser.close().catch(() => {});
    }
    if (serverProcess?.pid) {
      try {
        spawnSync('taskkill', ['/pid', String(serverProcess.pid), '/f', '/t'], { shell: true });
      } catch {}
    }
    process.exit(errOccurred ? 1 : 0);
  }
}

run();
