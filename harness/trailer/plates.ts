/**
 * Title-screen plates for the trailer: the game's own title screen (key art + wordmark),
 * screenshotted headless at 1280x720 after the intro settles, with and without the DOM UI.
 *
 *   npx tsx harness/trailer/plates.ts [--out harness/out/trailer/plates]
 */
import fs from 'node:fs';
import path from 'node:path';
import { flagStr, parseArgs } from '../lib/args';
import { launchBrowser } from '../lib/browser';
import { startServer } from '../lib/server';

async function main(): Promise<void> {
  const { flags } = parseArgs();
  const out = path.resolve(flagStr(flags, 'out', 'harness/out/trailer/plates'));
  fs.mkdirSync(out, { recursive: true });
  const server = await startServer({ dev: false });
  const launched = await launchBrowser({ width: 1280, height: 720, logConsole: false });
  try {
    const { page } = launched;
    const cdp = await page.context().newCDPSession(page);
    const shot = async (file: string): Promise<void> => {
      const r = await cdp.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
    };
    await page.goto(server.url, { waitUntil: 'commit' });
    for (const [i, wait] of [1500, 2500, 3000].entries()) {
      await page.waitForTimeout(wait);
      await shot(path.join(out, `title-${i}.png`));
      console.log(`title-${i}.png`);
    }
    // Hide the DOM UI for a clean key-art plate.
    await page.evaluate(() => {
      const ui = document.querySelector('#ui') as HTMLElement | null;
      if (ui) ui.style.visibility = 'hidden';
    });
    await page.waitForTimeout(300);
    await shot(path.join(out, 'title-noui.png'));
    console.log('title-noui.png');
  } finally {
    await launched.close();
    await server.close();
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
