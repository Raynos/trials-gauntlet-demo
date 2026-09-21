import type { CapacitorConfig } from '@capacitor/cli';

// Development identity until the publisher confirms permanent store identifiers.
// Keep local origins stable: saved progress belongs to this app's container.
const config: CapacitorConfig = {
  appId: 'com.trialsgauntlet.game',
  appName: 'Trials Gauntlet',
  webDir: 'dist-native',
  backgroundColor: '#101218',
  ios: { contentInset: 'never' },
  android: { allowMixedContent: false },
  server: {
    hostname: 'localhost', iosScheme: 'capacitor', androidScheme: 'https',
    // Capacitor can detect an unsupported Android WebView before game JavaScript can run.
    errorPath: 'native-unavailable.html',
  },
  plugins: {
    CapacitorUpdater: {
      autoUpdate: 'off',
      updateUrl: '',
      statsUrl: '',
      channelUrl: '',
      resetWhenUpdate: true,
      appReadyTimeout: 120000,
      autoDeletePrevious: true,
      autoDeleteFailed: true,
    },
  },
};

export default config;
