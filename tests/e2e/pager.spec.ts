import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const FIXTURE = fileURLToPath(new URL('../fixtures/two-events.ics', import.meta.url));
const START = '/?at=2026-11-19T08:00&tz=America/Chicago';

const pager = (page: Page) => page.locator('.pager');
const code = (page: Page) => page.getByTestId('lcd-code');

test('adds a commitment, time-travels, the pager beeps 411 then 911, and ACK stops the repeats', async ({ page }) => {
  await page.goto(START);
  await expect(page.getByTestId('vcr-clock')).toContainText('8:00');
  await expect(pager(page)).toHaveAttribute('data-state', 'idle');

  await page.getByLabel('What').fill('Dentist cleaning');
  await page.getByLabel('Starts at').fill('10:30');
  await page.getByRole('combobox', { name: /^Where/ }).selectOption({ label: 'Hollow Creek Dental' });
  await page.getByLabel('Getting ready really takes (min)').fill('20');
  await page.getByText('Must page', { exact: true }).click();
  await page.getByRole('button', { name: 'Arm the pager' }).click();

  // 17 min drive + 5 min buffer: leave 10:08. 20 min prep x1.5: get ready 9:38.
  await expect(page.getByTestId('add-result')).toHaveText('Armed: 411 at 9:38 AM, 911 at 10:08 AM.');
  await expect(page.getByTestId('page-row')).toHaveCount(2);
  await expect(pager(page)).toHaveAttribute('data-beeps', '0');

  // Jump to the first page: get ready.
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page.getByTestId('vcr-clock')).toContainText('9:38');
  await expect(pager(page)).toHaveAttribute('data-state', 'paging');
  await expect(code(page)).toHaveText('411');
  await expect(page.getByTestId('lcd-text')).toHaveText('GET READY: DENTIST CLEANING 10:30A. LEAVE 10:08A');
  await expect(pager(page)).toHaveAttribute('data-beeps', '1');
  await expect(page.getByTestId('announcer')).toHaveText('Page 411. GET READY: DENTIST CLEANING 10:30A. LEAVE 10:08A');

  await page.getByRole('button', { name: 'Acknowledge page 411', exact: true }).click();
  await expect(pager(page)).toHaveAttribute('data-state', 'idle');
  await expect(page.locator('[data-page-id$=":get-ready"]')).toHaveAttribute('data-status', 'acked');

  // Next: leave now. Ignore it once and it repeats, louder.
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page.getByTestId('vcr-clock')).toContainText('10:08');
  await expect(code(page)).toHaveText('911');
  await expect(page.getByTestId('lcd-text')).toHaveText('LEAVE NOW: DENTIST CLEANING @ 10:30A. 17 MIN AWAY');
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page.getByTestId('vcr-clock')).toContainText('10:11');
  await expect(code(page)).toHaveText('911 911');
  await expect(page.getByTestId('lcd-corner')).toHaveText('x2');
  await expect(pager(page)).toHaveAttribute('data-beeps', '3');

  // ACK from the keyboard. No more repeats are armed.
  await page.keyboard.press('a');
  await expect(pager(page)).toHaveAttribute('data-state', 'idle');
  await expect(page.locator('[data-page-id$=":leave-now"]')).toHaveAttribute('data-status', 'acked');
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page.getByTestId('announcer')).toHaveText('Nothing else will page today or tomorrow.');
  await page.getByRole('button', { name: '+1 hr' }).click();
  await expect(pager(page)).toHaveAttribute('data-beeps', '3');
});

test('an unanswered page goes moot and comes back from memory as 666', async ({ page }) => {
  await page.goto(START);
  await page.getByLabel('What').fill('Pharmacy');
  await page.getByLabel('Starts at').fill('09:00');
  await page.getByRole('combobox', { name: /^Where/ }).selectOption({ label: 'Crossroads Pharmacy' });
  await page.getByLabel('Getting ready really takes (min)').fill('0');
  await page.getByRole('button', { name: 'Arm the pager' }).click();
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(code(page)).toHaveText('911');

  await page.getByRole('button', { name: '+1 hr' }).click();
  await expect(pager(page)).toHaveAttribute('data-state', 'idle');
  await expect(page.locator('[data-page-id$=":leave-now"]')).toHaveAttribute('data-status', 'missed');

  await page.getByRole('button', { name: 'READ' }).click();
  await expect(pager(page)).toHaveAttribute('data-state', 'reading');
  await expect(code(page)).toHaveText('666');
  await expect(page.getByTestId('lcd-text')).toHaveText('MISSED: LEAVE NOW: PHARMACY @ 9:00A. 13 MIN AWAY');
});

