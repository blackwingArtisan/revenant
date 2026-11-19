import { expect, test } from '@playwright/test';

test('the pager powers on: dark glass, 88888, 07734 hELLO, then the CTA wakes', async ({ page }) => {
  // Record every frame the LCD shows, so a short phase cannot slip between two polls.
  await page.addInitScript(() => {
    const frames: string[] = [];
    (window as unknown as { frames_: string[] }).frames_ = frames;
    new MutationObserver(() => {
      const pager = document.querySelector('.pager');
      if (!pager) return;
      const frame = [pager.getAttribute('data-boot') ?? pager.getAttribute('data-state'), document.querySelector('[data-testid="lcd-code"]')?.textContent, document.querySelector('[data-testid="lcd-text"]')?.textContent].join('|');
      if (frames[frames.length - 1] !== frame) frames.push(frame);
    }).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
  });
  await page.goto('/?fresh&boot&at=2026-11-19T07:00&tz=America/Chicago');
  const pager = page.locator('.pager');
  await expect(pager).toHaveAttribute('data-state', 'idle', { timeout: 4000 });
  const frames = await page.evaluate(() => (window as unknown as { frames_: string[] }).frames_);
  const boot = frames.filter((f) => !f.startsWith('idle'));
  expect(boot).toEqual(['dark||', 'flicker||', 'segments|88888|', 'hello|07734|hELLO']);
  await expect(page.getByTestId('lcd-code')).toHaveText(/^7:00/);
  await expect(page.getByTestId('demo-cta')).toHaveClass(/cta--wake/);
});

test('reduced motion skips the power-on sequence, even when asked for', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?fresh&boot&at=2026-11-19T07:00&tz=America/Chicago');
  await expect(page.locator('.pager')).toHaveAttribute('data-state', 'idle');
  await expect(page.getByTestId('lcd-code')).toHaveText(/^7:00/);
  await expect(page.getByTestId('demo-cta')).not.toHaveClass(/cta--wake/);
});

test('a beeping page vibrates in the rhythm of the chirp, longer when it repeats', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { vibrations: number[][] };
    w.vibrations = [];
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: (p: number[]) => (w.vibrations.push(p), true) });
  });
  await page.goto('/?at=2026-11-19T10:00&tz=America/Chicago&sample');
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page.getByTestId('lcd-code')).toHaveText('911');
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page.getByTestId('lcd-code')).toHaveText('911 911');
  const vibrations = await page.evaluate(() => (window as unknown as { vibrations: number[][] }).vibrations);
  // The sample day is already paging at 10:00 (an unanswered get-ready page, at its last repeat), so look at the two newest.
  expect(vibrations.slice(-2)).toEqual([
    [110, 80, 110, 80, 110],
    [110, 80, 110, 80, 110, 80, 110, 80, 110],
  ]);
});

test('a form error outlines the field, marks it invalid and moves focus to it', async ({ page }) => {
  await page.goto('/?fresh&at=2026-11-19T07:00&tz=America/Chicago');
  await page.getByRole('button', { name: 'Arm the pager' }).click();
  const what = page.getByLabel('What');
  await expect(page.getByRole('alert')).toHaveText('Give it a name.');
  await expect(what).toHaveAttribute('aria-invalid', 'true');
  await expect(what).toBeFocused();

  await what.fill('Dentist cleaning');
  await page.getByRole('button', { name: 'Arm the pager' }).click();
  const starts = page.getByLabel('Starts at');
  await expect(page.getByRole('alert')).toHaveText('Pick a date and a start time.');
  await expect(starts).toHaveAttribute('aria-invalid', 'true');
  await expect(starts).toBeFocused();
  await expect(what).not.toHaveAttribute('aria-invalid', 'true');
});

test('the day is visible at a glance: a day bar with a playhead, a red now-line and an ember edge on a loud 911', async ({ page }) => {
  await page.goto('/?at=2026-11-19T10:00&tz=America/Chicago&sample&fresh');
  // 6 AM to midnight is 18 hours, so 10:00 AM sits at 4/18 of the bar.
  const head = await page.getByTestId('daybar-head').evaluate((el) => (el as HTMLElement).style.left);
  expect(parseFloat(head)).toBeCloseTo((4 / 18) * 100, 3);
  await expect(page.getByTestId('daybar').locator('.daybar-tick')).toHaveCount(await page.getByTestId('page-row').count());
  // The now-line sits right before the first page still ahead: the dentist's leave-now at 10:08.
  await expect(page.getByTestId('now-line')).toHaveText('NOW 10:00 AM');
  await expect(page.getByTestId('now-line').locator('xpath=following-sibling::li[1]')).toContainText('LEAVE NOW: DENTIST');

  await expect(page.getByTestId('alarm')).toHaveCount(0);
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page.getByTestId('lcd-code')).toHaveText('911');
  await expect(page.getByTestId('alarm')).toBeAttached();
  await page.getByRole('button', { name: 'Acknowledge page 911' }).click();
  await expect(page.getByTestId('alarm')).toHaveCount(0);
});
