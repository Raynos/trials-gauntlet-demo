/**
 * The loading screen's renderer — "B Odometer", two tracks (assets/design/loading/SPEC.md §B; the
 * user's decision of 2026-09-15). A dumb painter of `ProgressView`: it can show only what the plan
 * declares, and it shows every fraction as `Math.floor(× 100)` — an integer that reads 100 exactly
 * when the fraction is 1, never before. The drums turn only when a number changes; nothing here
 * animates on a timer except the elapsed clock in the footer.
 *
 * Markup lives in index.html (painted with the first HTML bytes, before this script runs); this file
 * only fills it. Bundled into index.html by the Vite plugin; imported by the jsdom render test.
 */
import type { ProgressView } from './plan';
import { formatBytes } from './plan';

export interface LoaderRenderer {
  paint(view: ProgressView): void;
  /** Painted integers (tests, the headless boot suite reads the same from `data-*`). */
  readonly shown: { download: number; setup: number };
}

const DIGITS = '0123456789'.replace(/./g, '<b>$&</b>');

export function createLoaderRenderer(root: HTMLElement, build: string, now: () => number = () => performance.now()): LoaderRenderer {
  const q = <T extends Element = HTMLElement>(sel: string): T => root.querySelector<T>(sel)!;
  const t0 = now();
  const elapsed = () => `${((now() - t0) / 1000).toFixed(1)} s`;
  const buildEl = q('.build');
  if (buildEl) buildEl.textContent = `build ${build}`;

  interface Track {
    ring: SVGPathElement;
    cols: HTMLElement[];
    line: HTMLElement;
    value: number;
  }
  const track = (cls: string): Track => {
    const g = q(`.gauge.${cls}`);
    const drum = g.querySelector<HTMLElement>('.drum')!;
    const digitColumn = `<span class="col">${DIGITS}</span>`;
    drum.innerHTML = `<span class="col h"><b> </b><b>1</b></span>${digitColumn.repeat(2)}<em>%</em>`;
    const cols = [...drum.querySelectorAll<HTMLElement>('.col')];
    return { ring: g.querySelector<SVGPathElement>('.ring')!, cols, line: g.querySelector<HTMLElement>('.line')!, value: -1 };
  };
  const dl = track('dl');
  const su = track('su');
  const countEl = q('.count');
  const list = q<HTMLOListElement>('ol');
  const errEl = q('.err span');
  const tEl = q('.foot .t');
  const rows = new Map<string, { li: HTMLLIElement; a: HTMLElement; b: HTMLElement }>();
  const shown = { download: 0, setup: 0 };
  let left = false;

  function setNumber(t: Track, frac: number): number {
    // floor: 100 only when the fraction is exactly 1 (the plan's arithmetic at done()), never a rounded 99.6.
    const v = Math.min(100, Math.floor(frac * 100));
    if (v === t.value) return v;
    t.value = v;
    t.ring.style.strokeDashoffset = String(100 - v);
    const h = v >= 100 ? 1 : 0;
    const tens = Math.floor((v % 100) / 10);
    const ones = v % 10;
    [h, tens, ones].forEach((digit, index) => {
      t.cols[index]!.style.transform = `translateY(${-digit}em)`;
    });
    return v;
  }

  function row(key: string, label: string): { li: HTMLLIElement; a: HTMLElement; b: HTMLElement } {
    let r = rows.get(key);
    if (!r) {
      const li = document.createElement('li');
      li.innerHTML = '<span></span><span></span>';
      li.dataset['key'] = key;
      list.appendChild(li);
      r = { li, a: li.children[0] as HTMLElement, b: li.children[1] as HTMLElement };
      rows.set(key, r);
    }
    if (r.a.textContent !== label) r.a.textContent = label;
    return r;
  }

  function paint(view: ProgressView): void {
    if (left) return;
    shown.download = setNumber(dl, view.download);
    shown.setup = setNumber(su, view.setup);
    root.dataset['download'] = String(shown.download);
    root.dataset['setup'] = String(shown.setup);
    root.dataset['done'] = view.done ? '1' : '0';

    const b = view.bytes;
    dl.line.textContent = view.download >= 1 ? `${formatBytes(view.bytesTotal)} · complete` : b ? `${b.label} · ${formatBytes(b.done)} / ${formatBytes(b.total)}` : 'connecting…';
    const cur = view.rows.find((r) => r.key === view.step);
    const pct = cur && cur.state === 'on' && cur.sub > 0 ? ` · ${Math.floor(cur.sub * 100)} %` : '';
    su.line.textContent = view.error ? 'could not start' : view.done ? 'ready' : `${view.label}${view.detail ? ` · ${view.detail}` : ''}${pct}`;
    countEl.textContent = `✓ ${view.doneCount} of ${view.rows.length} done`;

    for (const r of view.rows) {
      const el = row(r.key, r.label);
      el.b.textContent = r.state === 'ok' ? `${Math.round(r.ms)} ms` : r.state === 'on' ? (r.detail ? `${r.detail} · ` : '') + (r.sub > 0 ? `${Math.floor(r.sub * 100)} %` : '…') : '';
      if (el.li.className !== r.state) el.li.className = r.state;
    }
    if (view.after.length) {
      row('after', 'After start').li.className = 'bghead';
      for (const a of view.after) {
        const el = row(`after:${a.key}`, a.label);
        el.b.textContent = a.total ? `${formatBytes(Math.min(a.done, a.total))} / ${formatBytes(a.total)}` : formatBytes(a.done);
        el.li.className = 'bg' + (a.total && a.done >= a.total ? ' in' : '');
      }
    }
    if (view.error) {
      root.classList.add('failed');
      errEl.textContent = view.error;
    }
    if (view.done) {
      left = true;
      tEl.textContent = elapsed();
      root.classList.add('out');
      setTimeout(() => root.remove(), 300); // the 240 ms crossfade; nothing about progress waits on it
    }
  }

  // The footer clock — the one thing that moves on its own, and it is a clock.
  const tick = setInterval(() => {
    if (left || !root.isConnected) return void clearInterval(tick);
    tEl.textContent = elapsed();
  }, 100);


  return { paint, shown };
}
