import { chromium } from '@playwright/test';
import fs from 'fs';

fs.mkdirSync('test-results', { recursive: true });

async function runThemeTest() {
  console.log('--- Starting Theme Persistence E2E Test ---');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();

  // 1. Visit settings page
  console.log('1. Navigating to Settings page...');
  await page.goto('http://127.0.0.1:3000/settings', { waitUntil: 'networkidle' });

  // 2. Click "深色主题" button
  console.log('2. Switching to dark mode in Settings...');
  const darkBtn = page.locator('button:has-text("深色主题")');
  await darkBtn.click();
  await page.waitForTimeout(300);

  // Verify dark theme on DOM & localStorage
  let dataTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  let storedTheme = await page.evaluate(() => localStorage.getItem('vocab_theme'));
  console.log(`Current data-theme: ${dataTheme}, localStorage: ${storedTheme}`);
  if (dataTheme !== 'dark' || storedTheme !== 'dark') {
    throw new Error(`Expected dark theme, got data-theme=${dataTheme}, stored=${storedTheme}`);
  }
  console.log('✓ Dark theme successfully applied');

  // 3. Refresh the Settings page and verify persistence
  console.log('3. Reloading Settings page...');
  await page.reload({ waitUntil: 'networkidle' });
  dataTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  storedTheme = await page.evaluate(() => localStorage.getItem('vocab_theme'));
  console.log(`After reload - data-theme: ${dataTheme}, localStorage: ${storedTheme}`);
  if (dataTheme !== 'dark' || storedTheme !== 'dark') {
    throw new Error(`Theme reset on reload! data-theme=${dataTheme}, stored=${storedTheme}`);
  }
  console.log('✓ Dark theme persisted across reload on Settings page');

  // 4. Navigate to /decks (Home/Decks page) and verify dark mode is maintained
  console.log('4. Navigating to /decks...');
  await page.goto('http://127.0.0.1:3000/decks', { waitUntil: 'networkidle' });
  dataTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  console.log(`On /decks - data-theme: ${dataTheme}`);
  if (dataTheme !== 'dark') {
    throw new Error(`Theme lost on /decks! data-theme=${dataTheme}`);
  }
  console.log('✓ Dark theme maintained on /decks page');

  // 5. Refresh on /decks page and verify dark theme is still maintained
  console.log('5. Reloading on /decks page...');
  await page.reload({ waitUntil: 'networkidle' });
  dataTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  storedTheme = await page.evaluate(() => localStorage.getItem('vocab_theme'));
  console.log(`After reload on /decks - data-theme: ${dataTheme}, localStorage: ${storedTheme}`);
  if (dataTheme !== 'dark' || storedTheme !== 'dark') {
    throw new Error(`Theme reset on reload on /decks! data-theme=${dataTheme}, stored=${storedTheme}`);
  }
  console.log('✓ Dark theme persisted across reload on /decks page');

  // 6. Test desktop rail quick toggle to switch to light mode
  console.log('6. Clicking quick toggle button in desktop rail to switch to light theme...');
  const toggleBtn = page.locator('nav.desktop-rail button:has-text("浅色")');
  await toggleBtn.click();
  await page.waitForTimeout(300);

  dataTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  storedTheme = await page.evaluate(() => localStorage.getItem('vocab_theme'));
  console.log(`After toggle - data-theme: ${dataTheme}, localStorage: ${storedTheme}`);
  if (dataTheme !== 'light' || storedTheme !== 'light') {
    throw new Error(`Expected light theme, got data-theme=${dataTheme}, stored=${storedTheme}`);
  }
  console.log('✓ Light theme successfully applied via rail toggle');

  // 7. Reload on /decks page to ensure light theme also persists
  console.log('7. Reloading to verify light theme persistence...');
  await page.reload({ waitUntil: 'networkidle' });
  dataTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  storedTheme = await page.evaluate(() => localStorage.getItem('vocab_theme'));
  console.log(`After reload - data-theme: ${dataTheme}, localStorage: ${storedTheme}`);
  if (dataTheme !== 'light' || storedTheme !== 'light') {
    throw new Error(`Light theme reset on reload! data-theme=${dataTheme}, stored=${storedTheme}`);
  }
  console.log('✓ Light theme persisted across reload');

  // 8. Go back to Settings and verify 浅色主题 is active
  console.log('8. Returning to Settings to verify selected state...');
  await page.goto('http://127.0.0.1:3000/settings', { waitUntil: 'networkidle' });
  const lightBtnSelected = await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('浅色主题')
    );
    return btn ? btn.style.border.includes('var(--md-sys-color-primary)') : false;
  });
  console.log(`Light theme option selected in Settings: ${lightBtnSelected}`);
  if (!lightBtnSelected) {
    throw new Error('Light theme option should be active in Settings!');
  }
  console.log('✓ Settings page correctly reflects persisted theme');

  // 9. Take a screenshot of the dark mode in settings for verification
  console.log('9. Switching back to dark mode and capturing screenshot...');
  const darkBtnAgain = page.locator('button:has-text("深色主题")');
  await darkBtnAgain.click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/screenshot-settings-dark.png' });
  await page.goto('http://127.0.0.1:3000/decks', { waitUntil: 'networkidle' });
  await page.screenshot({ path: 'test-results/screenshot-decks-dark.png' });
  console.log('✓ Screenshots captured for visual confirmation');

  await browser.close();
  console.log('\n=============================================');
  console.log('ALL THEME PERSISTENCE E2E TESTS PASSED!');
  console.log('=============================================');
}

runThemeTest().catch((err) => {
  console.error('Theme test failed:', err);
  process.exit(1);
});

