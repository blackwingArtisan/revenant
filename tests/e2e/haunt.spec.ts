import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const pager = (page: Page) => page.locator('.pager');
const code = (page: Page) => page.getByTestId('lcd-code');

/** Plays the one-press demo to its receipt, pressing ACK only when the run waits for one. */
async function playToReceipt(page: Page) {
  await page.goto('/?fresh&at=2026-11-19T05:00&tz=America/Chicago');
  await page.getByTestId('demo-cta').click();
  for (let i = 0; i < 20; i++) {
    const waiting = await page.waitForFunction(
      () => {
        if (document.querySelector('[data-testid="day-report"]')) return 'done';
        return (document.querySelector('[data-testid="vcr-hint"]')?.textContent ?? '').startsWith('Stopped on a page') ? 'ack' : false;
      },
      null,
      { timeout: 60_000 },
    );
    if ((await waiting.jsonValue()) === 'done') return;
    const stoppedAt = await page.getByTestId('vcr-clock').textContent();
    await page.keyboard.press('a');
    await expect(page.getByTestId('vcr-clock')).not.toHaveText(stoppedAt!);
  }
}

test('after the receipt, an ignored page haunts the night and asks to be rebooked the next morning', async ({ page }) => {
  test.setTimeout(180_000);
  await playToReceipt(page);
  await expect(page.getByTestId('day-report-line')).toContainText('0 missed');
  const beeps = await pager(page).getAttribute('data-beeps');

  // Replay the day with the dentist's leave-now page ignored: no beep, straight to the 666.
  await page.getByTestId('ignore-it').click();
  await expect(pager(page)).toHaveAttribute('data-state', 'haunted');
  await expect(code(page)).toHaveText('666');
  await expect(page.getByTestId('lcd-text')).toHaveText(/^HAUNTING: 1 SLIPPED TODAY\. LEAVE NOW: DENTIST CLEANING/);
  await expect(page.locator('.app')).toHaveClass(/app--haunted/);
  await expect(pager(page)).toHaveAttribute('data-beeps', beeps!);
  await expect(page.getByTestId('rip')).toHaveCount(1);
  await expect(page.getByRole('button', { name: /^Resurrect: book a call to rebook LEAVE NOW: DENTIST CLEANING/ })).toBeVisible();
  await expect(page.getByTestId('haunt-card')).toContainText('One page slipped today');

  // The next morning, the first thing on the pager is the missed page, asking to be rebooked.
  await page.getByTestId('next-morning').click();
  await expect(page.getByTestId('vcr-clock')).toContainText('7:00');
  await expect(pager(page)).toHaveAttribute('data-state', 'haunted');
  await expect(page.getByTestId('lcd-text')).toHaveText('666 YESTERDAY: DENTIST CLEANING. REBOOK?');
  await expect(page.getByTestId('rebook-card')).toContainText('Dentist cleaning was missed yesterday.');
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);

  // ACK alone does not make it go away: it wants an answer.
  await page.keyboard.press('a');
  await expect(page.getByTestId('announcer')).toHaveText('Rebook it or let it go first. Both are on the day sheet.');
  await expect(pager(page)).toHaveAttribute('data-state', 'haunted');

  // Rebook: a 15-minute call to fix it, paged as 121 at 9 AM. The 666 is laid to rest.
  await page.getByRole('button', { name: 'Rebook', exact: true }).click();
  await expect(page.getByTestId('rebook-card')).toHaveCount(0);
  await expect(pager(page)).not.toHaveAttribute('data-state', 'haunted');
  const row = page.locator('[data-page-id$=":focus-start"]').filter({ hasText: 'CALL TO REBOOK: DENTIST CLEANING' });
  await expect(row).toContainText('9:00 AM');
  await expect(row).toContainText('121');
});
