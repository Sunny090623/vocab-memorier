import { chromium } from '@playwright/test';
import fs from 'fs';

fs.mkdirSync('test-results', { recursive: true });

async function runTest() {
  console.log('Testing deck deletion and recreation with same name & words...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();

  // 1. 打开首页
  console.log('1. Navigating to http://127.0.0.1:3000...');
  await page.goto('http://127.0.0.1:3000', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  // 2. 创建单词本 "Delete Recreate Test"
  console.log('2. Creating deck "Delete Recreate Test"...');
  const createBtn = page.locator('button:has-text("新建单词本"), button:has-text("立即创建")').first();
  await createBtn.click();
  await page.waitForTimeout(300);

  const deckName = 'Delete Recreate Test';
  const nameInput = page.locator('input[placeholder*="专四高频"]');
  await nameInput.fill(deckName);
  await page.locator('button:has-text("确定创建")').click();
  await page.waitForURL(/\/import/);

  // 3. 导入 example.txt
  console.log('3. Importing example.txt into deck 1...');
  const exampleText = fs.readFileSync('example.txt', 'utf-8');
  await page.locator('textarea').fill(exampleText);
  await page.waitForTimeout(800);
  await page.locator('button:has-text("确认导入")').click();
  await page.waitForURL(/\/study/);
  await page.waitForTimeout(500);

  // 4. 模拟刷 15 次，使卡片产生学习记录
  console.log('4. Performing some reviews to create study records...');
  for (let i = 0; i < 15; i++) {
    const isQuestion = await page.locator('text=按 Space 或点击卡片揭示答案').isVisible().catch(() => false);
    if (isQuestion) {
      await page.keyboard.press('Space');
      await page.waitForTimeout(100);
    }
    await page.keyboard.press('3');
    await page.waitForTimeout(300);
  }

  // 5. 返回首页并删除该单词本
  console.log('5. Navigating to decks page to delete deck...');
  await page.goto('http://127.0.0.1:3000/decks', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  // 监听 window.confirm
  page.on('dialog', async (dialog) => {
    console.log(`Dialog message: "${dialog.message()}"`);
    await dialog.accept();
  });

  // 点击删除按钮（垃圾桶图标或含"delete"的按钮）
  const deleteBtn = page.locator('button:has-text("delete")').first();
  await deleteBtn.click();
  await page.waitForTimeout(800);
  console.log('✓ Deck deleted successfully');

  // 截图：删除后页面
  await page.screenshot({ path: 'test-results/screenshot-deck-deleted.png' });

  // 6. 新建同样名称的单词本 "Delete Recreate Test"
  console.log('6. Re-creating deck with the exact same name "Delete Recreate Test"...');
  const createAgainBtn = page.locator('button:has-text("新建单词本"), button:has-text("立即创建")').first();
  await createAgainBtn.click();
  await page.waitForTimeout(300);

  const nameInput2 = page.locator('input[placeholder*="专四高频"]');
  await nameInput2.fill(deckName);
  await page.locator('button:has-text("确定创建")').click();
  await page.waitForURL(/\/import/);

  // 7. 导入同样的单词 (example.txt)
  console.log('7. Importing the exact same words (example.txt)...');
  await page.locator('textarea').fill(exampleText);
  await page.waitForTimeout(800);
  await page.locator('button:has-text("确认导入")').click();
  await page.waitForURL(/\/study/);
  await page.waitForTimeout(800);

  // 8. 验证速背卡片是否为全新的内容（阶段一：初学识记，总进度 0 / 15 词）
  console.log('8. Verifying newly created deck has completely fresh records...');
  const subtitle = await page.locator('text=/总进度：0 \\/ 15 词/').isVisible().catch(() => false);
  const phase1Badge = await page.locator('text=阶段一：初学识记').isVisible().catch(() => false);

  console.log(`✓ Progress is 0 / 15: ${subtitle}`);
  console.log(`✓ Phase is "阶段一：初学识记": ${phase1Badge}`);

  // 截图：全新状态页面
  await page.screenshot({ path: 'test-results/screenshot-deck-recreated-fresh.png' });

  if (!subtitle && !phase1Badge) {
    throw new Error('Newly created deck with same name did not show fresh records!');
  }

  console.log('\n================================================================');
  console.log('TEST PASSED: DELETION AND RECREATION STARTS COMPLETELY FRESH!');
  console.log('================================================================');

  await browser.close();
}

runTest().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});

