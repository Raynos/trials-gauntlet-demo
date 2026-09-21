/** Bind after the renderer's own listeners so its restoration work is already queued. */
export function bindGraphicsLifecycle(
  host: { setGraphicsAvailable(available: boolean): void },
  renderer: { canvas: HTMLCanvasElement; whenReady?(): Promise<void> },
): () => void {
  let epoch = 0;
  let disposed = false;
  const lost = (event: Event): void => {
    event.preventDefault(); // permit restoration, including renderers without Three's listener
    epoch++;
    host.setGraphicsAvailable(false);
  };
  const restored = (): void => {
    const restoring = epoch;
    void Promise.resolve().then(() => renderer.whenReady?.()).then(() => {
      if (!disposed && restoring === epoch) host.setGraphicsAvailable(true);
    }).catch((error: unknown) => {
      // Preserve the pause on a failed rebuild; never run invisible physics or reload saved data.
      console.warn('[trials] graphics restoration failed', error);
    });
  };
  renderer.canvas.addEventListener('webglcontextlost', lost);
  renderer.canvas.addEventListener('webglcontextrestored', restored);
  return () => {
    disposed = true;
    epoch++;
    renderer.canvas.removeEventListener('webglcontextlost', lost);
    renderer.canvas.removeEventListener('webglcontextrestored', restored);
  };
}
