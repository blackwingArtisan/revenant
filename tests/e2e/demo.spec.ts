import { expect, test, type Page } from '@playwright/test';

const pager = (page: Page) => page.locator('.pager');
const code = (page: Page) => page.getByTestId('lcd-code');

test('one press on an empty pager loads the sample day and runs it, and ACK keeps it running', async ({ page }) => {
  await page.goto('/?fresh&at=2026-11-19T05:00&tz=America/Chicago');
  await expect(page.getByTestId('page-row')).toHaveCount(0);

  // The first screen makes the case: the illustrative before/after, worked out by the engine, and the trial that came before.
  const ba = page.getByTestId('before-after');
  await expect(ba).toContainText('illustrative');
  await expect(ba).toContainText('10:15 AM "Dentist in 15 min"');
  await expect(ba).toContainText('37 min late.');
  await expect(page.getByTestId('ba-leave-alert')).toContainText('10:08 AM "Time to leave"');
  await expect(page.getByTestId('ba-leave-alert')).toContainText('30 min late.');
  await expect(ba).toContainText('9:33 AM 411 get ready');
  await expect(ba).toContainText('5 min early.');
  await expect(page.getByTestId('neuropage')).toContainText('NeuroPage');
  await expect(page.getByTestId('hero-stat')).toContainText('42% of patients in an adult ADHD clinic missed three or more appointments');

  await page.getByTestId('demo-cta').click();
  await expect(page.getByText('PLAY 900x')).toBeVisible();
  await expect(page.getByTestId('page-row').first()).toBeVisible();

  // While the day runs, the day sheet stays at full strength; only the comparison card and the console step back.
  const opacity = (selector: string) => page.locator(selector).first().evaluate((el) => Number(getComputedStyle(el).opacity));
  await page.mouse.move(0, 0);
  expect(await opacity('.sheet')).toBe(1);
  await expect.poll(() => opacity('.ba')).toBeLessThan(1);

  // The learner has two weeks of labelled sample history, so its card shows from the first second.
  const suggestion = page.getByTestId('prep-suggestion');
  await expect(suggestion).toHaveCount(1);
  await expect(suggestion).toContainText("Dinner at Morgan's. You often ACK this one late. Try 40 min prep instead of 30.");
  await expect(page.getByTestId('sample-history-note')).toContainText('Sample history');

  // First stop: the quiet 7:30 digest. Its message starts at the left edge of the LCD, not clipped.
  await expect(pager(page)).toHaveAttribute('data-state', 'quiet', { timeout: 15_000 });
  await expect(code(page)).toHaveText('100');
  await expect(page.getByTestId('vcr-hint')).toContainText('carries on by itself');
  const line = page.getByTestId('lcd-text');
  await expect(line).toHaveText(/^DIGEST \d+: /);
  const [box, text] = await Promise.all([page.locator('.lcd-ticker').boundingBox(), line.boundingBox()]);
  expect(text!.x).toBeGreaterThanOrEqual(box!.x - 1);
  expect(text!.x).toBeLessThan(box!.x + 4);

  // The digest is outside the budget, so the run carries on without an ACK and stops on the next beeping page.
  await expect(pager(page)).toHaveAttribute('data-state', 'paging', { timeout: 20_000 });
  await expect(page.getByTestId('vcr-hint')).toHaveText('Stopped on a page. Press ACK to keep the day running.');
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

test('the demo day takes about a minute and one ACK per budgeted beep', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/?fresh&at=2026-11-19T05:00&tz=America/Chicago');
  const started = Date.now();
  await page.getByTestId('demo-cta').click();
  const report = page.getByTestId('day-report');

  // Press ACK only when the run waits for one; quiet pages and check-ins carry on by themselves.
  let presses = 0;
  for (let i = 0; i < 20; i++) {
    const waiting = await page.waitForFunction(
      () => {
        if (document.querySelector('[data-testid="day-report"]')) return 'done';
        const hint = document.querySelector('[data-testid="vcr-hint"]')?.textContent ?? '';
        return hint.startsWith('Stopped on a page') ? 'ack' : false;
      },
      null,
      { timeout: 60_000 },
    );
    if ((await waiting.jsonValue()) === 'done') break;
    const stoppedAt = await page.getByTestId('vcr-clock').textContent();
    await page.keyboard.press('a');
    presses++;
    await expect(page.getByTestId('vcr-clock')).not.toHaveText(stoppedAt!);
  }
  const seconds = (Date.now() - started) / 1000;

  await expect(report).toBeVisible();
  expect(presses).toBeLessThanOrEqual(7);
  expect(seconds).toBeLessThanOrEqual(75);
  await expect(page.getByTestId('day-report-line')).toHaveText('That was your day: 6 beeps, 4 kept quiet in the digest, 0 missed.');
  await expect(report).toContainText('6 of 6 answered on the first beep');
  await expect(page.getByText('PAUSED')).toBeVisible();
  await expect(page.getByTestId('announcer')).toHaveText('That was your day: 6 beeps, 4 kept quiet in the digest, 0 missed.');

  // Run it again: the receipt goes away and the day replays from 6 AM.
  await page.getByRole('button', { name: 'Run the day again' }).click();
  await expect(report).toHaveCount(0);
  await expect(page.getByText('PLAY 900x')).toBeVisible();
});
