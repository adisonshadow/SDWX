import { SCREEN_MODES } from '@fmms/shared';

declare global {
  interface Window {
    /** Electron preload 注入：窗口级主/副屏标识，不受 URL / SSO 影响 */
    fmmsScreenMode?: 'main' | 'secondary';
  }
}

/**
 * 是否副屏
 * 1. Electron: preload 注入的 window.fmmsScreenMode（优先）
 * 2. 浏览器调试: /OPWeb/secondary 或 ?fmms_screen=secondary
 */
export function isSecondaryScreen(pathname: string, search: string): boolean {
  if (window.fmmsScreenMode === 'secondary') return true;
  if (window.fmmsScreenMode === 'main') return false;

  if (pathname === '/OPWeb/secondary' || pathname.endsWith('/OPWeb/secondary')) {
    return true;
  }
  const params = new URLSearchParams(search);
  if (params.get('fmms_screen') === 'secondary') return true;
  return params.get('screen') === SCREEN_MODES.SECONDARY;
}
