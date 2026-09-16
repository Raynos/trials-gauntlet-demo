import { expect, it, vi } from 'vitest';
import { PostChain } from './chain';

it('disposes the owned composite pass as well as bloom, AO and composer buffers', () => {
  const disposable = () => ({ dispose: vi.fn() });
  const fields = { composer: disposable(), target: disposable(), ao: disposable(), bloom: disposable(), composite: disposable(), renderer: { setRenderTarget: vi.fn() } };
  const chain = Object.assign(Object.create(PostChain.prototype) as object, fields) as unknown as PostChain;
  chain.dispose();
  for (const owner of [fields.composer, fields.target, fields.ao, fields.bloom, fields.composite]) expect(owner.dispose).toHaveBeenCalledOnce();
  expect(fields.renderer.setRenderTarget).toHaveBeenCalledWith(null);
});
