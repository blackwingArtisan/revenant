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

// The page clips horizontal overflow (`overflow-x: clip`), so scrollWidth cannot see a pager
// that is wider than the screen. Measure the device itself on each screen a judge will see.
for (const width of [360, 390, 412]) {
  test(`at ${width} px the whole pager fits on the idle, running and 666 screens`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const fits = async (screen: string) => {
      const box = await page.locator('.pager').boundingBox();
      const inner = await page.evaluate(() => window.innerWidth);
      expect(box!.x, `${screen}: left edge`).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width, `${screen}: right edge`).toBeLessThanOrEqual(inner);
      const ticker = await page.locator('.lcd-ticker').boundingBox();
      expect(ticker!.x + ticker!.width, `${screen}: LCD line`).toBeLessThanOrEqual(box!.x + box!.width);
    };

    await page.goto('/?fresh&at=2026-11-19T05:00&tz=America/Chicago');
    await fits('idle');

    await page.getByTestId('demo-cta').click();
    await expect(page.locator('.pager')).toHaveAttribute('data-state', /^(paging|quiet)$/, { timeout: 20_000 });
    await fits('running');

    await page.goto('/?sample&fresh&at=2026-11-19T23:00&tz=America/Chicago');
    await page.getByRole('button', { name: /^Acknowledge/ }).first().click();
    await expect(page.locator('.pager')).toHaveAttribute('data-state', 'haunted');
    await fits('666');
  });
}
