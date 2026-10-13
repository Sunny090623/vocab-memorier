import { chromium } from '@playwright/test';
import fs from 'fs';

fs.mkdirSync('test-results', { recursive: true });

async function runBatchCycle21WordsE2E() {
  console.log('================================================================');
  console.log('Starting Headed E2E Test: 21 Unique Words 20+1 Batch Cycle Mode');
  console.log('================================================================\n');

  const consoleErrors = [];
  const pageErrors = [];

  // 1. 准备环境：启动有头浏览器 (headless: false)
  console.log('Step 1: Launching headed browser (headless: false)...');
  const browser = await chromium.launch({
    headless: false,
    slowMo: 25,
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 860 },
  });
  const page = await context.newPage();

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      console.error('[Browser Console Error]:', msg.text());
      consoleErrors.push(msg.text());
    }
  });

  page.on('pageerror', (err) => {
    console.error('[Page Uncaught Error]:', err.message);
    pageErrors.push(err.message);
  });

  page.on('dialog', async (dialog) => {
    console.log(`   [Dialog Auto-Confirm] "${dialog.message()}" -> Accepting`);
    await dialog.accept();
  });

  // 打开首页并检查环境
  console.log('Checking application on http://127.0.0.1:3000...');
  await page.goto('http://127.0.0.1:3000', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);

  // 清理可能遗留的旧测试单词本
  const testDeckName = 'E2E Test - Batch 20+1';
  const deleteLeftoverDecks = async () => {
    while (true) {
      const leftover = page.locator(`div:has(h3:has-text("${testDeckName}"))`).first();
      if (!(await leftover.isVisible().catch(() => false))) break;
      console.log('Cleaning up leftover test deck from earlier runs...');
      const delBtn = leftover.locator('button[title="删除单词本"], button:has-text("delete")').first();
      await delBtn.click();
      await page.waitForTimeout(800);
    }
  };
  await deleteLeftoverDecks();

  const existingDeckCards = page.locator('div[style*="cursor: pointer"]');
  const initialDeckCount = await existingDeckCards.count();
  console.log(`✓ Application is running. Existing decks count: ${initialDeckCount}`);

  // 2. 创建单词本并显式选择「组循环模式 (每组 20 词)」
  console.log('\nStep 2: Creating temporary test deck with explicit BATCH_CYCLE mode...');
  const createBtn = page.locator('button:has-text("新建单词本"), button:has-text("立即创建")').first();
  await createBtn.click();
  await page.waitForTimeout(400);

  const nameInput = page.locator('input[placeholder*="专四高频"]');
  await nameInput.fill(testDeckName);

  // 显式勾选「组循环模式」单选框
  const batchCycleRadio = page.locator('input[name="studyMode"][value="BATCH_CYCLE"]');
  await batchCycleRadio.check();
  const isChecked = await batchCycleRadio.isChecked();
  console.log(`   Explicit Batch Cycle Mode Radio checked: ${isChecked}`);
  if (!isChecked) {
    throw new Error('Failed to explicitly select BATCH_CYCLE mode!');
  }

  await page.locator('button:has-text("确定创建")').click();
  await page.waitForURL(/\/import/);
  console.log('✓ Deck created with BATCH_CYCLE mode, redirected to Import page');

  // 3. 导入正好 21 个唯一词 (example_21words.txt)
  console.log('\nStep 3: Importing exactly 21 unique words from ./example_21words.txt...');
  const text21 = fs.readFileSync('example_21words.txt', 'utf-8');
  const textarea = page.locator('textarea');
  await textarea.fill(text21);
  await page.waitForTimeout(1000);

  const summaryText = await page.locator('p:has-text("提取有效词数")').innerText();
  console.log(`   Import Summary: "${summaryText.replace(/\n/g, ' ')}"`);

  const previewRows = page.locator('table tbody tr');
  const previewRowCount = await previewRows.count();
  console.log(`   Preview table rows count: ${previewRowCount}`);
  if (previewRowCount !== 21) {
    throw new Error(`Expected exactly 21 preview rows, got ${previewRowCount}`);
  }

  await page.screenshot({ path: 'test-results/screenshot-batch-import-21words.png' });
  const confirmBtn = page.locator('button:has-text("确认导入")');
  await confirmBtn.click();
  await page.waitForURL(/\/study/);
  console.log('✓ 21 words confirmed and entered study page');
  await page.waitForTimeout(600);

  const studyUrl = page.url();
  const testDeckId = studyUrl.split('/study/')[1].split('?')[0];
  console.log(`   Active Test Deck ID: ${testDeckId}`);

  // 安装时钟拦截用于满足 90 秒 OR 独立测试判定
  await page.clock.install();

  // 4. 验证分组划分：第 1 组包含 20 词，第 2 组包含 1 词
  console.log('\nStep 4: Verifying 20 + 1 batch group split...');
  const headerSubtitle = await page.locator('header p').innerText();
  console.log(`   Header Subtitle: "${headerSubtitle}"`);

  if (!headerSubtitle.includes('第 1 / 2 组') || !headerSubtitle.includes('本组 0/20')) {
    throw new Error(`Expected Group 1 with 20 words, but got subtitle: "${headerSubtitle}"`);
  }
  console.log('✓ Group Split Confirmed: Total 2 groups, Group 1 contains 20 words, Total deck is 21 words.');

  // 5. 学习并通关第 1 组（20 词），验证第 1 组未通关前绝不可进入第 2 组
  console.log('\nStep 5: Completing Group 1 (20 words) with study flow...');

  // 验证第 1 组初始错词重排
  const firstWordHeading = (await page.locator('div h1').last().innerText()).trim();
  console.log(`   Card 1: "${firstWordHeading}" -> rating AGAIN (1)`);
  const revealBtn = page.locator('button:has-text("揭示答案")');
  if (await revealBtn.isVisible()) {
    await revealBtn.click();
  } else {
    await page.keyboard.press('Space');
  }
  await page.waitForTimeout(150);

  const againBtn = page.locator('button:has-text("不认识")');
  if (await againBtn.isVisible()) {
    await againBtn.click();
  } else {
    await page.keyboard.press('1');
  }
  // 等待卡片切换完成（避免固定 setTimeout 偶发与 IndexedDB 写入发生时序竞争）
  await page.waitForFunction(
    (prev) => {
      const headings = document.querySelectorAll('div h1');
      if (headings.length === 0) return false;
      const last = headings[headings.length - 1];
      return last && last.innerText.trim() !== prev;
    },
    firstWordHeading,
    { timeout: 5000 }
  );

  const secondWordHeading = (await page.locator('div h1').last().innerText()).trim();
  console.log(`✓ Offset verified: next word is "${secondWordHeading}"`);

  let reviewCount = 1;
  const group1SeenWords = new Set([firstWordHeading, secondWordHeading]);

  // 持续推进第 1 组学习直到第 1 组全部通关 (GROUP_COMPLETED)
  while (reviewCount < 180) {
    reviewCount++;

    // 检查第 1 组是否已通关 (GROUP_COMPLETED)
    const isGroupCompleted = await page.locator('text=第 1 组已全部通关').isVisible().catch(() => false);
    if (isGroupCompleted) {
      console.log(`\n🎉 Group 1 (20 words) completed successfully after ${reviewCount - 1} reviews!`);
      break;
    }

    // 检查是否意外直接触发全表通关（如果第 1 组未完成或第 2 组未学就全表通关，则为严重 bug）
    const isPrematureDeckCompleted = await page.locator('text=🏆 恭喜！本单词本已全员通关！').isVisible().catch(() => false);
    if (isPrematureDeckCompleted) {
      throw new Error('Deck prematurely completed before Group 2 was even started!');
    }

    const currentWord = (await page.locator('div h1').last().innerText().catch(() => '')).trim();
    if (currentWord) {
      group1SeenWords.add(currentWord);
      // 验证第 2 组唯一的单词 "culture" 绝对没有提前泄露进第 1 组
      if (currentWord === 'culture') {
        throw new Error('Group 2 word "culture" appeared in Group 1 queue before Group 1 completed!');
      }
    }

    const badgeText = await page.locator('span:has-text("阶段一：初学识记"), span:has-text("阶段二：独立测试")').first().innerText().catch(() => '');
    const subText = await page.locator('header p').innerText().catch(() => '');

    // 在阶段二中，若未通关词数 <= 8，快进 92s 满足 OR 独立测试条件
    if (badgeText.includes('阶段二')) {
      const match = subText.match(/本组\s*(\d+)\s*\/\s*(\d+)/);
      if (match) {
        const mastered = parseInt(match[1]);
        const groupTotal = parseInt(match[2]);
        if (groupTotal - mastered <= 8) {
          await page.clock.fastForward(92000);
        }
      }
    }

    // 答题：Space 揭示，3 认识
    const isQuestion = await page.locator('text=按 Space 或点击卡片揭示答案').isVisible().catch(() => false);
    if (isQuestion) {
      await page.keyboard.press('Space');
      await page.waitForTimeout(80);
    }
    await page.keyboard.press('3');
    await page.waitForTimeout(280);

    if (reviewCount % 15 === 0) {
      console.log(`   [Review #${reviewCount}] Current: "${currentWord}" | ${badgeText} | ${subText}`);
    }
  }

  // 验证第 1 组确切包含 20 个不同单词
  console.log(`   Unique words seen in Group 1: ${group1SeenWords.size}`);
  if (group1SeenWords.size !== 20) {
    throw new Error(`Expected exactly 20 unique words in Group 1, but saw ${group1SeenWords.size}: ${[...group1SeenWords].join(', ')}`);
  }
  console.log('✓ Verified: Group 1 contained exactly the first 20 unique words, and did NOT contain Group 2 word "culture".');

  // 截图：第 1 组通关界面
  await page.screenshot({ path: 'test-results/screenshot-batch-group1-completed.png' });
  console.log('✓ Group 1 completion screen captured.');

  // 6. 验证第 2 组在点击推进后才开启，且仅包含第 21 个单词
  console.log('\nStep 6: Proceeding to Group 2 (1 word)...');
  const nextGroupBtn = page.locator('button:has-text("进入下一组速背")');
  if (!(await nextGroupBtn.isVisible())) {
    throw new Error('"进入下一组速背" button not visible after Group 1 completion!');
  }
  await nextGroupBtn.click();
  await page.waitForTimeout(800);

  // 验证 Header 更新为 第 2 / 2 组 (本组 0/1)
  const group2Header = await page.locator('header p').innerText();
  console.log(`   Group 2 Header: "${group2Header}"`);
  if (!group2Header.includes('第 2 / 2 组') || !group2Header.includes('本组 0/1')) {
    throw new Error(`Expected Group 2 to show "第 2 / 2 组 ... 本组 0/1", got: "${group2Header}"`);
  }
  console.log('✓ Successfully entered Group 2. Subtitle confirms 1 word in Group 2.');

  // 验证展示的词正是第 21 个词 "culture"
  const g2FirstWord = (await page.locator('div h1').last().innerText()).trim();
  console.log(`   Group 2 current card: "${g2FirstWord}"`);
  if (g2FirstWord !== 'culture') {
    throw new Error(`Expected Group 2 card to be "culture", got "${g2FirstWord}"`);
  }
  console.log('✓ Confirmed Group 2 card is exactly the 21st word ("culture")!');

  // 完成第 2 组初学识记 (NEW -> LEARNING -> TESTING)
  console.log('Advancing Group 2 learning...');
  // 学习步骤 1 (NEW -> LEARNING step 1)
  await page.keyboard.press('Space');
  await page.waitForTimeout(100);
  await page.keyboard.press('3');
  await page.waitForTimeout(300);

  // 学习步骤 2 (LEARNING step 1 -> TESTING)
  await page.keyboard.press('Space');
  await page.waitForTimeout(100);
  await page.keyboard.press('3');
  await page.waitForTimeout(300);

  // 此时转入阶段二独立测试 (consecutiveSuccess = 0)
  const g2TestingBadge = await page.locator('span:has-text("阶段二：独立测试")').isVisible();
  console.log(`   Group 2 card entered TESTING phase: ${g2TestingBadge}`);

  // -------------------------------------------------------------
  // 审计核查 1：验证初始处于 TESTING 阶段，连对为 0，绝对不可提前通关
  // -------------------------------------------------------------
  const initialStreakBadge = await page.locator('text=★ 已连对').isVisible().catch(() => false);
  const isPrematureComplete0 = await page.locator('text=🏆 恭喜！本单词本已全员通关！').isVisible().catch(() => false);
  if (initialStreakBadge || isPrematureComplete0) {
    throw new Error('Group 2 card prematurely possessed streak or completed deck upon entering TESTING!');
  }
  console.log('   ✓ Confirmed: Group 2 card entered TESTING with streak 0, deck not completed.');

  // -------------------------------------------------------------
  // 第 1 次独立测试通过 (快进 92s 满足 >= 90s OR 条件)
  // -------------------------------------------------------------
  console.log('   Performing 1st independent test (fastForward 92s)...');
  await page.clock.fastForward(92000);
  await page.keyboard.press('Space');
  await page.waitForTimeout(100);
  await page.keyboard.press('3');
  await page.waitForTimeout(350);

  const streak1Visible = await page.locator('text=★ 已连对 1 次').isVisible();
  console.log(`   Group 2 card reached streak 1: ${streak1Visible}`);
  if (!streak1Visible) {
    throw new Error('Group 2 card failed to show streak 1 after first independent test!');
  }

  // -------------------------------------------------------------
  // 显式断言 1：仅获得 1 次有效独立答对时，通关判定绝对不可能发生！
  // -------------------------------------------------------------
  const isPrematureComplete1 = await page.locator('text=🏆 恭喜！本单词本已全员通关！').isVisible().catch(() => false);
  const subtitleAfterPass1 = await page.locator('header p').innerText().catch(() => '');
  console.log(`   Subtitle after 1st test pass: "${subtitleAfterPass1}"`);
  if (isPrematureComplete1 || !subtitleAfterPass1.includes('全表已通关 20/21')) {
    throw new Error(`Mastery occurred prematurely after only 1 test success! Deck subtitle: "${subtitleAfterPass1}"`);
  }
  console.log('   ✓ Explicit Assertion Passed: Mastery is IMPOSSIBLE after only 1 valid test success. Card remains in TESTING, deck remains 20/21.');

  // -------------------------------------------------------------
  // 显式断言 2：验证未满足“8 张其他卡片”且未满足“90 秒”时，提前答对绝对不得增加通关计数或毕业！
  // -------------------------------------------------------------
  console.log('   Testing early review rejection (< 90s, otherCards = 0)...');
  // 未快进时间，仅间隔 ~300ms (< 90s)，且单词组无其它卡片（otherCards = 0 < 8）
  await page.keyboard.press('Space');
  await page.waitForTimeout(100);
  await page.keyboard.press('3');
  await page.waitForTimeout(350);

  const isPrematureCompleteEarly = await page.locator('text=🏆 恭喜！本单词本已全员通关！').isVisible().catch(() => false);
  const stillStreak1 = await page.locator('text=★ 已连对 1 次').isVisible().catch(() => false);
  const subtitleAfterEarly = await page.locator('header p').innerText().catch(() => '');
  if (isPrematureCompleteEarly || !stillStreak1 || !subtitleAfterEarly.includes('全表已通关 20/21')) {
    throw new Error(`Early test bypassed independent test condition! Premature complete: ${isPrematureCompleteEarly}, streak1: ${stillStreak1}`);
  }
  console.log('   ✓ Explicit Assertion Passed: Next valid success strictly requires either 8 intervening cards or >= 90s. Early answer was rejected without increasing streak or granting mastery!');

  // -------------------------------------------------------------
  // 第 2 次独立测试通过 (快进 92s 满足 >= 90s OR 条件) -> 达成通关
  // -------------------------------------------------------------
  console.log('   Performing 2nd eligible independent test (fastForward 92s)...');
  await page.clock.fastForward(92000);
  await page.keyboard.press('Space');
  await page.waitForTimeout(100);
  await page.keyboard.press('3');
  await page.waitForTimeout(600);

  // -------------------------------------------------------------
  // 显式断言 3：第 2 次满足独立测试条件后，才正式达成通关
  // -------------------------------------------------------------
  const isDeckCompletedAfterPass2 = await page.locator('text=🏆 恭喜！本单词本已全员通关！').isVisible().catch(() => false);
  if (!isDeckCompletedAfterPass2) {
    throw new Error('Deck failed to complete after 2nd eligible independent test success!');
  }
  console.log('   ✓ Explicit Assertion Passed: Second eligible independent success achieved. Card graduated to MASTERED, full deck 21/21 completed!');

  // 7. 验证全表通关与统计报表
  console.log('\nStep 7: Verifying Full Deck Completion (21/21 words mastered)...');
  await page.waitForSelector('text=🏆 恭喜！本单词本已全员通关！', { timeout: 5000 });
  await page.screenshot({ path: 'test-results/screenshot-batch-full-completed.png' });
  console.log('✓ Full deck completion screen confirmed and captured.');

  const statsBtn = page.locator('button:has-text("查看学习统计")');
  await statsBtn.click();
  await page.waitForURL(/\/stats\//);
  await page.waitForTimeout(800);

  // 验证统计指标
  const statCardElements = page.locator('div[style*="grid"] > div');
  const cardCount = await statCardElements.count();
  const statValues = {};
  for (let i = 0; i < cardCount; i++) {
    const card = statCardElements.nth(i);
    const title = (await card.locator('span').first().innerText()).trim();
    const val = (await card.locator('h2').innerText()).trim();
    statValues[title] = val;
  }
  console.log('   Statistics Overview:', statValues);

  if (statValues['通关进度'] !== '21 / 21') {
    throw new Error(`Expected stats progress to be "21 / 21", got "${statValues['通关进度']}"`);
  }
  console.log('✓ Stats verified: 21 / 21 words fully mastered!');
  await page.screenshot({ path: 'test-results/screenshot-batch-stats.png' });

  // 8. 删除临时单词本并做清理验证
  console.log('\nStep 8: Deleting temporary test deck through web UI...');
  await page.goto('http://127.0.0.1:3000/decks', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);

  const targetDeckCard = page.locator(`div:has(h3:has-text("${testDeckName}"))`).first();
  const deleteBtn = targetDeckCard.locator('button[title="删除单词本"], button:has-text("delete")').first();
  await deleteBtn.click();
  await page.waitForTimeout(1000);

  const isDeckStillVisible = await page.locator(`text=${testDeckName}`).isVisible().catch(() => false);
  console.log(`✓ Temporary deck deleted from UI: ${!isDeckStillVisible}`);

  if (isDeckStillVisible) {
    throw new Error('Temporary test deck was not deleted from UI!');
  }

  // 数据库级联校验
  const dbCheck = await page.evaluate(async (deletedDeckId) => {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('vocab-memorier-user');
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction(['decks', 'cards', 'logs'], 'readonly');
        const deckReq = tx.objectStore('decks').get(deletedDeckId);
        const cardReq = tx.objectStore('cards').index('deckId').count(IDBKeyRange.only(deletedDeckId));
        const logReq = tx.objectStore('logs').index('deckId').count(IDBKeyRange.only(deletedDeckId));

        tx.oncomplete = () => {
          resolve({
            hasDeck: !!deckReq.result,
            remainingCards: cardReq.result,
            remainingLogs: logReq.result,
          });
        };
        tx.onerror = () => reject(tx.error);
      };
    });
  }, testDeckId);

  const dictCount = await page.evaluate(async () => {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('vocab-memorier-dict');
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction(['entries'], 'readonly');
        const countReq = tx.objectStore('entries').count();
        tx.oncomplete = () => {
          resolve(countReq.result);
        };
        tx.onerror = () => reject(tx.error);
      };
    });
  });

  console.log('   Dexie DB cascade cleanup check:', dbCheck, 'Dict count:', dictCount);
  if (dbCheck.hasDeck || dbCheck.remainingCards > 0 || dbCheck.remainingLogs > 0) {
    throw new Error(`Orphan data found in Dexie after deck deletion! ${JSON.stringify(dbCheck)}`);
  }
  if (dictCount === 0) {
    throw new Error('Global shared dictionary was unexpectedly modified or emptied!');
  }
  console.log('✓ Cascade deletion verified: 0 cards, 0 logs, 0 decks for testDeckId. Dictionary intact.');

  await page.screenshot({ path: 'test-results/screenshot-batch-cleaned-decks.png' });
  console.log('✓ Cleaned decks screenshot captured');

  await browser.close();

  console.log('\n================================================================');
  console.log('20+1 BATCH CYCLE E2E TEST COMPLETED SUCCESSFULLY!');
  console.log(`Browser console errors encountered: ${consoleErrors.length}`);
  console.log(`Page uncaught errors encountered: ${pageErrors.length}`);
  console.log('================================================================');

  if (consoleErrors.length > 0 || pageErrors.length > 0) {
    throw new Error(`Encountered ${consoleErrors.length} console errors and ${pageErrors.length} page errors.`);
  }
}

runBatchCycle21WordsE2E().catch((err) => {
  console.error('\nBatch Cycle 21 Words E2E Failed:', err);
  process.exit(1);
});

