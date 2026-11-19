// Captures the README media and the social card from a running production build.
//
//   npm run build && npm run preview          # serves on port 3151
//   node scripts/capture-media.mjs            # or pass another base URL
//
// Writes docs/media/*.png, docs/media/demo.gif (needs ffmpeg on the PATH) and
// public/og.png. Everything shown is the invented sample day.
import { chromium, devices } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.argv[2] ?? 'http://localhost:3151';
const MEDIA = 'docs/media';
const TZ = 'tz=America/Chicago';
mkdirSync(MEDIA, { recursive: true });

const browser = await chromium.launch();
const desktop = { viewport: { width: 1440, height: 900 }, timezoneId: 'America/Chicago', colorScheme: 'dark' };

async function page(options = desktop) {
  const context = await browser.newContext(options);
  return { context, page: await context.newPage() };
}

// The dentist's leave-now page while it repeats, with the LED lit and the ember edge on.
const MID_PAGE = `/?sample&fresh&at=2026-11-19T10:11&${TZ}`;

{
  // Social card, 1200 x 630: the logo, the pitch and the pager mid-page.
  const { context, page: p } = await page({ ...desktop, viewport: { width: 1200, height: 630 } });
  await p.goto(BASE + MID_PAGE);
  await p.getByTestId('lcd-code').filter({ hasText: '911 911' }).waitFor();
  await p.addStyleTag({
    content: `.app{display:grid;grid-template-columns:1fr 470px;align-items:center;min-height:630px;padding:0 48px;gap:24px}
      .masthead{padding:0;margin:0}.logo{font-size:84px}.tagline{font-size:22px}.hero .why,.hero .why--then{display:none}
      .layout{display:block;padding:0;margin:0}.col--work,.keys,.vcr,.card,.dock,.skip{display:none!important}
      .app::before,.app::after,footer{display:none}`,
  });
  await p.waitForTimeout(400);
  await p.screenshot({ path: 'public/og.png' });
  await context.close();
}

{
  // The first screen on a desktop, mid-page.
  const { context, page: p } = await page();
  await p.goto(BASE + MID_PAGE);
  await p.getByTestId('lcd-code').filter({ hasText: '911 911' }).waitFor();
  await p.waitForTimeout(400);
  await p.screenshot({ path: join(MEDIA, 'desktop.png') });
  // The learner's card and the haunting, from the same day.
  await p.locator('.advice').screenshot({ path: join(MEDIA, 'learner.png') });
  await p.goto(BASE + `/?sample&fresh&at=2026-11-19T23:00&${TZ}`);
  await p.getByRole('button', { name: /^Acknowledge/ }).first().click();
  await p.locator('.pager[data-state="haunted"]').waitFor();
  await p.waitForTimeout(500);
  await p.locator('.pager').screenshot({ path: join(MEDIA, 'haunting.png') });
  await context.close();
}

{
  // A phone: the pager is scrolled away and the docked mini pager carries a large ACK.
  const { context, page: p } = await page({ ...devices['Pixel 7'], timezoneId: 'America/Chicago', colorScheme: 'dark' });
  await p.goto(BASE + `/?sample&fresh&at=2026-11-19T10:00&${TZ}`);
  await p.getByRole('button', { name: 'Next page' }).click();
  await p.getByTestId('dock').waitFor();
  await p.waitForTimeout(400);
  await p.screenshot({ path: join(MEDIA, 'phone.png') });
  await context.close();
}

{
  // The one-press demo as a GIF: 411, 911, a repeat, and ACK keeping the day running.
  const videoDir = mkdtempSync(join(tmpdir(), 'revenant-video-'));
  const size = { width: 1280, height: 760 };
  const { context, page: p } = await page({ ...desktop, viewport: size, recordVideo: { dir: videoDir, size } });
  await p.goto(BASE + `/?fresh&at=2026-11-19T05:00&${TZ}`);
  await p.waitForTimeout(700);
  await p.getByTestId('demo-cta').click();
  const pages = [];
  const state = () => p.locator('.pager').getAttribute('data-state');
  for (let i = 0; i < 4; i++) {
    // The run stops on each page: a beeping one (paging) or the quiet digest.
    await p.waitForFunction(() => /^(paging|quiet)$/.test(document.querySelector('.pager')?.getAttribute('data-state') ?? ''), null, { timeout: 30_000 });
    pages.push(`${await p.getByTestId('lcd-code').textContent()} (${await state()})`);
    await p.waitForTimeout(1700);
    await p.keyboard.press('a');
    await p.waitForTimeout(600);
  }
  await context.close();
  const [video] = readdirSync(videoDir).filter((f) => f.endsWith('.webm'));
  execFileSync('ffmpeg', [
    // Played back at about 1.8x so the clip runs about 15 seconds.
    '-y', '-loglevel', 'error', '-ss', '0.6', '-i', join(videoDir, video),
    '-vf', 'setpts=0.55*PTS,fps=8,scale=720:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=64:stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle',
    join(MEDIA, 'demo.gif'),
  ]);
  rmSync(videoDir, { recursive: true, force: true });
  console.log('demo pages:', pages.join(', '));
}

await browser.close();
console.log('wrote', readdirSync(MEDIA).join(', '), 'and public/og.png');
