import { expect, test, type Page } from '@playwright/test';

const pager = (page: Page) => page.locator('.pager');
const code = (page: Page) => page.getByTestId('lcd-code');

test('one press on an empty pager loads the sample day and runs it, and ACK keeps it running', async ({ page }) => {
  await page.goto('/?fresh&at=2026-11-19T05:00&tz=America/Chicago');
  await expect(page.getByTestId('page-row')).toHaveCount(0);

  await page.getByTestId('demo-cta').click();
  await expect(page.getByText('PLAY 900x')).toBeVisible();
  await expect(page.getByTestId('page-row').first()).toBeVisible();

  // First stop: the quiet 7:30 digest. Its message starts at the left edge of the LCD, not clipped.
  await expect(pager(page)).toHaveAttribute('data-state', 'quiet', { timeout: 15_000 });
  await expect(code(page)).toHaveText('100');
  await expect(page.getByTestId('vcr-hint')).toBeVisible();
  const line = page.getByTestId('lcd-text');
  await expect(line).toHaveText(/^DIGEST \d+: /);
  const [box, text] = await Promise.all([page.locator('.lcd-ticker').boundingBox(), line.boundingBox()]);
  expect(text!.x).toBeGreaterThanOrEqual(box!.x - 1);
  expect(text!.x).toBeLessThan(box!.x + 4);

  // ACK resumes the run, which stops again on the next beeping page.
  await page.keyboard.press('a');
  await expect(page.getByText('PLAY 900x')).toBeVisible();
  await expect(pager(page)).toHaveAttribute('data-state', 'paging', { timeout: 20_000 });
  await expect(code(page)).toHaveText('911');
  await expect(page.getByTestId('vcr-clock')).toContainText('9:25');
});

test('a line that fits on the LCD sits still; only an overflowing one scrolls', async ({ page }) => {
  await page.goto('/?fresh&at=2026-11-19T08:00&tz=America/Chicago');
  await page.getByLabel('What').fill('Parent-teacher conference');
  await page.getByLabel('Starts at').fill('10:30');
  await page.getByRole('button', { name: 'Arm the pager' }).click();
  const ticker = page.locator('.lcd-ticker');
  const anim = () => page.getByTestId('lcd-text').evaluate((el) => getComputedStyle(el).animationName);

  await expect(page.getByTestId('lcd-text')).toHaveText(/^NEXT PAGE .* ALL QUIET\.$/);
  await expect(ticker).not.toHaveAttribute('data-scroll');
  expect(await anim()).toBe('none');

  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(code(page)).toHaveText('411');
  await page.keyboard.press('a');
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(code(page)).toHaveText('911');
  await expect(page.getByTestId('lcd-text')).toHaveText(/^LEAVE NOW: PARENT-TEACHER CONFERENCE @ 10:30A/);
  await expect(ticker).toHaveAttribute('data-scroll', 'true');
  expect(await anim()).toBe('ticker');
});
