import { registerPlugin } from '@capacitor/core';

export interface SafeAreaInsets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

interface SafeAreaNativePlugin {
  get(): Promise<SafeAreaInsets>;
  addListener(
    eventName: 'change',
    listener: (insets: SafeAreaInsets) => void,
  ): Promise<{ remove: () => Promise<void> }>;
}

const SafeArea = registerPlugin<SafeAreaNativePlugin>('SafeArea');

function applyInsets(insets: SafeAreaInsets) {
  const root = document.documentElement;
  const set = (name: string, value: number) => root.style.setProperty(name, `${Math.max(0, Math.round(value * 10) / 10)}px`);
  set('--app-safe-top', insets.top);
  set('--app-safe-bottom', insets.bottom);
  set('--app-safe-left', insets.left);
  set('--app-safe-right', insets.right);
}

/** 仅原生端调用：主动读取一次安全区，并跟随旋转/导航模式变化更新。 */
export function initSafeArea() {
  void SafeArea.get().then(applyInsets).catch(() => undefined);
  void SafeArea.addListener('change', applyInsets).catch(() => undefined);
}
