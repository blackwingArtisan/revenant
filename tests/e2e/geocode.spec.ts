import { expect, test, type Page } from '@playwright/test';

const START = '/?at=2026-11-19T08:00&tz=America/Chicago';

async function armAt(page: Page, address: string) {
  await page.getByLabel('What').fill('Eye exam');
  await page.getByLabel('Starts at').fill('10:30');
  await page.getByLabel('Or type an address').fill(address);
  await page.getByLabel('Getting ready really takes (min)').fill('0');
  await page.getByRole('button', { name: 'Arm the pager' }).click();
}

// The default geocoder only knows saved places, so these run without any relay.

test('a typed address that is not saved becomes a place and uses the default travel time', async ({ page }) => {
  await page.goto(START);
  await armAt(page, '22 Elm Court, Hollow Creek');
  await expect(page.getByTestId('page-row')).toContainText('LEAVE NOW: EYE EXAM @ 10:30A. 20 MIN AWAY');
  await page.getByRole('tab', { name: 'Settings' }).click();
  await expect(page.locator('.place-list')).toContainText('22 Elm Court, Hollow Creek (no coordinates: 20 min assumed)');
});

test('a typed address that matches a saved place uses that place and its travel time', async ({ page }) => {
  await page.goto(START);
  await armAt(page, '400 Lantern St, Hollow Creek');
  await expect(page.getByTestId('page-row')).toContainText('LEAVE NOW: EYE EXAM @ 10:30A. 17 MIN AWAY');
  await page.getByRole('tab', { name: 'Settings' }).click();
  await expect(page.locator('.place-list li')).toHaveCount(7);
});
