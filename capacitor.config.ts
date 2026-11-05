import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.guyuebo.boschedule',
  appName: '波日程',
  webDir: 'dist',
  android: {
    allowMixedContent: true,
  },
  plugins: {
    SystemBars: {
      initialViewportFitValueHint: 'cover',
      insetsHandling: 'css',
    },
  },
};

export default config;
