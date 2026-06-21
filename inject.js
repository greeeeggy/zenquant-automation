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
    // If process.env.CI is true (which it is in GitHub Actions), run headlessly.
    // Otherwise, keep the browser visible for manual runs.
    const isHeadless = !!process.env.CI;
    browser = await chromium.launch({ headless: isHeadless }); 
    let context;
    
    // Use saved state if available, otherwise start fresh
    if (fs.existsSync(storageStatePath)) {
        context = await browser.newContext({ storageState: storageStatePath });
        console.log("Using saved session state...");
    } else {
        context = await browser.newContext();
    }
    
    const page = await context.newPage();

    // 1. Navigate to the page
    console.log("Navigating to Zenquant...");
    await page.goto(URLS.trade, { waitUntil: 'domcontentloaded' });

    console.log("Checking session status (waiting 5 seconds)...");
    await page.waitForTimeout(5000);

    // Check if we got redirected to login
    const isLoginPage = page.url().includes('login') || await page.locator('text="MOBILE LOGIN"').isVisible().catch(() => false);
    
    if (isLoginPage) {
        console.log("Session invalid or expired! Running automated login...");
        console.log("Waiting another 25 seconds for country code to auto-detect...");
        await page.waitForTimeout(25000);

        // Enter Phone Number
        console.log("Entering phone number...");
        const phoneInput = page.locator('input[type="number"]').first();
        await phoneInput.fill(CREDENTIALS.phone, { force: true });
        console.log("Waiting 10 seconds after entering phone number...");
        await page.waitForTimeout(10000);

        // Enter Password
        console.log("Entering password...");
        const passwordInput = page.locator('input[type="password"]').first();
        await passwordInput.fill(CREDENTIALS.password, { force: true });
        console.log("Waiting 10 seconds after entering password...");
        await page.waitForTimeout(10000);

        // Click Login
        console.log("Clicking the login button...");
        const loginBtn = page.locator('.zq-cta').filter({ hasText: 'Login' }).first();
        await loginBtn.click({ force: true });

        console.log("Waiting for redirection back to the Trade page (up to 90 seconds)...");
        try {
            await page.waitForFunction(() => {
                return window.location.href.includes('UITransaction/trade') || 
                       (window.location.hash.length > 0 && !window.location.href.includes('login'));
            }, { timeout: 90000 });
        } catch (e) {
            // Capture what the page looks like at timeout for debugging
            console.error("Redirect timed out. Current URL:", page.url());
            await page.screenshot({ path: 'login_timeout_debug.png', fullPage: true });
            console.error("Screenshot saved to login_timeout_debug.png");
            throw e;
        }

        console.log("Login successful! Waiting 10 seconds to ensure session tokens are saved...");
        await page.waitForTimeout(10000);

        // Save storage state
        await context.storageState({ path: storageStatePath });
        console.log("Logged-in session has been saved permanently to storageState.json.");
    } else {
        console.log("Session valid! Already logged in.");
    }
    
    // 2. Perform the Injection Flow
    console.log("On Trade page. Checking Open positions...");
    await page.waitForTimeout(3000); // Wait for page to fully render

    // Look for "Claimable" button
    const claimableBtn = page.locator('text=Claimable').first();
    
    try {
        if (await claimableBtn.isVisible({ timeout: 5000 })) {
            console.log("Found Claimable button! Clicking it...");
            await claimableBtn.click({ force: true });
            console.log("Waiting 10 seconds after clicking Claimable...");
            await page.waitForTimeout(10000);

            // Click the Confirm button on the Claimable dialog
            const claimConfirmBtn = page.locator('.btnConfirm').filter({ hasText: 'Confirm' }).first();
            if (await claimConfirmBtn.isVisible({ timeout: 5000 })) {
                console.log("Clicking Claimable dialog 'Confirm' button...");
                await claimConfirmBtn.click({ force: true });
                console.log("Waiting 10 seconds after confirming claim...");
                await page.waitForTimeout(10000);
            }
        } else {
            console.log("No Claimable button found. It might still be on cooldown, or we might just need to inject. Proceeding...");
        }
    } catch(e) {
        console.log("Claimable check timed out, proceeding to injection...");
    }

    // Amount Container - put the amount 50
    console.log("Entering amount 50...");
    
    // There is an input inside .trade-input wrapper for the amount.
    const amountInput = page.locator('.trade-input input').first();
    try {
        await amountInput.fill('50');
        console.log("Successfully entered amount 50.");
    } catch (e) {
        console.log("Could not fill input element directly. Attempting force fill...");
        await amountInput.fill('50', { force: true });
    }
    console.log("Waiting 10 seconds after entering amount...");
    await page.waitForTimeout(10000);

    // Press Confirm Injection
    console.log("Clicking 'Confirm injection'...");
    // The exact class found in the DOM is .trade-submit
    const confirmInjectionBtn = page.locator('.trade-submit').first();
    try {
       await confirmInjectionBtn.click({ force: true, timeout: 5000 });
       console.log("Confirm injection clicked.");
    } catch (e) {
       console.log("Could not find the 'Confirm injection' button by class. Attempting coordinate click...");
       await page.mouse.click(500, 820); 
    }
    console.log("Waiting 30 seconds for the System Log (semi terminal) progress bar to complete...");
    await page.waitForTimeout(30000);

    // Wait for the "semi terminal" and the final Confirm button
    console.log("Waiting for the semi terminal and final Confirm button...");
    
    // We wait up to 15 seconds for the modal/terminal to appear. 
    const finalConfirmBtn = page.locator('span:has-text("Confirm"), button:has-text("Confirm"), .btnConfirm').last();
    
    try {
        await finalConfirmBtn.waitFor({ state: 'visible', timeout: 15000 });
        await finalConfirmBtn.click({ force: true });
        console.log("Final confirm button clicked! Automation successful.");
    } catch (e) {
        console.log("Final confirm button did not appear within 15 seconds or could not be clicked.");
    }

    console.log("Waiting 10 seconds after final confirm...");
    await page.waitForTimeout(10000); // give it a few seconds to finish closing modal

  } catch (error) {
    console.error("Automation error:", error);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// Run the automation
loginAndInject();
