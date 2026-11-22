import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// Full Chromium in new headless mode grants notification permission, so the no-notification check is real.
test.use({ channel: 'chromium', permissions: ['notifications'] });

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const SAMPLE_AT = '/?fresh&sample&at=2026-11-19T10:00&tz=America/Chicago';
const RELOAD_AT = '/?at=2026-11-19T10:00&tz=America/Chicago';
const MESSAGE = 'SAM: OWNER MISSED 911, LEAVE FOR DENTIST CLEANING. STARTS 10:30A';

const secondary = (page: Page) => page.getByTestId('secondary-pager');
const escalationRow = (page: Page) => page.locator('[data-page-id="sample-dentist:escalate"]');

async function openSettings(page: Page) {
  await page.getByRole('tab', { name: 'Settings' }).click();
}

/** Types a name and flips the on-call switch, the way a person would. */
async function turnOn(page: Page, name: string) {
  await openSettings(page);
  await page.getByTestId('on-call-name').fill(name);
  await page.getByTestId('on-call-switch').check();
}

/** Jumps from beep to beep until the secondary pager is paging (10:19 on the sample day). */
async function reachSecondaryPage(page: Page) {
  const clock = page.getByTestId('vcr-clock');
  for (let i = 0; i < 12 && !((await clock.textContent()) ?? '').includes('10:19'); i++) {
    const before = await clock.textContent();
    await page.getByRole('button', { name: 'Next page' }).click();
    await expect(clock).not.toHaveText(before!);
  }
  await expect(clock).toContainText('10:19');
  await expect(secondary(page)).toHaveAttribute('data-state', 'paging');
}

async function violations(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

/** Records the pitch of every chirp, so a test can tell the secondary's (1900 Hz) from the owner's. */
async function spyOnChirps(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __chirps: number[] };
    w.__chirps = [];
    const start = OscillatorNode.prototype.start;
    OscillatorNode.prototype.start = function (this: OscillatorNode, ...args: [number?]) {
      w.__chirps.push(this.frequency.value);
      return start.apply(this, args);
    };
  });
}
const chirps = (page: Page) => page.evaluate(() => (window as unknown as { __chirps: number[] }).__chirps);

test('turning it on needs a valid name, and a refusal keeps it off (Req 1.2, 1.4, 1.5, 1.6)', async ({ page }) => {
  await page.goto(SAMPLE_AT);
  await expect(secondary(page)).toHaveCount(0);
  await openSettings(page);
  const name = page.getByTestId('on-call-name');
  const toggle = page.getByTestId('on-call-switch');

  // Empty (Req 1.4).
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  await expect(page.getByTestId('on-call-error')).toBeVisible();
  await expect(name).toHaveAttribute('aria-invalid', 'true');
  await expect(name).toHaveAttribute('aria-describedby', /on-call-error/);
  await expect(secondary(page)).toHaveCount(0);

  // 25 characters (Req 1.5).
  await name.fill('x'.repeat(25));
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  await expect(page.getByTestId('on-call-error')).toBeVisible();

  // A control character (Req 1.6).
  await name.fill('Sa\u0007m');
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  await expect(page.getByTestId('on-call-error')).toBeVisible();
  await expect(secondary(page)).toHaveCount(0);

  // A valid name with stray spaces turns it on, trimmed (Req 1.2, 1.3).
  await name.fill('  Sam  ');
  await toggle.check();
  await expect(toggle).toBeChecked();
  await expect(page.getByTestId('on-call-error')).toHaveCount(0);
  await expect(name).toHaveAttribute('aria-invalid', 'false');
  await expect(name).toHaveValue('Sam');
  await expect(secondary(page)).toHaveAttribute('data-state', 'idle');
  await expect(page.getByTestId('secondary-text')).toHaveText('ON CALL: SAM');
});

