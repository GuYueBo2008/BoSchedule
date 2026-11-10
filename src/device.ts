import { Capacitor } from '@capacitor/core';

export type DeviceClass = 'phone' | 'tablet' | 'desktop';

function detectDeviceClass(): DeviceClass {
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
  if (!Capacitor.isNativePlatform() && !coarsePointer) return 'desktop';
  const shortSide = Math.min(window.screen.width, window.screen.height);
  return shortSide >= 600 ? 'tablet' : 'phone';
}

/**
 * 把设备类型与屏幕方向写到 <html> 上，供样式表做平板/手机差异化适配。
 * 必须在首次渲染前执行，避免布局跳动。
 */
export function initDeviceClass() {
  const root = document.documentElement;
  const update = () => {
    root.dataset.device = detectDeviceClass();
    root.dataset.orientation = window.innerWidth >= window.innerHeight ? 'landscape' : 'portrait';
  };
  update();
  window.addEventListener('resize', update);
  window.addEventListener('orientationchange', update);
}
