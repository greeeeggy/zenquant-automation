const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('https://www.zenquantai.com/#/pages/login/login');
  await page.waitForTimeout(5000);
  
  // Click the country trigger button
  const trigger = page.locator('.theme_Login_Input_bg.justify-between').first();
  await trigger.click({ force: true });
  console.log("Trigger clicked!");
  await page.waitForTimeout(2000);
  
  // Search for Philippines in the list
  const phOption = page.locator('.country-list-row').filter({ hasText: 'Philippines' }).first();
  await phOption.click({ force: true });
  console.log("Philippines clicked!");
  
  await browser.close();
})();
