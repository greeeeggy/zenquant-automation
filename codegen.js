import { test, expect } from '@playwright/test';

test.use({
  storageState: 'storageState.json'
});

test('test', async ({ page }) => {
  await page.goto('https://www.zenquantai.com/#/pages/login/login');
  await page.getByRole('spinbutton').click();
  await page.getByRole('spinbutton').fill(process.env.ZENQUANT_PHONE);
  await page.locator('uni-view').filter({ hasText: /^Please enter a 6-16 digit password$/ }).click();
  await page.getByRole('textbox').fill(process.env.ZENQUANT_PASSWORD);
  await page.getByText('Login').nth(4).click();
  await page.locator('uni-view:nth-child(4) > .flex > .wd-img > .wd-img__image > img').click();
  await page.locator('uni-view').filter({ hasText: /^1h 52m$/ }).nth(1).click();
  await page.getByRole('textbox').click();
  await page.getByRole('textbox').fill('5');
});