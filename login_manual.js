const { chromium } = require('playwright');
const path = require('path');

async function manualLogin() {
    console.log("Launching browser for manual login...");
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();
    
    console.log("Navigating to Zenquant...");
    await page.goto('https://www.zenquantai.com/#/pages/login/login');
    
    console.log("\n=======================================================");
    console.log("Please log in manually in the browser window.");
    console.log("Change the country code if needed, and enter your credentials.");
    console.log("I am waiting for you to successfully reach the Trade page...");
    console.log("=======================================================\n");

    // Wait until the URL changes to the Trade page or no longer includes 'login'
    await page.waitForFunction(() => {
        return window.location.href.includes('UITransaction/trade') || 
               (window.location.hash.length > 0 && !window.location.href.includes('login'));
    }, { timeout: 0 }); // Wait indefinitely
    
    // Give it a couple of seconds to make sure tokens are set in localStorage
    await page.waitForTimeout(5000);

    const storageStatePath = path.join(__dirname, 'storageState.json');
    await context.storageState({ path: storageStatePath });
    
    console.log("Success! Your logged-in session has been saved permanently to storageState.json.");
    console.log("You can now run 'node inject.js' and it will bypass the login screen completely.");
    
    await browser.close();
}

manualLogin().catch(console.error);
