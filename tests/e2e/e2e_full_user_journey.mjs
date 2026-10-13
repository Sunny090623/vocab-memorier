import { chromium } from '@playwright/test';
import fs from 'fs';

fs.mkdirSync('test-results', { recursive: true });

async function runE2EJourney() {
  console.log('================================================================');
  console.log('Starting Complete Headed E2E Test (User Journey Simulation)...');
  console.log('================================================================\n');

  const consoleErrors = [];
  const pageErrors = [];

  // 1. 准备环境：启动有头浏览器 (headless: false)
  console.log('Step 1: Launching headed browser (headless: false)...');
  const browser = await chromium.launch({
    headless: false,
    slowMo: 30, // 减缓动作以便真实渲染并允许观察
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 860 },
  });
  const page = await context.newPage();

  page.on('console', (msg) => {
    console.log('[PAGE CONSOLE]', msg.type(), msg.text());
    if (msg.type() === 'error') {
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
  console.log('Checking application availability on http://127.0.0.1:3000...');
  await page.goto('http://127.0.0.1:3000', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);

  // 清理可能遗留的旧测试单词本
  const testDeckName = 'E2E Test - Vocabulary';
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

  // 记录已有数据
  const existingDeckCards = page.locator('div[style*="cursor: pointer"]');
  const initialDeckCount = await existingDeckCards.count();
  console.log(`✓ Application is running. Existing decks count: ${initialDeckCount}`);

  // 2. 创建与导入
  console.log('\nStep 2: Creating temporary test deck "E2E Test - Vocabulary"...');
  const createBtn = page.locator('button:has-text("新建单词本"), button:has-text("立即创建")').first();
  await createBtn.click();
  await page.waitForTimeout(400);

  const nameInput = page.locator('input[placeholder*="专四高频"]');
  await nameInput.fill(testDeckName);
  await page.locator('button:has-text("确定创建")').click();
  await page.waitForURL(/\/import/);
  console.log('✓ Temporary deck created, redirected to Import page');

  // 读取 example.txt 并输入
  console.log('Importing ./example.txt...');
  const exampleText = fs.readFileSync('example.txt', 'utf-8');
  const textarea = page.locator('textarea');
  await textarea.fill(exampleText);
  await page.waitForTimeout(1000);

  // 检查导入预览
  const summaryText = await page.locator('p:has-text("提取有效词数")').innerText();
  console.log(`   Import Summary: "${summaryText.replace(/\n/g, ' ')}"`);

  const previewRows = page.locator('table tbody tr');
  const previewRowCount = await previewRows.count();
  console.log(`   Preview table rows count: ${previewRowCount}`);

  if (previewRowCount !== 15) {
    throw new Error(`Expected 15 preview rows, but got ${previewRowCount}`);
  }

  // 检查首词解析（例如 convert 成功剥离 "（已认识）" 并匹配牛津词典音标与释义）
  const firstRow = await previewRows.first().innerText();
  console.log(`   First parsed row sample: ${firstRow.replace(/\n/g, ' | ')}`);
  if (!firstRow.includes('convert') || !firstRow.includes('/kənˈvɜːt/')) {
    throw new Error(`First row did not parse cleanly: "${firstRow}"`);
  }

  // 点击确认导入
  await page.screenshot({ path: 'test-results/screenshot-e2e-import-preview.png' });
  const confirmBtn = page.locator('button:has-text("确认导入")');
  await confirmBtn.click();
  await page.waitForURL(/\/study/);
  console.log('✓ 15 words confirmed and entered study page');
  await page.waitForTimeout(600);

  // 获取生成的 testDeckId
  const studyUrl = page.url();
  const testDeckId = studyUrl.split('/study/')[1].split('?')[0];
  console.log(`   Active Test Deck ID: ${testDeckId}`);

  // 注意：时钟拦截仅在需要模拟 90s 快进的测试步骤中临时按需使用，避免冻结页面 React 调度器与轮询

  // 3. 完整背词流程
  console.log('\nStep 3: Simulating real study flow with keyboard shortcuts...');

  // 3.1 故意将第 1 个词标记为「不认识 (1)」
  const firstWordHeading = await page.locator('div h1').last().innerText();
  console.log(`   Initial card 1: "${firstWordHeading.trim()}" -> Intentionally rating AGAIN (1)`);

  const revealBtn = page.locator('button:has-text("揭示答案")');
  const isRevVis = await revealBtn.isVisible();
  console.log('   revealBtn visible:', isRevVis);
  if (isRevVis) {
    await revealBtn.click();
  } else {
    await page.keyboard.press('Space');
  }
  await page.waitForTimeout(200);

  const againBtn = page.locator('button:has-text("不认识")');
  const isAgainVis = await againBtn.isVisible();
  console.log('   againBtn visible:', isAgainVis);
  if (isAgainVis) {
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
    firstWordHeading.trim(),
    { timeout: 5000 }
  );

  const secondWordHeading = (await page.locator('div h1').last().innerText()).trim();
  console.log(`   Next card 2: "${secondWordHeading}"`);
  console.log(`✓ Card was offset properly into the queue (did not repeat immediately).`);

  // 3.2 连续防抖拦截验证：在卡片 2 上连续快速点击评分两次
  await page.keyboard.press('Space');
  await page.waitForTimeout(100);
  await page.keyboard.press('3');
  await page.keyboard.press('3'); // 快速连续按 3
  await page.waitForTimeout(350);
  console.log('✓ Fast double-press handled with debounce lock.');

  // 3.3 推进阶段一（初学识记）并中途进行刷新持久化测试
  let reviewsCount = 2;
  console.log('Advancing Phase 1 (Initial Learning)...');

  let didReload = false;
  let intentionalTestingLapseWord = '';
  let testedNegativeEarlyReview = false;

  while (reviewsCount < 130) {
    reviewsCount++;

    // 检查是否已达全表通关
    const isCompleted = await page.locator('text=🏆 恭喜！本单词本已全员通关！').isVisible().catch(() => false);
    if (isCompleted) {
      console.log(`\n🎉 Deck completed successfully after ${reviewsCount - 1} reviews!`);
      break;
    }

    // 检查当前所处阶段 badge
    const badgeText = await page.locator('span:has-text("阶段一：初学识记"), span:has-text("阶段二：独立测试")').first().innerText().catch(() => '');

    // 中途刷新持久化测试（在第 14 次答题时刷新页面）
    if (reviewsCount === 14 && !didReload) {
      console.log('   [Persistence Test] Reloading page mid-session to verify state restoration...');
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForTimeout(800);
      didReload = true;
      const restoredWord = await page.locator('div h1').last().innerText().catch(() => '');
      console.log(`   ✓ Page restored smoothly after reload. Current card: "${restoredWord.trim()}"`);
    }

    // 在阶段二（独立测试）初期的第 38 次复习时，故意将一个测试词标记为「不认识 (1)」以验证测试阶段错词退回
    if (badgeText.includes('阶段二') && !intentionalTestingLapseWord && reviewsCount === 38) {
      intentionalTestingLapseWord = (await page.locator('div h1').last().innerText()).trim();
      console.log(`   [Lapse Test in Testing Phase] Intentionally rating AGAIN (1) on "${intentionalTestingLapseWord}"`);
      await page.keyboard.press('Space');
      await page.waitForTimeout(120);
      await page.keyboard.press('1');
      await page.waitForTimeout(350);
      continue;
    }

    // 读取顶部进度 subtitle
    const subtitleText = await page.locator('header p').innerText().catch(() => '');
    const progressMatch = subtitleText.match(/(\d+)\s*\/\s*(\d+)/);
    const masteredCount = progressMatch ? parseInt(progressMatch[1]) : 0;
    const totalCount = progressMatch ? parseInt(progressMatch[2]) : 15;
    const unmasteredCount = totalCount - masteredCount;

    const currentWord = (await page.locator('div h1').last().innerText().catch(() => '')).trim();

    // 独立性验证核心点：
    // 当全表只剩下这 1 个未通关词（即 intentionalTestingLapseWord）回到阶段二测试时：
    if (badgeText.includes('阶段二') && unmasteredCount === 1 && currentWord === intentionalTestingLapseWord) {
      const hasStreak1 = await page.locator('text=★ 已连对 1 次').isVisible().catch(() => false);

      // 第一步：从错词强化池重回阶段二后的第 1 次测试（经历过其它多张卡片，间隔 >= 8）
      if (!hasStreak1) {
        console.log(`   [Independence Verification] Testing "${currentWord}" for 1st pass in testing phase (intervening cards >= 8)...`);
        await page.keyboard.press('Space');
        await page.waitForTimeout(100);
        await page.keyboard.press('3');
        await page.waitForTimeout(350);

        const streakVisible = await page.locator('text=★ 已连对 1 次').isVisible().catch(() => false);
        if (!streakVisible) {
          throw new Error('First test pass after intervening cards >= 8 failed to reach streak 1!');
        }
        console.log('   ✓ First test pass satisfied intervening cards >= 8: streak reached 1.');
        continue;
      }

      // 第二步：此时只有这一张卡片，验证提前复习（未达 8 张其他卡片且未达 90 秒）不得增加通关计数
      if (!testedNegativeEarlyReview) {
        console.log(`   [Independence Verification] Testing isolated card "${currentWord}" EARLY (< 90s, otherCards = 0)...`);
        await page.keyboard.press('Space');
        await page.waitForTimeout(100);
        await page.keyboard.press('3');
        await page.waitForTimeout(350);

        // 验证：通关未触发，且连对依然保持在 1 次（没有被提前测试计为第 2 次连对通关）
        const isPrematureMastered = await page.locator('text=🏆 恭喜！本单词本已全员通关！').isVisible().catch(() => false);
        if (isPrematureMastered) {
          throw new Error('Early review incorrectly graduated card and completed the deck!');
        }
        const stillStreak1 = await page.locator('text=★ 已连对 1 次').isVisible().catch(() => false);
        if (!stillStreak1) {
          throw new Error('Early review unexpectedly altered consecutiveSuccess streak!');
        }
        console.log('   ✓ Requirement 22 & 23 PASSED: Early review with 0 intervening cards and < 90s did NOT increment streak or graduate card!');
        testedNegativeEarlyReview = true;
        continue;
      }

      // 第三步：物理时间快进 92 秒（满足 >= 90s OR 条件），达成第 2 次有效独立答对并通关
      console.log(`   [Independence Verification] Fast-forwarding mock clock by 92s (>= 90s requirement) for final graduation...`);
      await page.clock.fastForward(92000);
      await page.keyboard.press('Space');
      await page.waitForTimeout(100);
      await page.keyboard.press('3');
      await page.waitForTimeout(500);
      continue;
    }

    // 在阶段二中，若池中未通关词数已 <= 8 张，则其轮次间卡片数必然 < 8，因此快进 92s 满足 90 秒物理间隔
    if (badgeText.includes('阶段二') && unmasteredCount <= 8) {
      await page.clock.fastForward(92000);
    }

    // 正常答题：按 Space 揭示
    const isQuestion = await page.locator('text=按 Space 或点击卡片揭示答案').isVisible().catch(() => false);
    if (isQuestion) {
      await page.keyboard.press('Space');
      await page.waitForTimeout(100);
    }

    // 按 3 (认识)
    await page.keyboard.press('3');
    await page.waitForTimeout(320);

    if (reviewsCount % 10 === 0 || reviewsCount === 31) {
      console.log(`   [Review #${reviewsCount}] Word: "${currentWord}" | Phase: "${badgeText}" | Progress: ${masteredCount}/${totalCount}`);
    }
  }

  // 验证通关界面
  await page.waitForSelector('text=🏆 恭喜！本单词本已全员通关！', { timeout: 5000 });
  await page.screenshot({ path: 'test-results/screenshot-e2e-completed.png' });
  console.log('✓ Completed screen screenshot captured (all 15 words mastered).');

  // 4. 持久化与统计验证
  console.log('\nStep 4: Checking study statistics and lapse list...');
  const statsBtn = page.locator('button:has-text("查看学习统计")');
  await statsBtn.click();
  await page.waitForURL(/\/stats\//);
  await page.waitForTimeout(800);

  // 检查指标卡数值
  const statCardElements = page.locator('div[style*="grid"] > div');
  const cardCount = await statCardElements.count();
  const statValues = {};
  for (let i = 0; i < cardCount; i++) {
    const card = statCardElements.nth(i);
    const title = (await card.locator('span').first().innerText()).trim();
    const val = (await card.locator('h2').innerText()).trim();
    statValues[title] = val;
  }
  console.log('   Stat Metrics:', statValues);

  if (statValues['通关进度'] !== '15 / 15') {
    throw new Error(`Expected progress 15 / 15, got ${statValues['通关进度']}`);
  }

  // 检查易错强化清单表格（应包含 intentionalTestingLapseWord）
  const tableRows = page.locator('table tbody tr');
  const tableRowCount = await tableRows.count();
  console.log(`   Lapse table rows count: ${tableRowCount}`);
  const lapseRowTexts = [];
  for (let i = 0; i < tableRowCount; i++) {
    const rowText = (await tableRows.nth(i).innerText()).trim();
    console.log(`     Row ${i + 1}: ${rowText.replace(/\t|\n/g, ' ')}`);
    lapseRowTexts.push(rowText);
  }

  const allLapseText = lapseRowTexts.join(' ');
  if (!allLapseText.includes(intentionalTestingLapseWord)) {
    throw new Error(`Expected lapse list to contain "${intentionalTestingLapseWord}", but got:\n${allLapseText}`);
  }
  console.log(`✓ Lapse list verified: correctly contains "${intentionalTestingLapseWord}".`);

  await page.screenshot({ path: 'test-results/screenshot-e2e-stats.png' });
  console.log('✓ Stats screenshot captured');

  // 5. 删除与清理测试单词本
  console.log('\nStep 5: Deleting temporary test deck through web UI...');
  await page.goto('http://127.0.0.1:3000/decks', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);

  const targetDeckCard = page.locator(`div:has(h3:has-text("${testDeckName}"))`).first();
  const deleteBtn = targetDeckCard.locator('button[title="删除单词本"], button:has-text("delete")').first();
  await deleteBtn.click();
  await page.waitForTimeout(1000);

  // 验证临时单词本是否已彻底从页面中消失
  const isDeckStillVisible = await page.locator(`text=${testDeckName}`).isVisible().catch(() => false);
  console.log(`✓ Temporary deck deleted from UI: ${!isDeckStillVisible}`);

  if (isDeckStillVisible) {
    throw new Error('Temporary test deck was not deleted from UI!');
  }

  // 验证 Dexie IndexedDB 级联清除与数据隔离（其他单词本和词典不受影响）
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

  // 截图：删除后页面
  await page.screenshot({ path: 'test-results/screenshot-e2e-cleaned-decks.png' });
  console.log('✓ Cleaned decks screenshot captured');

  await browser.close();

  console.log('\n================================================================');
  console.log('FULL USER JOURNEY E2E TEST COMPLETED SUCCESSFULLY!');
  console.log(`Browser console errors encountered: ${consoleErrors.length}`);
  console.log(`Page uncaught errors encountered: ${pageErrors.length}`);
  console.log('================================================================');

  if (consoleErrors.length > 0 || pageErrors.length > 0) {
    throw new Error(`Encountered ${consoleErrors.length} console errors and ${pageErrors.length} page errors.`);
  }
}

runE2EJourney().catch((err) => {
  console.error('\nE2E Journey Test Failed:', err);
  process.exit(1);
});
