import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function violations(page: import('@playwright/test').Page) {
  const r = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

test('no WCAG A/AA violations while paging, on each console tab', async ({ page }) => {
  await page.goto('/?at=2026-11-19T10:00&tz=America/Chicago&sample');
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page.getByTestId('lcd-code')).toHaveText('911');
  expect(await violations(page)).toEqual([]);
  for (const tab of ['Import .ics', 'Settings']) {
    await page.getByRole('tab', { name: tab }).click();
    expect(await violations(page), tab).toEqual([]);
  }
});

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test(`pages with reduced motion: ${reducedMotion}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion });
    await page.goto('/?at=2026-11-19T10:00&tz=America/Chicago&sample');
    await page.getByRole('button', { name: 'Next page' }).click();
    await expect(page.getByTestId('lcd-code')).toHaveText('911');
    const anim = (sel: string) => page.locator(sel).first().evaluate((el) => getComputedStyle(el).animationName);
    // The same page shows either way; only the shaking and scrolling stop.
    const expected = reducedMotion === 'reduce' ? ['none', 'none'] : ['buzz', 'ticker'];
    expect([await anim('.pager'), await anim('.lcd-text')]).toEqual(expected);
    await expect(page.getByTestId('lcd-text')).toHaveText('LEAVE NOW: DENTIST CLEANING @ 10:30A. 17 MIN AWAY');
  });
}
