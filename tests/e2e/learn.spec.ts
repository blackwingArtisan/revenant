import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const START = '/?at=2026-11-19T08:00&tz=America/Chicago';
const pager = (page: Page) => page.locator('.pager');
const code = (page: Page) => page.getByTestId('lcd-code');

async function arm(page: Page, startsAt: string) {
  await page.getByLabel('What').fill('Pharmacy run');
  await page.getByLabel('Starts at').fill(startsAt);
  await page.getByRole('combobox', { name: /^Where/ }).selectOption({ label: 'Crossroads Pharmacy' });
  await page.getByLabel('Getting ready really takes (min)').fill('15');
  await page.getByRole('button', { name: 'Arm the pager' }).click();
}

/** Jump to the next page, let it repeat once, then ACK it: an answer at escalation level 1. */
async function ackLate(page: Page, leaveAt: string, repeatAt: string) {
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page.getByTestId('vcr-clock')).toContainText(leaveAt);
  await expect(code(page)).toHaveText('911');
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page.getByTestId('vcr-clock')).toContainText(repeatAt);
  await expect(code(page)).toHaveText('911 911');
  await page.keyboard.press('a');
  await expect(pager(page)).toHaveAttribute('data-state', 'idle');
}

test('learns from two late ACKs, suggests more prep, and applies it only when asked', async ({ page }) => {
  await page.goto(START);
  await arm(page, '09:00');
  await arm(page, '11:00');
  // 13 min away + 5 min buffer: leave 8:42 and 10:42. 15 min prep x1.5 = 23 min: get ready 8:19 and 10:19.
  await expect(page.getByTestId('page-row')).toHaveCount(4);

  // First morning: answer 411 on time, let 911 repeat once (3 min), then ACK.
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(code(page)).toHaveText('411');
  await page.keyboard.press('a');
  await ackLate(page, '8:42', '8:45');
  // One late answer is not a pattern yet.
  await expect(page.getByTestId('prep-suggestion')).toHaveCount(0);

  // Second time: same again.
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page.getByTestId('vcr-clock')).toContainText('10:19');
  await page.keyboard.press('a');
  await ackLate(page, '10:42', '10:45');

  // Two late answers: 15 min + about 3 min late, rounded up to 5.
  const suggestion = page.getByTestId('prep-suggestion');
  await expect(suggestion).toHaveCount(1);
  await expect(suggestion).toContainText('You often ACK this one late. Try 20 min prep instead of 15.');
  const violations = (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()).violations;
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);

  // Nothing has changed yet: the 10:19 page is still on the sheet at its old time.
  await expect(page.locator('[data-page-id$=":get-ready"]').last()).toContainText('10:19 AM');

  // Apply from the keyboard. The second get-ready page moves to 20 min x1.5 = 30 min before leaving.
  const apply = page.getByRole('button', { name: 'Apply 20 min prep for Pharmacy run' });
  await apply.focus();
  await page.keyboard.press('Enter');
  await expect(suggestion).toHaveCount(0);
  await expect(page.getByTestId('announcer')).toHaveText('Prep time for Pharmacy run is now 20 minutes.');
  await expect(page.locator('[data-page-id$=":get-ready"]').last()).toContainText('10:12 AM');
  // Still four pages a day: nothing was added.
  await expect(page.getByTestId('page-row')).toHaveCount(4);
});
