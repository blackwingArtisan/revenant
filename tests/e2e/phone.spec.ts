import { expect, test } from '@playwright/test';

test('fits a phone screen and pages from the sample day', async ({ page }) => {
  await page.goto('/?at=2026-11-19T10:00&tz=America/Chicago&sample');
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(page.viewportSize()!.width);

  // The time machine sits below the day sheet on a phone; when the pager
  // goes off out of view, a docked mini-pager carries the ACK button.
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page.getByTestId('lcd-code')).toHaveText('911');
  await expect(page.getByTestId('dock')).toContainText('LEAVE NOW: DENTIST CLEANING');
  const ack = page.getByRole('button', { name: 'Acknowledge page 911 from the dock', exact: true });
  await expect(ack).toBeInViewport();
  const box = await ack.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  await ack.tap();
  // The morning digest is still unread, so the LCD stays lit, but nothing beeps.
  await expect(page.locator('.pager')).toHaveAttribute('data-state', 'quiet');
  await expect(page.getByTestId('dock')).toHaveCount(0);
});

test('at 390 px the demo button is above the fold and keyboard hints are hidden', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?fresh&at=2026-11-19T05:00&tz=America/Chicago');
  await expect(page.getByTestId('demo-cta')).toBeInViewport();
  const cta = await page.getByTestId('demo-cta').boundingBox();
  expect(cta!.y + cta!.height).toBeLessThanOrEqual(844);
  await expect(page.locator('.keys')).toBeHidden();
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(390);
});
