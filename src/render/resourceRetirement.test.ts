import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { materialPrograms, releaseTerminalPrograms, ResourceRetirement, type ProgramReference } from './resourceRetirement';

afterEach(() => vi.useRealTimers());

function fixture(extension = true) {
  vi.useFakeTimers();
  const complete = new Map<unknown, boolean | null>();
  const gl = {
    isContextLost: vi.fn(() => false),
    getExtension: vi.fn(() => extension ? { COMPLETION_STATUS_KHR: 0x91b1 } : null),
    getProgramParameter: vi.fn((program: unknown): boolean | null => complete.has(program) ? complete.get(program)! : false),
    getError: vi.fn(),
  };
  const error = vi.fn();
  const queue = new ResourceRetirement(gl as unknown as WebGL2RenderingContext, error);
  const program = (): ProgramReference => ({ program: {} });
  return { queue, gl, complete, error, program };
}

describe('resource retirement', () => {
  it('snapshots every material variant in pinned Three properties, including a non-current variant', () => {
    const a = new THREE.MeshStandardMaterial(), b = a.clone(), unused = a.clone();
    const skin = { program: {} }, instance = { program: {} };
    const properties = new Map<THREE.Material, { currentProgram: ProgramReference; programs: Map<string, ProgramReference> }>([[a, { currentProgram: skin, programs: new Map([['skin', skin], ['instance', instance]]) }],
      [b, { currentProgram: skin, programs: new Map([['shared', skin]]) }]]);
    const renderer = { properties: { get: (material: THREE.Material) => properties.get(material) ?? {} } } as unknown as THREE.WebGLRenderer;
    expect(materialPrograms(renderer, [a, b, unused])).toEqual([skin, instance]);
  });

  it('holds all variants, checks shared programs once per poll, and preserves the live owner refcount', async () => {
    const f = fixture(), skin = f.program(), instance = f.program();
    let refs = 2;
    const destroy = vi.fn(), oldDispose = vi.fn(() => { if (--refs === 0) destroy(); });
    f.complete.set(skin.program, true);
    f.queue.retire([skin, instance], oldDispose);
    const extraDispose = vi.fn();
    f.queue.retire([instance], extraDispose);
    f.gl.getProgramParameter.mockClear();
    await vi.advanceTimersByTimeAsync(10);
    expect(f.gl.getProgramParameter).toHaveBeenCalledTimes(1);
    expect(oldDispose).not.toHaveBeenCalled();
    const idle = f.queue.whenIdle();
    f.complete.set(instance.program, true);
    await vi.advanceTimersByTimeAsync(10);
    await idle;
    expect(oldDispose).toHaveBeenCalledOnce();
    expect(extraDispose).toHaveBeenCalledOnce();
    expect(refs).toBe(1);
    expect(destroy).not.toHaveBeenCalled();
    f.queue.retire([instance], () => { if (--refs === 0) destroy(); });
    expect(destroy).toHaveBeenCalledOnce();
    expect(f.queue.stats.pending).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    expect(f.gl.getError).not.toHaveBeenCalled();
  });

  it('releases uncompiled resources and synchronous-link backends immediately', async () => {
    const f = fixture(false), dispose = vi.fn();
    f.queue.retire([], dispose);
    f.queue.retire([f.program()], dispose);
    await f.queue.whenIdle();
    expect(dispose).toHaveBeenCalledTimes(2);
    expect(f.gl.getProgramParameter).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('reclaims application owners on context loss without polling stale handles, then restores cleanly', async () => {
    const f = fixture(), old = f.program(), dispose = vi.fn();
    f.queue.retire([old], dispose);
    const idle = f.queue.whenIdle();
    f.gl.getProgramParameter.mockClear();
    f.queue.contextLost();
    await idle;
    expect(dispose).toHaveBeenCalledOnce();
    expect(f.gl.getProgramParameter).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    f.queue.contextRestored();
    const next = f.program(), nextDispose = vi.fn();
    f.queue.retire([next], nextDispose);
    expect(nextDispose).not.toHaveBeenCalled();
    f.complete.set(next.program, true);
    await vi.runAllTimersAsync();
    expect(nextDispose).toHaveBeenCalledOnce();
    expect(f.gl.getProgramParameter.mock.calls.every(([program]) => program === next.program)).toBe(true);
  });

  it('surfaces invalid queries and callback failures, still cleans other owners, and permits later retirement', async () => {
    const f = fixture(), broken = f.program(), healthy = f.program();
    f.queue.retire([broken], () => { throw new Error('owner failure'); });
    const dispose = vi.fn();
    f.queue.retire([healthy], dispose);
    const rejected = expect(f.queue.whenIdle()).rejects.toThrow('Resource retirement failed');
    f.gl.getProgramParameter.mockImplementation((program: unknown) => program === broken.program ? null : true);
    await vi.runAllTimersAsync();
    await rejected;
    expect(f.error).toHaveBeenCalledTimes(2);
    expect(dispose).toHaveBeenCalledOnce();
    expect(f.queue.stats.pending).toBe(0);
    f.queue.retire([], dispose);
    await f.queue.whenIdle();
    expect(dispose).toHaveBeenCalledTimes(2);
    expect(f.gl.getError).not.toHaveBeenCalled();
  });

  it('destroys terminal cache wrappers only after completion, once, without changing a live refcount', async () => {
    const f = fixture();
    const reference = { program: {} as unknown, usedTimes: 1, destroy: vi.fn(() => { reference.program = undefined; }) };
    const renderer = { info: { programs: [reference] } } as unknown as THREE.WebGLRenderer;
    const released: { deleted: number; contextReleased: number }[] = [];
    f.queue.retire([reference], () => released.push(releaseTerminalPrograms(renderer, false)));
    expect(reference.usedTimes).toBe(1);
    expect(reference.destroy).not.toHaveBeenCalled();
    f.complete.set(reference.program, true);
    await vi.runAllTimersAsync();
    expect(released).toEqual([{ deleted: 1, contextReleased: 0 }]);
    expect(releaseTerminalPrograms(renderer, false)).toEqual({ deleted: 0, contextReleased: 0 });
    expect(reference.destroy).toHaveBeenCalledOnce();
    expect(renderer.info.programs).toEqual([]);
  });

  it('drops terminal cache references on context loss without querying or deleting invalid GL objects', async () => {
    const f = fixture(), reference = { program: {} as unknown, destroy: vi.fn() };
    const renderer = { info: { programs: [reference] } } as unknown as THREE.WebGLRenderer;
    f.queue.retire([reference], () => {
      expect(releaseTerminalPrograms(renderer, true)).toEqual({ deleted: 0, contextReleased: 1 });
    });
    f.gl.getProgramParameter.mockClear();
    f.queue.contextLost();
    await f.queue.whenIdle();
    expect(reference.program).toBeUndefined();
    expect(reference.destroy).not.toHaveBeenCalled();
    expect(f.gl.getProgramParameter).not.toHaveBeenCalled();
    expect(renderer.info.programs).toEqual([]);
    expect(releaseTerminalPrograms(renderer, true)).toEqual({ deleted: 0, contextReleased: 0 });
  });
});