test('the setting survives a reload; an old or malformed snapshot loads with it off (Req 1.7, 1.9, 9.1, 9.3)', async ({ page }) => {
  await page.goto(SAMPLE_AT);
  await turnOn(page, 'Sam');
  await expect(secondary(page)).toBeVisible();

  await page.goto(RELOAD_AT);
  await openSettings(page);
  await expect(page.getByTestId('on-call-switch')).toBeChecked();
  await expect(page.getByTestId('on-call-name')).toHaveValue('Sam');
  await expect(page.getByTestId('secondary-text')).toHaveText('ON CALL: SAM');

  // Turning it off keeps the name, and turning it on again restores it (Req 1.7).
  await page.getByTestId('on-call-switch').uncheck();
  await expect(secondary(page)).toHaveCount(0);
  await expect(page.getByTestId('on-call-name')).toHaveValue('Sam');
  await page.getByTestId('on-call-switch').check();
  await expect(page.getByTestId('secondary-text')).toHaveText('ON CALL: SAM');

  // A snapshot saved before the feature existed has no onCall at all (Req 9.3).
  await page.evaluate(() => {
    const snap = JSON.parse(localStorage.getItem('revenant-pager:v1')!);
    delete snap.settings.onCall;
    localStorage.setItem('revenant-pager:v1', JSON.stringify(snap));
  });
  await page.goto(RELOAD_AT);
  await expect(secondary(page)).toHaveCount(0);
  await openSettings(page);
  await expect(page.getByTestId('on-call-switch')).not.toBeChecked();
  await expect(page.getByTestId('page-row').first()).toBeVisible();

  // A malformed one is treated as off and the rest of the snapshot loads (Req 1.9).
  await page.evaluate(() => {
    const snap = JSON.parse(localStorage.getItem('revenant-pager:v1')!);
    snap.settings.onCall = { enabled: 'yes', name: 42 };
    localStorage.setItem('revenant-pager:v1', JSON.stringify(snap));
  });
  await page.goto(RELOAD_AT);
  await expect(secondary(page)).toHaveCount(0);
  await expect(page.getByTestId('page-row').first()).toBeVisible();
});

test('at 10:19 the secondary pager pages once; key S acknowledges it; a reload does not beep it again (Req 4.4, 4.5, 6.4, 9.2, 10.2)', async ({ page }) => {
  await spyOnChirps(page);
  await page.goto(SAMPLE_AT);
  await turnOn(page, 'Sam');
  await reachSecondaryPage(page);

  await expect(page.getByTestId('vcr-clock')).toContainText('10:19');
  await expect(page.getByTestId('secondary-label')).toHaveText('SECONDARY ON CALL');
  await expect(secondary(page)).toHaveAccessibleName('SECONDARY ON CALL');
  await expect(page.getByTestId('secondary-code')).toHaveText('999');
  await expect(page.getByTestId('secondary-text')).toHaveText(MESSAGE);
  await expect(page.getByTestId('announcer')).toHaveText(`Secondary on call. Page 999. ${MESSAGE}`);
  // Announced without moving focus, and the owner's own pager never shows it (Req 10.5, 4.7).
  expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe('DIALOG');
  await expect(page.getByTestId('lcd-code')).not.toHaveText('999');
  // One chirp, lower than the owner's (Req 4.5).
  expect((await chirps(page)).filter((hz) => hz === 1900)).toHaveLength(1);
  await expect(page.getByTestId('secondary-ack')).toHaveAccessibleName('Acknowledge secondary page 999');

  // A reload before ACK keeps the page showing but does not beep or announce it again (Req 9.2).
  await page.goto('/?at=2026-11-19T10:19&tz=America/Chicago');
  await expect(secondary(page)).toHaveAttribute('data-state', 'paging');
  await expect(page.getByTestId('announcer')).toHaveText('');
  expect((await chirps(page)).filter((hz) => hz === 1900)).toHaveLength(0);

  // Key S, outside a text field, acknowledges only the secondary page (Req 6.4, 10.2).
  await page.locator('body').click({ position: { x: 1, y: 1 } });
  await page.keyboard.press('s');
  await expect(secondary(page)).toHaveAttribute('data-state', 'idle');
  await expect(page.getByTestId('secondary-text')).toContainText("SAM ACK'D AT 10:19");
  await expect(escalationRow(page)).toHaveAttribute('data-status', 'acked');
  await expect(page.locator('[data-page-id="sample-dentist:leave-now"]')).toHaveAttribute('data-status', 'paging');

  await page.goto('/?at=2026-11-19T10:25&tz=America/Chicago');
  await expect(secondary(page)).toHaveAttribute('data-state', 'idle');
  await expect(escalationRow(page)).toHaveAttribute('data-status', 'acked');
  expect((await chirps(page)).filter((hz) => hz === 1900)).toHaveLength(0);
});

