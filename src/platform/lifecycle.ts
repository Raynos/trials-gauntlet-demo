import { flushStorage } from './storage';

/** Small injectable boundary: no browser code loads Capacitor unless the native target boots. */
export interface LifecycleHost {
  setNativeActive(active: boolean): void;
  /** Return false only at the root screen, where Android may minimize the app. */
  nativeBack(): boolean;
}

interface ListenerHandle { remove(): Promise<void> }
export interface NativeLifecycleAdapter {
  addListener(event: 'appStateChange', callback: (state: { isActive: boolean }) => void): Promise<ListenerHandle>;
  addListener(event: 'backButton', callback: () => void): Promise<ListenerHandle>;
  getState(): Promise<{ isActive: boolean }>;
  minimizeApp(): Promise<void>;
}

/** Own only our listeners, including rollback if registration fails partway through. */
export async function bindNativeLifecycle(host: LifecycleHost, adapter: NativeLifecycleAdapter): Promise<() => Promise<void>> {
  const handles: ListenerHandle[] = [];
  let disposed = false;
  let observedState = false;
  let minimizing = false;
  const dispose = async (): Promise<void> => {
    if (disposed) return;
    disposed = true;
    await Promise.all(handles.map((handle) => handle.remove()));
  };
  try {
    handles.push(await adapter.addListener('appStateChange', ({ isActive }) => {
      observedState = true;
      if (!disposed) {
        host.setNativeActive(isActive);
        if (!isActive) void flushStorage().catch((error: unknown) => console.warn('[trials] save flush failed', error));
      }
    }));
    handles.push(await adapter.addListener('backButton', () => {
      if (disposed || minimizing || host.nativeBack()) return;
      minimizing = true;
      void adapter.minimizeApp().catch((error: unknown) => {
        console.warn('[trials] Android minimize failed', error);
      }).finally(() => { minimizing = false; });
    }));
    const state = await adapter.getState();
    // A live event delivered while querying wins over the potentially stale response.
    if (!observedState) host.setNativeActive(state.isActive);
    return dispose;
  } catch (error) {
    await dispose();
    throw error;
  }
}

export async function installNativeLifecycle(host: LifecycleHost): Promise<() => Promise<void>> {
  const { App } = await import('@capacitor/app');
  return bindNativeLifecycle(host, App);
}
