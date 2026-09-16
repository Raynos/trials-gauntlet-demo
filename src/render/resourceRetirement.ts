import type * as THREE from 'three';

/** The pinned Three r186 wrapper clears `program` when destroy() deletes its GL object. */
export interface ProgramReference { program: unknown }

/** Keep the Three-internal bridge here: r186 releaseMaterialProgramReferences iterates this
 * entire map, not just currentProgram. A material can own skin/instance/shadow variants. */
export function materialPrograms(renderer: THREE.WebGLRenderer, materials: Iterable<THREE.Material>): ProgramReference[] {
  const programs = new Set<ProgramReference>();
  for (const material of materials) {
    const properties = renderer.properties.get(material) as { programs?: Map<string, ProgramReference> };
    for (const program of properties.programs?.values() ?? []) programs.add(program);
  }
  return [...programs];
}

/** Terminal-only bridge for pinned r186: WebGLRenderer.dispose clears properties and its
 * custom shader cache, but WebGLPrograms.dispose does not destroy remaining program wrappers.
 * Call only after all owner callbacks, completion checks, and renderer.dispose; no rendering or
 * material reuse is allowed afterward. Normal live program refcounts are never changed. */
export function releaseTerminalPrograms(renderer: Pick<THREE.WebGLRenderer, 'info'>, contextLost: boolean): { deleted: number; contextReleased: number } {
  const result = { deleted: 0, contextReleased: 0 };
  const programs = renderer.info.programs;
  for (const program of programs ?? []) {
    if (program.program === undefined) continue;
    if (contextLost) {
      program.program = undefined; // Context loss already reclaimed the GL object.
      result.contextReleased++;
    } else {
      program.destroy();
      result.deleted++;
    }
  }
  if (programs) programs.length = 0;
  return result;
}

type Context = Pick<WebGL2RenderingContext, 'getExtension' | 'getProgramParameter' | 'isContextLost'>;
interface Entry { programs: Set<ProgramReference>; dispose(): void }

/** Retain detached resources through asynchronous linking, then invoke their existing owner.
 * Never changes Three's program refcounts, GL methods, or error state. One timer services all
 * retired owners; only the owners of still-linking programs remain retained between polls. */
export class ResourceRetirement {
  private readonly entries = new Set<Entry>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private extension: KHR_parallel_shader_compile | null | undefined;
  private lost = false;
  private failures: unknown[] = [];
  private readonly waiters: { resolve(): void; reject(error: unknown): void }[] = [];
  readonly stats = { requested: 0, released: 0, deferred: 0, pending: 0, maxPending: 0, contextLosses: 0 };

  constructor(private readonly gl: Context, private readonly onError: (error: unknown) => void) {}

  retire(programs: Iterable<ProgramReference>, dispose: () => void): void {
    const entry = { programs: new Set(programs), dispose };
    this.entries.add(entry);
    this.stats.requested++;
    this.poll();
    if (this.entries.has(entry)) this.stats.deferred++;
  }

  whenIdle(): Promise<void> {
    if (!this.entries.size) {
      const errors = this.failures.splice(0);
      return errors.length ? Promise.reject(new AggregateError(errors, 'Resource retirement failed')) : Promise.resolve();
    }
    return new Promise((resolve, reject) => this.waiters.push({ resolve, reject }));
  }

  contextLost(): void {
    this.lost = true;
    this.stats.contextLosses++;
    this.extension = undefined;
    this.poll(); // GL has reclaimed the objects; release application owners without querying them.
  }

  contextRestored(): void {
    this.lost = false;
    this.extension = undefined;
  }

  private fail(error: unknown): void {
    this.failures.push(error);
    this.onError(error);
  }

  private poll(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    const checked = new Map<ProgramReference, boolean>();
    const lost = this.lost || this.gl.isContextLost();
    for (const entry of [...this.entries]) {
      for (const reference of entry.programs) {
        let ready = checked.get(reference);
        if (ready === undefined) {
          ready = lost || reference.program === undefined;
          if (!ready) {
            if (this.extension === undefined) this.extension = this.gl.getExtension('KHR_parallel_shader_compile');
            if (!this.extension) ready = true; // Link completion is synchronous without KHR.
            else {
              try {
                const result: unknown = this.gl.getProgramParameter(reference.program as WebGLProgram, this.extension.COMPLETION_STATUS_KHR);
                if (result !== true && result !== false) throw new Error('Invalid program completion result during retirement');
                ready = result;
              } catch (error) {
                // An invalid handle cannot own a pending link. Preserve the error and release
                // CPU ownership; never read/clear getError or strand the other retired owners.
                this.fail(error);
                ready = true;
              }
            }
          }
          checked.set(reference, ready);
        }
        if (ready) entry.programs.delete(reference);
      }
      if (!entry.programs.size) {
        this.entries.delete(entry);
        try { entry.dispose(); } catch (error) { this.fail(error); }
        this.stats.released++;
      }
    }
    this.stats.pending = this.entries.size;
    this.stats.maxPending = Math.max(this.stats.maxPending, this.entries.size);
    if (this.entries.size) this.timer = setTimeout(() => this.poll(), 10);
    else if (this.waiters.length) {
      const errors = this.failures.splice(0);
      for (const waiter of this.waiters.splice(0)) {
        if (errors.length) waiter.reject(new AggregateError(errors, 'Resource retirement failed'));
        else waiter.resolve();
      }
    }
  }
}
