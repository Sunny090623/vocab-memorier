import { chromium } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { zipSync } from 'fflate';

async function runE2ETest() {
  console.log('Starting E2E tests for Dictionary Upload Modal and Additive Import...');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      console.error('[Browser Error]:', msg.text());
    }
  });

  page.on('pageerror', (err) => {
    console.error('[Page Uncaught Error]:', err.message);
  });

  // ==========================================
  // PART 1: 验证词典上传更换模态窗口与加载功能
  // ==========================================
  console.log('\n--- PART 1: Testing Dictionary Upload Modal & ZIP Extraction ---');
  await page.goto('http://127.0.0.1:3000/settings', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);

  // 1.1 检查更换词典按钮是否存在
  const openModalBtn = page.locator('button:has-text("更换/加载词典 (.zip)")');
  await openModalBtn.waitFor({ state: 'visible' });
  console.log('✓ Found "更换/加载词典 (.zip)" button on Settings page');

  // 1.2 点击打开弹窗
  await openModalBtn.click();
  await page.waitForTimeout(400);

  // 1.3 验证弹窗标题与说明内容
  const modalTitle = page.locator('h2:has-text("更换 / 加载词典数据包")');
  await modalTitle.waitFor({ state: 'visible' });
  console.log('✓ Modal opened with title "更换 / 加载词典数据包"');

  const modalBodyText = await page.locator('ul').last().innerText();
  if (
    modalBodyText.includes('ZIP') &&
    modalBodyText.includes('MDX') &&
    modalBodyText.includes('本地') &&
    modalBodyText.includes('学习数据安全')
  ) {
    console.log('✓ Verified modal instructions: ZIP format, MDX dictionary, offline local extraction, data safety');
  } else {
    throw new Error('Modal instructions missing required details: ' + modalBodyText);
  }

  // 1.4 创建测试词典 ZIP 包
  const testDictData = {
    name: '极客测试双解词典 (E2E Verified)',
    entries: {
      algorithm: ['ˈælɡərɪðəm', ['n.'], ['算法，计算程序'], 'algorithm'],
      bandwidth: ['ˈbændwɪtθ', ['n.'], ['带宽，频宽'], 'bandwidth'],
      compiler: ['kəmˈpaɪlər', ['n.'], ['编译器'], 'compiler'],
    },
    links: {
      algorithms: 'algorithm',
      compilers: 'compiler',
    },
  };

  const testZipBuffer = zipSync({
    'custom_e2e_dict.json': new TextEncoder().encode(JSON.stringify(testDictData)),
    'readme.txt': new TextEncoder().encode('Test dictionary archive'),
  });

  const tempZipPath = path.resolve('temp_test_dict.zip');
  fs.writeFileSync(tempZipPath, Buffer.from(testZipBuffer));

  // 1.5 上传 ZIP 文件并触发加载
  console.log('Attaching test ZIP archive to modal file input...');
  const zipInput = page.locator('input[type="file"][accept*=".zip"]');
  await zipInput.setInputFiles(tempZipPath);
  await page.waitForTimeout(400);

  const startUploadBtn = page.locator('button:has-text("开始解压并加载词典")');
  await startUploadBtn.click();
  console.log('Clicked "开始解压并加载词典", waiting for local extraction and insertion...');

  // 1.6 等待完成状态
  await page.waitForFunction(() => {
    return document.body.innerText.includes('词典更换成功') || document.body.innerText.includes('已成功加载词典');
  }, { timeout: 15000 });
  console.log('✓ Local unzipping and database writing completed successfully!');

  // 1.7 点击完成并关闭
  const closeBtn = page.locator('button:has-text("完成并关闭")');
  await closeBtn.click();
  await page.waitForTimeout(500);

  // 1.8 验证设置页面词典名称与词条数已即时更新
  const updatedDictHeading = page.locator('h3:has-text("极客测试双解词典")');
  await updatedDictHeading.waitFor({ state: 'visible' });
  console.log('✓ Settings page updated with new dictionary: "极客测试双解词典"');

  // ==========================================
  // PART 2: 验证词表导入做成加法而非替换（自动去重）
  // ==========================================
  console.log('\n--- PART 2: Testing Additive Import with Auto Deduplication ---');
  await page.goto('http://127.0.0.1:3000/import', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);

  // 确保有一个单词本被选中
  const selectDeck = page.locator('select');
  const deckOptions = await selectDeck.locator('option').count();
  if (deckOptions === 0 || (await selectDeck.inputValue()) === '') {
    page.once('dialog', async (dialog) => {
      await dialog.accept('Additive Import Test Deck');
    });
    await page.locator('button:has-text("新建单词本")').click();
    await page.waitForTimeout(500);
  }

  // 准备两个待测试的文件
  // 文件 1: algorithm, bandwidth
  const tempFile1Path = path.resolve('temp_words1.txt');
  fs.writeFileSync(tempFile1Path, 'algorithm 算法\nbandwidth 带宽', 'utf-8');

  // 文件 2: bandwidth (重复), compiler (新词), database (新词)
  const tempFile2Path = path.resolve('temp_words2.txt');
  fs.writeFileSync(tempFile2Path, 'bandwidth 带宽（重复）\ncompiler 编译器\ndatabase 数据库', 'utf-8');

  // 2.1 第一次上传：上传 temp_words1.txt
  console.log('Uploading File 1 (temp_words1.txt)...');
  const fileInput = page.locator('input[type="file"][accept*=".txt"]');
  await fileInput.setInputFiles(tempFile1Path);
  await page.waitForTimeout(800);

  let textareaVal = await page.locator('textarea').inputValue();
  console.log(`Textarea after File 1:\n${textareaVal}`);
  if (!textareaVal.includes('algorithm') || !textareaVal.includes('bandwidth')) {
    throw new Error('File 1 words missing from textarea: ' + textareaVal);
  }

  let previewRows = await page.locator('table tbody tr').count();
  console.log(`Preview rows after File 1: ${previewRows} (expected 2)`);
  if (previewRows !== 2) {
    throw new Error(`Expected 2 preview rows after File 1, got ${previewRows}`);
  }

  // 2.2 第二次上传：上传 temp_words2.txt （测试加法追加与去重）
  console.log('Uploading File 2 (temp_words2.txt) to test additive merge & deduplication...');
  await fileInput.setInputFiles(tempFile2Path);
  await page.waitForTimeout(800);

  textareaVal = await page.locator('textarea').inputValue();
  console.log(`Textarea after File 2 (additive):\n${textareaVal}`);

  // 验证 File 1 的词仍然保留（没有被覆盖），并且 File 2 的新词已追加，重复词 bandwidth 没有重复生成第二行
  const lines = textareaVal.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const wordsExtracted = lines.map((l) => l.split(' ')[0].toLowerCase());
  console.log('Extracted words in textarea:', wordsExtracted);

  if (!wordsExtracted.includes('algorithm')) {
    throw new Error('Additive import failed: "algorithm" from File 1 was overwritten!');
  }
  if (!wordsExtracted.includes('compiler') || !wordsExtracted.includes('database')) {
    throw new Error('Additive import failed: New words from File 2 were not appended!');
  }

  // 验证 bandwidth 仅出现 1 次
  const bandwidthOccurrences = wordsExtracted.filter((w) => w === 'bandwidth').length;
  if (bandwidthOccurrences !== 1) {
    throw new Error(`Deduplication failed: "bandwidth" occurred ${bandwidthOccurrences} times instead of 1!`);
  }
  console.log('✓ Successfully deduplicated "bandwidth": only 1 occurrence in merged list');

  previewRows = await page.locator('table tbody tr').count();
  console.log(`Preview rows after additive merge: ${previewRows} (expected 4: algorithm, bandwidth, compiler, database)`);
  if (previewRows !== 4) {
    throw new Error(`Expected 4 preview rows after additive merge, got ${previewRows}`);
  }

  // 2.3 验证多文件同时上传（两文件同时选取）
  const clearBtn = page.locator('button:has-text("清空词表")');
  await clearBtn.waitFor({ state: 'visible' });
  await clearBtn.click();
  await page.waitForTimeout(400);

  const emptyText = await page.locator('textarea').inputValue();
  if (emptyText.trim() !== '') {
    throw new Error('"清空词表" failed to clear textarea');
  }
  console.log('✓ "清空词表" button successfully cleared the input');

  console.log('Testing multi-file simultaneous upload with File 1 and File 2...');
  await fileInput.setInputFiles([tempFile1Path, tempFile2Path]);
  await page.waitForTimeout(800);

  const multiText = await page.locator('textarea').inputValue();
  const multiRows = await page.locator('table tbody tr').count();
  console.log(`Preview rows after simultaneous multi-file upload: ${multiRows} (expected 4)`);
  if (multiRows !== 4) {
    throw new Error(`Simultaneous multi-file upload expected 4 rows, got ${multiRows}`);
  }
  console.log('✓ Multi-file simultaneous upload successfully merged and deduplicated all words!');

  // 清理临时文件
  try {
    fs.unlinkSync(tempZipPath);
    fs.unlinkSync(tempFile1Path);
    fs.unlinkSync(tempFile2Path);
  } catch {}

  console.log('\n============================================================');
  console.log('ALL E2E VERIFICATIONS PASSED: DICTIONARY MODAL & ADDITIVE IMPORT!');
  console.log('============================================================\n');

  await browser.close();
}

runE2ETest().catch((err) => {
  console.error('E2E Test Failed:', err);
  process.exit(1);
});
