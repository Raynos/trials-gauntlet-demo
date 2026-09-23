// Renders the in-game wordmark (src/ui/brand.ts) in headless Chromium and WebKit, cream on teal, to check the
// survey-target O paints the same in both engines (the loader, the menu and the ticket use this exact markup).
//
//   pnpm exec tsx assets/brand/tools/svg-check.mts <out-prefix>      → <out-prefix>-chromium.png, -webkit.png
import { chromium, webkit } from 'playwright';
import { wordmarkSvg } from '../../../src/ui/brand';

const prefix = process.argv[2] ?? '/tmp/rockhop-wordmark';
const svg = `${wordmarkSvg()}${wordmarkSvg({ className: 'b' })}`;
for (const [name, bt] of [['chromium', chromium], ['webkit', webkit]] as const) {
  const b = await bt.launch();
  const p = await b.newPage({ viewport: { width: 760, height: 260 } });
  await p.setContent(`<body style="margin:0;background:#0F5C63;color:#EFE3C8"><div style="width:700px;padding:20px;display:grid;gap:20px">${svg}</div><style>svg{width:100%;height:auto;display:block}.b{color:#0F5C63;background:#EFE3C8}</style></body>`);
  await p.screenshot({ path: `${prefix}-${name}.png` });
  await b.close();
}
console.log(`wrote ${prefix}-chromium.png / -webkit.png`);
