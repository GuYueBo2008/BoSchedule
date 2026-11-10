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
      // 安全区改由 SafeArea 原生插件读取后交给网页处理，关闭内置注入避免重复处理。
      insetsHandling: 'disable',
    },
  },
};

export default config;
