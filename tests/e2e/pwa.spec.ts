import { expect, test } from '@playwright/test';

/** The production build's service worker: lock-screen pages with an ACK action, and the offline shell. */

// The headless shell refuses notification permission; full Chromium in new headless mode grants it.
test.use({ channel: 'chromium', permissions: ['notifications'] });

test('a page reaches the service worker as a notification, and its ACK action acknowledges it in the app', async ({ page, context }) => {
  const worker = context.waitForEvent('serviceworker');
  await page.goto('/?fresh&sample&at=2026-11-19T09:00&tz=America/Chicago');
  const sw = await worker;
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // Clear the quiet morning digest first, so the only thing left is the beep under test.
  await page.getByRole('button', { name: 'Acknowledge page 100', exact: true }).click();
  await expect(page.locator('.pager')).toHaveAttribute('data-state', 'idle');

  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page.getByTestId('lcd-code')).toHaveText('911');

  await expect
    .poll(
      () =>
        sw.evaluate(async () =>
          (await (self as unknown as ServiceWorkerGlobalScope).registration.getNotifications()).map((n) => ({
            title: n.title,
            body: n.body,
            actions: (n as Notification & { actions?: { action: string }[] }).actions?.map((a) => a.action) ?? [],
            pageId: (n.data as { pageId?: string } | null)?.pageId ?? null,
          })),
        ),
      { timeout: 10_000 },
    )
    .toEqual([expect.objectContaining({ title: '911', actions: ['ack'], pageId: expect.stringMatching(/:leave-now$/) })]);

  // Press ACK on the notification: the worker's click handler relays it to the open app.
  await sw.evaluate(async () => {
    const scope = self as unknown as ServiceWorkerGlobalScope & {
      handleNotificationClick: (n: Notification, action: string) => Promise<unknown>;
    };
    const [n] = await scope.registration.getNotifications();
    await scope.handleNotificationClick(n!, 'ack');
  });
  await expect(page.locator('.pager')).toHaveAttribute('data-state', 'idle');
  await expect(page.getByTestId('announcer')).toHaveText('Page acknowledged.');
  expect(await sw.evaluate(async () => (await (self as unknown as ServiceWorkerGlobalScope).registration.getNotifications()).length)).toBe(0);
});

test('the app shell loads offline once the service worker has cached it', async ({ page, context }) => {
  await page.goto('/?fresh&at=2026-11-19T08:00&tz=America/Chicago');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // A second online load runs under the worker, which caches the built assets.
  await page.reload();
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
  await expect(page.getByRole('heading', { name: /Revenant/ })).toBeVisible();

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: /Revenant/ })).toBeVisible();
  await expect(page.locator('.pager')).toBeVisible();
  await context.setOffline(false);
});
