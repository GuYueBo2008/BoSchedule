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
      // 与 index.html 中的 viewport-fit=cover 保持一致，避免首帧安全区跳动
      initialViewportFitValueHint: 'cover',
      insetsHandling: 'css',
    },
  },
};

export default config;