test('the button works from the keyboard too (Req 6.4, 10.1)', async ({ page }) => {
  await page.goto(SAMPLE_AT);
  await turnOn(page, 'Sam');
  await reachSecondaryPage(page);
  await page.getByTestId('secondary-ack').focus();
  await expect(page.getByTestId('secondary-ack')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(secondary(page)).toHaveAttribute('data-state', 'idle');
});

test('answering the 911 at 10:16 cancels the escalation; unanswered it shows missed at 10:30 (Req 6.1, 6.7, 7.1, 7.2)', async ({ page }) => {
  await page.goto(SAMPLE_AT);
  await turnOn(page, 'Sam');
  // The day sheet lists the escalation row before anything happens: code, time, name and status (Req 7.1).
  await expect(escalationRow(page)).toContainText('999');
  await expect(escalationRow(page)).toContainText('10:19 AM');
  await expect(escalationRow(page)).toContainText('Sam');
  await expect(escalationRow(page)).toHaveAttribute('data-status', 'scheduled');

  // Answer the 911 at 10:16, three minutes before the escalation instant.
  for (let i = 0; i < 6; i++) {
    if ((await page.getByTestId('vcr-clock').textContent())?.includes('10:11')) break;
    await page.getByRole('button', { name: 'Next page' }).click();
  }
  await expect(page.getByTestId('vcr-clock')).toContainText('10:11');
  await page.getByRole('button', { name: '+5 min' }).click();
  await expect(page.getByTestId('vcr-clock')).toContainText('10:16');
  await expect(page.getByTestId('lcd-code')).toHaveText(/^911/);
  await page.keyboard.press('a');
  await page.getByRole('button', { name: '+15 min' }).click();
  await expect(page.getByTestId('vcr-clock')).toContainText('10:31');
  await expect(escalationRow(page)).toHaveAttribute('data-status', 'cancelled');
  await expect(escalationRow(page).getByTestId('cancelled')).toHaveText('cancelled, you answered');
  await expect(secondary(page)).toHaveAttribute('data-state', 'idle');
  await expect(page.getByTestId('secondary-text')).toHaveText('ON CALL: SAM');

  // Unanswered: Sam is paged and never answers, so it ends missed at the cutoff (Req 6.7).
  await page.goto(SAMPLE_AT);
  await turnOn(page, 'Sam');
  await reachSecondaryPage(page);
  await page.getByRole('button', { name: '+15 min' }).click();
  await expect(page.getByTestId('vcr-clock')).toContainText('10:34');
  await expect(secondary(page)).toHaveAttribute('data-state', 'missed');
  await expect(page.getByTestId('secondary-text')).toContainText('MISSED: SAM DID NOT ACK.');
  await expect(escalationRow(page)).toHaveAttribute('data-status', 'missed');
  await expect(escalationRow(page)).toContainText('Missed');
});

test('the replay shows the 911s slip, the secondary on the secondary pager, and the 666 (Req 8.2)', async ({ page }) => {
  test.setTimeout(180_000);
  await spyOnChirps(page);
  await page.goto('/?fresh&at=2026-11-19T05:00&tz=America/Chicago');
  await openSettings(page);
  await page.getByTestId('on-call-name').fill('Sam');
  await page.getByTestId('on-call-switch').check();
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
    if ((await waiting.jsonValue()) === 'done') break;
    const stoppedAt = await page.getByTestId('vcr-clock').textContent();
    await page.keyboard.press('a');
    await expect(page.getByTestId('vcr-clock')).not.toHaveText(stoppedAt!);
  }
  await expect(page.getByTestId('day-report')).toBeVisible();
  // Every 911 was answered, so nothing escalated and the receipt says nothing about Sam.
  await expect(page.getByTestId('day-report-line')).not.toContainText('escalated');
  const beeps = await page.locator('.pager').getAttribute('data-beeps');
  const chirpsBefore = (await chirps(page)).length;

  await page.getByTestId('ignore-it').click();
  await expect(page.locator('.pager')).toHaveAttribute('data-state', 'haunted');
  await expect(page.getByTestId('lcd-code')).toHaveText('666');
  await expect(secondary(page)).toHaveAttribute('data-state', 'missed');
  await expect(page.getByTestId('secondary-code')).toHaveText('999');
  await expect(page.getByTestId('secondary-text')).toContainText(MESSAGE);
  // The other pages were answered, so their escalation pages stay cancelled; only the dentist's is on the sheet as missed.
  await expect(escalationRow(page)).toHaveAttribute('data-status', 'missed');
  // Nothing sounded on the way (Req 8.4).
  await expect(page.locator('.pager')).toHaveAttribute('data-beeps', beeps!);
  expect((await chirps(page)).length).toBe(chirpsBefore);
});

