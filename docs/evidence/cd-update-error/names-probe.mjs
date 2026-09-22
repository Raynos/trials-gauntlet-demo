import { webkit, chromium } from 'playwright';
const code = `(() => { var d = Object.defineProperty; var N = (t, v) => d(t, "name", { value: v, configurable: true });
  function a(){ throw new Error('x'); } N(a, 'crashTestSetRun');
  const b = N(() => a(), 'tickFrame');
  class Q { run(){ b(); } }
  function c(){ new Q().run(); } N(c, 'bootFront');
  try { c(); } catch (e) { return e.stack; } })()`;
for (const [n, t] of [['webkit', webkit], ['chromium', chromium]]) { const b = await t.launch(); const p = await b.newPage(); console.log(n, '\n' + await p.evaluate(code)); await b.close(); }
