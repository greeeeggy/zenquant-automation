const { chromium } = require('playwright');
const path = require('path');

const CREDENTIALS = {
  phone: '9632717830',
  password: '1loveyouHannah_'
};

const URLS = {
  login: 'https://www.zenquantai.com/#/pages/login/login',
  trade: 'https://www.zenquantai.com/#/pages/UITransaction/trade'
};

async function automatedLogin() {
  console.log("Launching browser for automated login...");
  // Launch headfully so you can watch it log in
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  });
  const page = await context.newPage();

  try {
    console.log("Navigating to Zenquant Login page...");
    await page.goto(URLS.login, { waitUntil: 'domcontentloaded' });

    console.log("Waiting 30 seconds for the page to fully load and auto-detect country code...");
    await page.waitForTimeout(30000);

    // 1. Enter Phone Number
    console.log("Entering phone number...");
    const phoneInput = page.locator('input[type="number"]').first();
    await phoneInput.fill(CREDENTIALS.phone, { force: true });

    // 2. Enter Password
    console.log("Entering password...");
    const passwordInput = page.locator('input[type="password"]').first();
    await passwordInput.fill(CREDENTIALS.password, { force: true });

    // 3. Click Login
    console.log("Clicking the login button...");
    const loginBtn = page.locator('.zq-cta').filter({ hasText: 'Login' }).first();
    await loginBtn.click({ force: true });

    console.log("Waiting for redirection to the Trade page...");
    // Wait until the URL changes to UITransaction/trade
    await page.waitForFunction(() => {
        return window.location.href.includes('UITransaction/trade') || 
               (window.location.hash.length > 0 && !window.location.href.includes('login'));
    }, { timeout: 30000 });

    console.log("Login successful! Waiting 10 seconds to ensure session tokens are saved...");
    await page.waitForTimeout(10000);

    // Save storage state
    const storageStatePath = path.join(__dirname, 'storageState.json');
    await context.storageState({ path: storageStatePath });
    console.log("Logged-in session has been saved permanently to storageState.json.");

  } catch (error) {
    console.error("Automated login error:", error);
  } finally {
    console.log("Closing browser...");
    await browser.close();
  }
}

automatedLogin();