test('saving the name and the escalation beep make no network request and no notification (Req 1.8, 12.5)', async ({ page }) => {
  await page.goto(SAMPLE_AT);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  const requests: string[] = [];
  page.on('request', (r) => {
    if (!r.url().startsWith('data:')) requests.push(`${r.method()} ${r.url()}`);
  });

  await turnOn(page, 'Sam');
  await expect(page.getByTestId('on-call-switch')).toBeChecked();
  await reachSecondaryPage(page);
  // The owner's 911 became a notification, the escalation did not.
  const notified = () =>
    page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready;
      return (await reg.getNotifications()).map((n) => n.title);
    });
  await expect.poll(async () => (await notified()).some((t) => t.startsWith('911'))).toBe(true);
  expect((await notified()).some((t) => t.startsWith('999'))).toBe(false);
  expect(requests.filter((r) => !r.startsWith('GET http://localhost'))).toEqual([]);
  expect(requests.filter((r) => r.startsWith('POST') || r.includes('amazonaws') || r.includes('relay'))).toEqual([]);
});

test('no WCAG 2.1 A/AA violations while the secondary pager is paging (Req 10.4)', async ({ page }) => {
  await page.goto(SAMPLE_AT);
  await turnOn(page, 'Sam');
  await expect(page.getByTestId('on-call-form')).toBeVisible();
  expect(await violations(page), 'settings with escalation on').toEqual([]);
  await reachSecondaryPage(page);
  expect(await violations(page), 'secondary paging').toEqual([]);
  await page.getByTestId('on-call-name').fill('');
  await page.getByTestId('on-call-name').blur();
  await expect(page.getByTestId('on-call-error')).toBeVisible();
  expect(await violations(page), 'settings with an error shown').toEqual([]);
});

test('reduced motion shows the secondary still with the same text (Req 11.1)', async ({ page }) => {
  const seen: Record<string, { text: string; code: string; animation: string }> = {};
  for (const reducedMotion of ['no-preference', 'reduce'] as const) {
    await page.emulateMedia({ reducedMotion });
    await page.goto(SAMPLE_AT);
    await turnOn(page, 'Sam');
    await reachSecondaryPage(page);
    seen[reducedMotion] = {
      text: (await page.getByTestId('secondary-text').textContent()) ?? '',
      code: (await page.getByTestId('secondary-code').textContent()) ?? '',
      animation: await page.locator('.secondary').evaluate((el) => getComputedStyle(el).animationName),
    };
  }
  expect(seen['no-preference']!.animation).toBe('buzz');
  expect(seen['reduce']!.animation).toBe('none');
  expect(seen['reduce']!.text).toBe(MESSAGE);
  expect(seen['reduce']!.text).toBe(seen['no-preference']!.text);
  expect(seen['reduce']!.code).toBe('999');
});

test('MUTE removes the chirp but the secondary page still shows and is announced (Req 11.2)', async ({ page }) => {
  await spyOnChirps(page);
  await page.goto(SAMPLE_AT);
  await turnOn(page, 'Sam');
  await page.getByRole('button', { name: 'MUTE' }).click();
  await expect(page.getByRole('button', { name: 'SOUND' })).toBeVisible();
  // Page 411 may already have chirped while the app loaded at 10:00; count only what happens after MUTE.
  const before = (await chirps(page)).length;
  await reachSecondaryPage(page);
  await expect(page.getByTestId('secondary-text')).toHaveText(MESSAGE);
  await expect(page.getByTestId('announcer')).toHaveText(`Secondary on call. Page 999. ${MESSAGE}`);
  expect((await chirps(page)).length).toBe(before);
});
