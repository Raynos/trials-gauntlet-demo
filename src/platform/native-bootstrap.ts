/** Loaded only by the native build before constructing the shared game. */
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { bootstrapNativeStorage } from './native-storage';
import { createNativeUpdater, readUpdateConfig } from './updates';

export async function prepareNativeApp() {
  const saves = await bootstrapNativeStorage();
  const platform = Capacitor.getPlatform();
  if (platform !== 'ios' && platform !== 'android') throw new Error('Unsupported native platform');
  const info = await App.getInfo();
  const url = platform === 'ios' ? import.meta.env.VITE_MOBILE_MANIFEST_IOS : import.meta.env.VITE_MOBILE_MANIFEST_ANDROID;
  const config = readUpdateConfig(url, import.meta.env.VITE_MOBILE_PUBLIC_KEY);
  const updater = createNativeUpdater({
    adapter: CapacitorUpdater,
    storage: saves.storage,
    host: { platform, nativeVersion: info.version, runtime: 'native-v1', saveSchema: 1 },
    config,
  });
  if (await updater.activateStagedAtBoot() === 'activated') return null;
  return {
    async ready(): Promise<void> {
      await updater.notifyReady();
      // Update availability must never hold gameplay hostage to the network.
      void updater.checkForUpdate();
    },
  };
}
