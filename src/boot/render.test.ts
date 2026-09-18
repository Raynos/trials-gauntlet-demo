// @vitest-environment jsdom
/**
 * The Odometer renderer, fed a plan-driven view sequence against the real index.html markup: every painted
 * percentage is an integer (`Math.floor(× 100)`, never a raw float anywhere in the loader's text), 100 is
 * painted only when the fraction is exactly 1, the done count and the two live lines follow the view, and
 * the `after` rows are never done-styled.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createBootPlan, type ProgressView } from './plan';
import { createLoaderRenderer } from './render';
import { BOOT_STEPS, type BootStep } from './steps';

function mountLoader(): HTMLElement {
  const html = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
  const m = /<div id="loader"[\s\S]*?<\/div>\s*<script id="boot">/.exec(html);
  if (!m) throw new Error('index.html: #loader markup not found');
  document.body.innerHTML = m[0].replace(/<script id="boot">$/, '');
  return document.getElementById('loader')!;
}

const FLOAT = /\d+\.\d{3,}/;

describe('loader renderer (Odometer, two tracks)', () => {
  it('paints integers only, 100 only on the done view, and follows the plan', async () => {
    const root = mountLoader();
    const views: ProgressView[] = [];
    const r = createLoaderRenderer(root, 'abc1234', () => views.length);
    const plan = createBootPlan(
      (v) => {
        views.push(v);
        r.paint(v);
        const d = Number(root.dataset['download']);
        const s = Number(root.dataset['setup']);
        expect(Number.isInteger(d) && Number.isInteger(s)).toBe(true);
        expect(d).toBe(Math.floor(v.download * 100));
        expect(s).toBe(Math.floor(v.setup * 100));
        if (d === 100) expect(v.download).toBe(1);
        if (s === 100) expect(v.setup).toBe(1);
        if (s === 100) expect(v.doneCount).toBe(BOOT_STEPS.length); // 100 only once every step completed
        expect(FLOAT.test(root.textContent ?? '')).toBe(false);
      },
      { totals: { core: 1000, heroModels: 4000, bootArt: 1000, offlinePack: 0 } },
    );
    expect(root.querySelector('.build')!.textContent).toBe('build abc1234');
    const core = plan.reader('core');
    const loose = plan as unknown as { step(k: BootStep, w: (p: { set(d: number, t: number, s?: string): void }) => unknown): Promise<unknown>; done(): void };
    core.add(333);
    expect(root.dataset['download']).toBe('5'); // 333 / 6000
    expect(root.querySelector('.gauge.dl .line')!.textContent).toBe('core · 0 KB / 1 KB');
    for (const k of BOOT_STEPS) {
      await loose.step(k, (p) => {
        p.set(1, 2, 'half');
        if (k === 'materials') {
          expect(root.querySelector('.gauge.su .line')!.textContent).toBe('Textures · half · 50 %');
        }
      });
      if (k === 'core') expect(root.querySelector('.gauge.dl .line')!.textContent).toBe('core · 1 KB / 1 KB');
    }
    plan.after('keyArt', 100, 1000);
    const after = root.querySelector('li[data-key="after:keyArt"]')!;
    expect(after.className).toBe('bg');
    plan.after('keyArt', 1000, 1000);
    expect(after.className).toBe('bg in'); // arrived, never a checkmark
    expect(root.querySelector('.count')!.textContent).toBe(`✓ ${BOOT_STEPS.length} of ${BOOT_STEPS.length} done`);
    expect(root.dataset['setup']).toBe('100');
    expect(root.dataset['done']).toBe('0');
    loose.done();
    expect(root.dataset['download']).toBe('100');
    expect(root.dataset['setup']).toBe('100');
    expect(root.dataset['done']).toBe('1');
    expect(root.classList.contains('out')).toBe(true);
    expect(root.querySelectorAll('li.ok').length).toBe(BOOT_STEPS.length);
    expect(r.shown).toEqual({ download: 100, setup: 100 });
  });

  it('a failure paints the message and the retry button without touching the numbers', () => {
    const root = mountLoader();
    const r = createLoaderRenderer(root, 'abc1234', () => 0);
    const plan = createBootPlan((v) => r.paint(v), { totals: { core: 10, heroModels: 0, bootArt: 0, offlinePack: 0 } });
    plan.reader('core').add(5);
    plan.fail('Startup failed: boom');
    expect(root.classList.contains('failed')).toBe(true);
    expect(root.querySelector('.err span')!.textContent).toBe('Startup failed: boom');
    expect(root.dataset['download']).toBe('50');
    expect(root.querySelector('.gauge.su .line')!.textContent).toBe('could not start');
  });
});
