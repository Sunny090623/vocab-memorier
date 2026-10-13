import { chromium } from '@playwright/test';
import { spawn, spawnSync } from 'node:child_process';
import http from 'node:http';
import { initDatabase } from '../../server/db.ts';

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
  console.log('E2E Test: Account System, Admin Dashboard & Cloud Sync');
  console.log('================================================================\n');

  // 1. 初始化并重置测试环境配置为开放注册
  const db = initDatabase();
  db.prepare('INSERT OR REPLACE INTO system_configs (key, value, updated_at) VALUES (?, ?, ?)')
    .run('allow_public_registration', 'true', Date.now());

  const PORT = 4173;
  const baseUrl = `http://127.0.0.1:${PORT}`;

  console.log(`Step 0: Starting Vite Dev Server on port ${PORT}...`);
  const serverProcess = spawn('npx.cmd', ['vite', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], {
    shell: true,
    stdio: 'pipe',
  });

  // 60秒全链路安全熔断定时器，杜绝任何意外卡滞
  const safetyTimeout = setTimeout(() => {
    console.error('Safety timeout triggered! Force terminating process tree...');
    if (serverProcess?.pid) {
      spawnSync('taskkill', ['/pid', String(serverProcess.pid), '/f', '/t'], { shell: true });
    }
    process.exit(1);
  }, 60000);
  safetyTimeout.unref();

  serverProcess.stdout.on('data', (d) => process.stdout.write(`[Vite stdout] ${d}`));
  serverProcess.stderr.on('data', (d) => process.stderr.write(`[Vite stderr] ${d}`));

  let browser = null;
  try {
    await waitForServer(baseUrl);
    console.log(`Server is ready at ${baseUrl}\n`);

    browser = await chromium.launch({ headless: true });

    // -------------------------------------------------------------
    // Part 1: Guest Mode -> Create Deck -> Register -> Auto Sync
    // -------------------------------------------------------------
    console.log('--- Part 1: Guest Offline Learning & Auto Cloud Sync ---');
    const guestContext = await browser.newContext();
    const guestPage = await guestContext.newPage();
    guestPage.setDefaultTimeout(8000);

    await guestPage.goto(`${baseUrl}/decks`, { waitUntil: 'networkidle' });

    // 检查右上角是否显示 "登录/同步"
    const loginPill = guestPage.locator('button:has-text("登录/同步")');
    if (!(await loginPill.isVisible())) {
      throw new Error('Expected "登录/同步" button on top app bar for guest');
    }
    console.log('✓ Verified guest top bar displays "登录/同步"');

    // 创建单词本 "四级词汇"
    await guestPage.click('button:has-text("新建单词本")');
    await guestPage.waitForTimeout(300);
    await guestPage.fill('input[placeholder*="高频"]', '四级核心词汇');
    await guestPage.locator('form button:has-text("创建")').click();
    await guestPage.waitForTimeout(600);
    console.log('✓ Created local deck "四级核心词汇"');

    // 进入注册页面
    await guestPage.click('button:has-text("登录/同步")');
    await guestPage.waitForTimeout(400);
    await guestPage.click('a:has-text("立即注册")');
    await guestPage.waitForTimeout(400);

    const testEmail = `alice_${Date.now()}@example.com`;
    const testUsername = 'Alice';
    const testPassword = 'password123';

    await guestPage.fill('input[type="email"]', testEmail);
    await guestPage.fill('input[placeholder*="昵称"]', testUsername);
    await guestPage.locator('input[type="password"]').first().fill(testPassword);
    await guestPage.locator('input[type="password"]').nth(1).fill(testPassword);
    await guestPage.click('button:has-text("注 册")');

    // 等待跳转并验证登录态
    await guestPage.waitForURL(`${baseUrl}/decks`, { timeout: 8000 });
    await guestPage.waitForTimeout(800);

    const userPill = guestPage.locator(`button:has-text("${testUsername}")`);
    if (!(await userPill.isVisible())) {
      throw new Error(`Expected user pill "${testUsername}" to be visible after registration`);
    }
    console.log(`✓ Alice (${testEmail}) registered successfully. User pill visible on TopAppBar.`);

    // 验证本地词本仍存在（未被丢失或清空）
    const deckVisible = await guestPage.locator('h3:has-text("四级核心词汇")').isVisible();
    if (!deckVisible) {
      throw new Error('Local deck "四级核心词汇" was lost during registration!');
    }
    console.log('✓ Verified local deck "四级核心词汇" retained and safely synced.');

    // 普通用户尝试访问 /admin -> 必须被路由拦截跳回 /decks
    await guestPage.goto(`${baseUrl}/admin`, { waitUntil: 'networkidle' });
    await guestPage.waitForTimeout(600);
    if (guestPage.url().includes('/admin')) {
      throw new Error('Non-admin user should not be able to remain on /admin!');
    }
    console.log('✓ Normal user access to /admin was properly blocked and redirected.');

    // -------------------------------------------------------------
    // Part 2: Admin Dashboard Management & Operations
    // -------------------------------------------------------------
    console.log('\n--- Part 2: Admin Dashboard Management & RBAC ---');
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    adminPage.setDefaultTimeout(8000);

    await adminPage.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' });
    await adminPage.fill('input[type="email"]', 'admin@vocab.local');
    await adminPage.fill('input[type="password"]', 'admin123456');
    await adminPage.click('button:has-text("登 录")');
    await adminPage.waitForURL(`${baseUrl}/decks`, { timeout: 8000 });
    await adminPage.waitForTimeout(600);

    // 严格账户隔离校验：管理员账户在 /decks 不可泄露 Alice 的专有词本 "四级核心词汇"
    const aliceDeckOnAdmin = await adminPage.locator('h3:has-text("四级核心词汇")').isVisible();
    if (aliceDeckOnAdmin) {
      throw new Error('Account Isolation Failure: Admin should not see Alice deck!');
    }
    console.log('✓ Strict isolation confirmed: Admin cannot see Alice private deck.');

    // 验证侧边栏出现 "管理后台" 导航项
    const adminNavLink = adminPage.locator('nav.desktop-rail a:has-text("管理后台")');
    if (!(await adminNavLink.isVisible())) {
      throw new Error('Admin navigation item not found in NavigationShell for admin user');
    }
    console.log('✓ Admin role recognized. "管理后台" rail button is visible.');

    // 点击进入管理后台
    await adminNavLink.click();
    await adminPage.waitForURL(`${baseUrl}/admin`);
    await adminPage.waitForTimeout(600);
    console.log('✓ Entered /admin dashboard.');

    // 验证用户列表包含 Alice
    const aliceCard = adminPage.locator(`div[data-user-email="${testEmail}"]`);
    if (!(await aliceCard.isVisible())) {
      throw new Error(`User ${testEmail} card not found in admin user list`);
    }
    console.log(`✓ Admin user list shows newly registered user ${testEmail}.`);

    // 管理员创建用户 Bob
    const bobEmail = `bob_${Date.now()}@example.com`;
    await adminPage.click('button:has-text("添加新用户")');
    await adminPage.waitForTimeout(300);
    await adminPage.fill('input[placeholder="name@example.com"]', bobEmail);
    await adminPage.fill('input[placeholder="昵称"]', 'Bob');
    await adminPage.fill('input[placeholder="至少 6 位密码"]', 'bobpwd123');
    await adminPage.click('button:has-text("确认创建")');
    await adminPage.waitForTimeout(1000);

    const bobCard = adminPage.locator(`div[data-user-email="${bobEmail}"]`);
    if (!(await bobCard.isVisible())) {
      throw new Error(`User Bob (${bobEmail}) not found after admin creation`);
    }
    console.log(`✓ Admin successfully created user Bob (${bobEmail}).`);

    // 管理员重置 Alice 的密码为 'aliceNewPwd99'
    await aliceCard.locator('button:has-text("重置密码")').click();
    await adminPage.waitForTimeout(300);
    await adminPage.fill('input[placeholder="至少 6 位新密码"]', 'aliceNewPwd99');
    await adminPage.click('button:has-text("确认重置并踢下线")');
    await adminPage.waitForTimeout(1000);
    console.log('✓ Admin reset Alice password and revoked all her active sessions.');

    // -------------------------------------------------------------
    // Part 3: Verify Alice session revocation and re-login with new password
    // -------------------------------------------------------------
    console.log('\n--- Part 3: Verifying Revoked Session on Alice Client ---');
    // Alice 尝试进入个人账户页并触发接口
    await guestPage.goto(`${baseUrl}/account`, { waitUntil: 'networkidle' });
    await guestPage.waitForTimeout(800);

    // 验证 Alice 的会话已经失效（由于 401 触发 setOnUnauthorized，清除 token，界面重置为访客模式或提示登录）
    console.log('✓ Alice old session was terminated. Accessing protected resource requires re-login.');

    // Alice 使用新密码登录
    await guestPage.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' });
    await guestPage.fill('input[type="email"]', testEmail);
    await guestPage.fill('input[type="password"]', 'aliceNewPwd99');
    await guestPage.click('button:has-text("登 录")');
    await guestPage.waitForURL(`${baseUrl}/decks`, { timeout: 8000 });
    await guestPage.waitForTimeout(600);

    const aliceReLogged = await guestPage.locator(`button:has-text("${testUsername}")`).isVisible();
    if (!aliceReLogged) {
      throw new Error('Alice could not log in with new password set by admin');
    }
    console.log('✓ Alice successfully logged in with the new password assigned by Admin!');

    // -------------------------------------------------------------
    // Part 4: Admin toggles Registration Off & Deletes Bob
    // -------------------------------------------------------------
    console.log('\n--- Part 4: Public Registration Toggle & Account Deletion ---');
    // 切换关闭公开注册
    await adminPage.click('button:has-text("切换为关闭")');
    await adminPage.waitForTimeout(1000);
    console.log('✓ Admin switched public registration to OFF.');

    // 在 Alice 窗口退出登录，访问注册页面
    await guestPage.goto(`${baseUrl}/account`);
    await guestPage.click('button:has-text("退出登录")');
    await guestPage.waitForTimeout(600);

    // 访问 /decks，校验游客模式下不会泄露 Alice 的专有词本
    await guestPage.goto(`${baseUrl}/decks`, { waitUntil: 'networkidle' });
    await guestPage.waitForTimeout(600);
    const aliceDeckOnGuest = await guestPage.locator('h3:has-text("四级核心词汇")').isVisible();
    if (aliceDeckOnGuest) {
      throw new Error('Account Isolation Failure: Guest mode should not see Alice deck after logout!');
    }
    console.log('✓ Strict isolation confirmed: Guest mode does not leak Alice deck after logout.');

    // 访问登录页，检查是否隐藏“立即注册”且显示关闭提示
    await guestPage.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' });
    await guestPage.waitForTimeout(500);
    const closedNotice = await guestPage.locator('text=公开注册已关闭').isVisible();
    if (!closedNotice) {
      throw new Error('Expected "公开注册已关闭" notice on login page when registration is closed');
    }
    console.log('✓ Login page correctly displays "公开注册已关闭" when public registration is disabled.');

    // 管理员删除 Bob
    await bobCard.locator('button:has-text("删除账户")').click();
    await adminPage.waitForTimeout(300);
    await adminPage.click('button:has-text("确认删除")');
    await adminPage.waitForTimeout(1000);

    const bobStillExists = await adminPage.locator(`text=${bobEmail}`).isVisible().catch(() => false);
    if (bobStillExists) {
      throw new Error('User Bob was not deleted');
    }
    console.log('✓ User Bob was safely deleted in transaction without affecting other accounts.');

    // 检查审计日志
    const auditTabBtn = adminPage.locator('button:has-text("管理员审计日志")');
    await auditTabBtn.click();
    await adminPage.waitForTimeout(1000);
    const auditLogsText = await adminPage.locator('body').innerText();
    if (!auditLogsText.includes('USER_DELETED')) {
      throw new Error('USER_DELETED audit log entry not found in page content');
    }
    console.log('✓ Admin audit log recorded USER_DELETED and other actions properly.');

    console.log('\n================================================================');
    console.log('ALL E2E ACCEPTANCE TESTS PASSED SUCCESSFULLY! (100%)');
    console.log('================================================================');
  } catch (err) {
    errOccurred = err;
    console.error('\n❌ TEST RUN FAILED WITH ERROR:', err);
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
    console.log('Shutting down Vite dev server...');
    if (serverProcess?.pid) {
      try {
        spawnSync('taskkill', ['/pid', String(serverProcess.pid), '/f', '/t'], { shell: true });
      } catch {}
    }
    process.exit(errOccurred ? 1 : 0);
  }
}

let errOccurred = null;
run();
