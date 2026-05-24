import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.bahjat.mykitchen',
  appName: 'MyKitchen',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
