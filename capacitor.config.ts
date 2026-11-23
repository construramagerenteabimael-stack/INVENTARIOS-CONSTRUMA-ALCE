import type { CapacitorConfig } from '@capacitor/cli';

const serverUrl = process.env.CAPACITOR_SERVER_URL;

const config: CapacitorConfig = {
  appId: 'com.construrama.alce.inventarios',
  appName: 'Inventarios Construrama Alce',
  webDir: 'dist',
  server: serverUrl
    ? {
        url: serverUrl,
        cleartext: false,
      }
    : {
        androidScheme: 'https',
        hostname: 'localhost',
      },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
};

export default config;