test('the daily budget caps beeps and folds the rest into one quiet digest', async ({ page }) => {
  await page.goto('/?at=2026-11-19T06:00&tz=America/Chicago&sample');
  await expect(page.getByTestId('budget')).toContainText('6 of 6');
  const digest = page.getByTestId('digest');
  await expect(digest).toContainText('Gym');
  await expect(digest).toContainText('Pick up prescription');
  await expect(digest).toContainText('Trash and recycling night');

  // The digest is a silent page: it lights the LCD but never beeps.
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page.getByTestId('vcr-clock')).toContainText('7:30');
  await expect(pager(page)).toHaveAttribute('data-state', 'quiet');
  await expect(code(page)).toHaveText('100');
  await expect(pager(page)).toHaveAttribute('data-beeps', '0');
  await page.getByRole('button', { name: 'Acknowledge page 100', exact: true }).click();

  await page.getByRole('tab', { name: 'Settings' }).click();
  await page.getByTestId('budget-range').fill('3');
  await expect(page.getByTestId('budget')).toContainText('3 of 3');
  await expect(digest).toContainText('Quarterly taxes');
});

test('a focus block pages as a body double', async ({ page }) => {
  await page.goto('/?at=2026-11-19T12:50&tz=America/Chicago&sample');
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(code(page)).toHaveText('121');
  await expect(page.getByTestId('lcd-text')).toHaveText('BODY DOUBLE: START QUARTERLY TAXES TIL 3:00P');
  await page.getByRole('button', { name: 'Acknowledge page 121', exact: true }).click();
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page.getByTestId('vcr-clock')).toContainText('1:25');
  await expect(page.getByTestId('lcd-text')).toHaveText('STILL ON QUARTERLY TAXES? 95 MIN LEFT');
});

test('imports an .ics file and pages from it', async ({ page }) => {
  await page.goto(START);
  await page.getByRole('tab', { name: 'Import .ics' }).click();
  await page.getByTestId('ics-input').setInputFiles(FIXTURE);
  await expect(page.getByTestId('import-result')).toContainText('Imported 2 events from two-events.ics');
  await expect(page.locator('[data-page-id="ics-e2e-haircut@example.com:leave-now"]')).toContainText('LEAVE NOW: HAIRCUT @ 2:00P');
  await expect(page.locator('[data-page-id="ics-e2e-review@example.com:leave-now"]')).toContainText(
    'JOIN NOW: DESIGN REVIEW WITH THE PRODUCT TEAM @ 4:00P',
  );

  // Re-importing the same file updates in place instead of duplicating.
  await page.getByTestId('ics-input').setInputFiles(FIXTURE);
  await expect(page.locator('[data-page-id="ics-e2e-haircut@example.com:leave-now"]')).toHaveCount(1);
});

test('runs the day at 900x and pauses itself when the pager goes off', async ({ page }) => {
  await page.goto('/?at=2026-11-19T05:00&tz=America/Chicago&sample');
  await page.getByRole('button', { name: 'Run the day from 6 AM' }).click();
  await expect(page.getByText('PLAY 900x')).toBeVisible();
  // 6:00 to the 7:30 digest is 90 sim minutes: 6 real seconds at 900x.
  await expect(pager(page)).toHaveAttribute('data-state', 'quiet', { timeout: 15_000 });
  await expect(page.getByText('PAUSED')).toBeVisible();
  await expect(page.getByTestId('vcr-clock')).toContainText('7:30');
});

test('keeps the plan across a reload', async ({ page }) => {
  await page.goto(START);
  await page.getByLabel('What').fill('Parent-teacher conference');
  await page.getByLabel('Starts at').fill('16:00');
  await page.getByRole('button', { name: 'Arm the pager' }).click();
  await expect(page.getByTestId('page-row')).toHaveCount(2);
  await page.goto('/?at=2026-11-19T08:00');
  await expect(page.getByTestId('page-row')).toHaveCount(2);
  await expect(page.locator('.books')).toContainText('Parent-teacher conference');
});

test('tabs and the code card work from the keyboard', async ({ page }) => {
  await page.goto(START);
  await page.getByRole('tab', { name: 'Add' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Import .ics' })).toBeFocused();
  await expect(page.getByRole('tab', { name: 'Import .ics' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('heading', { name: 'Wallet code card' })).toBeVisible();
  await expect(page.getByText('Leave now.', { exact: true })).toBeVisible();
});
