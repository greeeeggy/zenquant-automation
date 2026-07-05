const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const CREDENTIALS = {
  phone: process.env.ZENQUANT_PHONE,
  password: process.env.ZENQUANT_PASSWORD
};

const URLS = {
  login: 'https://www.zenquantai.com/#/pages/login/login',
  trade: 'https://www.zenquantai.com/#/pages/UITransaction/trade'
};

async function loginAndInject() {
  const storageStatePath = path.join(__dirname, 'storageState.json');
  let browser;

  try {
    const isHeadless = !!process.env.CI;
    browser = await chromium.launch({ headless: isHeadless });
    let context;

    if (fs.existsSync(storageStatePath)) {
      context = await browser.newContext({ storageState: storageStatePath });
      console.log('Using saved session state...');
    } else {
      context = await browser.newContext();
    }

    const page = await context.newPage();

    // ── 1. Navigate & check session ───────────────────────────────────────────
    console.log('Navigating to Zenquant...');
    await page.goto(URLS.trade, { waitUntil: 'domcontentloaded' });

    console.log('Checking session status (waiting 5 seconds)...');
    await page.waitForTimeout(5000);

    const isLoginPage =
      page.url().includes('login') ||
      (await page.locator('text="MOBILE LOGIN"').isVisible().catch(() => false));

    if (isLoginPage) {
      console.log('Session invalid or expired! Running automated login...');
      console.log('Waiting 10 seconds for page to fully load...');
      await page.waitForTimeout(10000);

      // Select Philippines (+63)
      console.log('Selecting Philippines (+63) as country code...');
      try {
        const countryTrigger = page.locator('.theme_Login_Input_bg.justify-between').first();
        if (await countryTrigger.isVisible({ timeout: 5000 })) {
          await countryTrigger.click({ force: true });
          console.log('Country dropdown opened. Waiting 2 seconds...');
          await page.waitForTimeout(2000);

          const phOption = page.locator('.country-list-row').filter({ hasText: 'Philippines' }).first();
          await phOption.waitFor({ state: 'visible', timeout: 8000 });
          await phOption.click({ force: true });
          console.log('Philippines (+63) selected. Waiting 2 seconds...');
          await page.waitForTimeout(2000);
        } else {
          console.log('Country selector not visible — proceeding anyway.');
        }
      } catch (e) {
        console.log('Could not change country code:', e.message, '— proceeding anyway.');
      }

      // Phone
      console.log('Entering phone number...');
      const phoneInput = page.locator('input[type="number"]').first();
      await phoneInput.fill(CREDENTIALS.phone, { force: true });
      console.log('Waiting 10 seconds after entering phone number...');
      await page.waitForTimeout(10000);

      // Password
      console.log('Entering password...');
      const passwordInput = page.locator('input[type="password"]').first();
      await passwordInput.fill(CREDENTIALS.password, { force: true });
      console.log('Waiting 10 seconds after entering password...');
      await page.waitForTimeout(10000);

      // Login button
      console.log('Clicking the login button...');
      const loginBtn = page.locator('.zq-cta').filter({ hasText: 'Login' }).first();
      await loginBtn.click({ force: true });

      console.log('Waiting for redirection back to the Trade page (up to 90 seconds)...');
      try {
        await page.waitForFunction(() => {
          return (
            window.location.href.includes('UITransaction/trade') ||
            (window.location.hash.length > 0 && !window.location.href.includes('login'))
          );
        }, { timeout: 90000 });
      } catch (e) {
        console.error('Redirect timed out. Current URL:', page.url());
        await page.screenshot({ path: 'login_timeout_debug.png', fullPage: true });
        throw e;
      }

      console.log('Login successful! Waiting 10 seconds to ensure session tokens are saved...');
      await page.waitForTimeout(10000);

      await context.storageState({ path: storageStatePath });
      console.log('Logged-in session saved to storageState.json.');
    } else {
      console.log('Session valid! Already logged in.');
    }

    // ── 2. Navigate to Trade page ─────────────────────────────────────────────
    if (!page.url().includes('UITransaction/trade')) {
      console.log('Navigating to Trade page...');
      await page.goto(URLS.trade, { waitUntil: 'domcontentloaded' });
    }

    console.log('On Trade page. Waiting 5 seconds for full render...');
    await page.waitForTimeout(5000);

    // Dismiss any Activity notice modal
    try {
      const cancelModalBtn = page.locator('text=Cancel').first();
      if (await cancelModalBtn.isVisible({ timeout: 2000 })) {
        console.log('Activity notice modal detected, clicking Cancel...');
        await cancelModalBtn.click({ force: true });
        await page.waitForTimeout(2000);
      }
    } catch (e) {
      // No modal — fine
    }

    // ── 3. Claim all Claimable buttons ────────────────────────────────────────
    // Claimable buttons are: <uni-view class="trade-pos__claim">Claimable</uni-view>
    // We click each one, wait 5s, then confirm the dialog (class: zq-cert__confirm
    // or btnConfirm containing "Confirm"), then wait 5s before the next.
    console.log('Checking for Claimable buttons...');

    // Re-query each time since the DOM may update after each claim
    let claimIndex = 0;
    while (true) {
      await page.waitForTimeout(1000);
      const claimables = page.locator('.trade-pos__claim', { hasText: 'Claimable' });
      const count = await claimables.count();
      console.log(`Found ${count} Claimable button(s).`);

      if (count === 0) break;

      // Always click the first remaining one
      const btn = claimables.first();
      try {
        if (await btn.isVisible({ timeout: 3000 })) {
          claimIndex++;
          console.log(`Clicking Claimable button #${claimIndex}...`);
          await btn.click({ force: true });
          console.log('Waiting 5 seconds after clicking Claimable...');
          await page.waitForTimeout(5000);

          // Click the Confirm button on the resulting dialog
          // Try .zq-cert__confirm first, then fall back to .btnConfirm:has-text("Confirm")
          const certConfirm = page.locator('.zq-cert__confirm');
          const legacyConfirm = page.locator('.btnConfirm', { hasText: 'Confirm' }).first();

          let confirmed = false;
          if (await certConfirm.isVisible({ timeout: 5000 }).catch(() => false)) {
            console.log('Clicking Confirm on certificate dialog...');
            await certConfirm.click({ force: true });
            confirmed = true;
          } else if (await legacyConfirm.isVisible({ timeout: 3000 }).catch(() => false)) {
            console.log('Clicking Confirm on legacy dialog...');
            await legacyConfirm.click({ force: true });
            confirmed = true;
          }

          if (confirmed) {
            console.log('Claim confirmed. Waiting 5 seconds before next claim...');
            await page.waitForTimeout(5000);
          } else {
            console.log('No confirm dialog appeared for this claim. Moving on...');
          }
        }
      } catch (e) {
        console.log(`Error processing Claimable button: ${e.message}`);
        break;
      }
    }

    // ── 4. Helper: perform an injection ──────────────────────────────────────
    async function performInjection(tabText, amount) {
      console.log(`\n── Injection: tab="${tabText}", amount=${amount} ──`);

      // Click the plan tab (class: trade-dur, text matches tabText exactly)
      try {
        const tab = page.locator('.trade-dur', { hasText: tabText }).first();
        if (await tab.isVisible({ timeout: 5000 })) {
          await tab.click({ force: true });
          console.log(`Clicked "${tabText}" tab.`);
          await page.waitForTimeout(2000);
        } else {
          console.log(`Tab "${tabText}" not visible — proceeding anyway.`);
        }
      } catch (e) {
        console.log(`Error clicking tab "${tabText}": ${e.message}`);
      }

      // Fill amount input — locate the textbox, clear it, then type
      console.log(`Filling amount: ${amount}...`);
      try {
        const amountInput = page.locator('input[type="text"], input:not([type])', {
          // Narrow to the Amount section input
        }).first();
        await amountInput.click({ force: true });
        await amountInput.fill('', { force: true });
        await amountInput.fill(amount.toString(), { force: true });
      } catch (e) {
        // Fallback: evaluate directly in DOM
        console.log(`Input fill failed (${e.message}), trying JS fallback...`);
        await page.evaluate((val) => {
          const inp = document.querySelector('input');
          if (inp) {
            const nativeInput = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            nativeInput.call(inp, val);
            inp.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }, amount.toString());
      }
      await page.waitForTimeout(2000);

      // Click "Confirm injection"
      console.log('Clicking "Confirm injection"...');
      try {
        const confirmInjBtn = page.locator('text=Confirm injection').first();
        await confirmInjBtn.click({ force: true, timeout: 5000 });
      } catch (e) {
        console.log(`Confirm injection click failed: ${e.message}`);
      }

      // Wait 30 seconds for the injection progress bar to finish
      console.log('Waiting 30 seconds for injection progress bar...');
      await page.waitForTimeout(30000);

      // Click final Confirm on the Share holding certificate dialog
      const certConfirm = page.locator('.zq-cert__confirm');
      try {
        await certConfirm.waitFor({ state: 'visible', timeout: 15000 });
        console.log('Clicking final Confirm on certificate dialog...');
        await certConfirm.click({ force: true });
      } catch (e) {
        console.log('Certificate confirm dialog did not appear:', e.message);
      }

      console.log('Waiting 10 seconds after injection...');
      await page.waitForTimeout(10000);
    }

    // ── 5. Inject $50 into Plus ───────────────────────────────────────────────
    await performInjection('Plus', 50);

    // ── 6. Read remaining Available USD ──────────────────────────────────────
    console.log('\nReading remaining Available USD...');
    const bodyText = await page.locator('body').innerText();
    const matches = [...bodyText.matchAll(/Available\s*[\n\r]*\s*([\d.,]+)/gi)];
    let availableBalance = 0;

    if (matches.length > 0) {
      const rawStr = matches[matches.length - 1][1].replace(/,/g, '');
      const parsed = parseFloat(rawStr);
      if (!isNaN(parsed)) availableBalance = parsed;
    }
    console.log(`Remaining Available USD: ${availableBalance}`);

    // Whole number only (no cents)
    const wholeAmount = Math.floor(availableBalance);

    // ── 7. Inject remaining whole USD into 3Hours ─────────────────────────────
    if (wholeAmount >= 10) {
      console.log(`Balance ${wholeAmount} >= 10 — injecting into 3Hours...`);
      await performInjection('3Hours', wholeAmount);
    } else {
      console.log(`Balance ${wholeAmount} < 10 — skipping 3Hours injection.`);
    }

    console.log('\n✅ All done!');

  } catch (error) {
    console.error('Automation error:', error);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

loginAndInject();
