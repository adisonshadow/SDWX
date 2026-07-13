/**
 * SecondaryScreenToggle — Electron 主屏 header 副屏开关
 */
import { useCallback, useEffect, useState } from 'react';
import { FundProjectionScreenOutlined } from '@ant-design/icons';

export default function SecondaryScreenToggle() {
  const api = window.electronAPI;
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!api?.getSecondaryOpen) return;
    void api.getSecondaryOpen().then(setOpen);
    const off = api.onSecondaryChanged?.((next) => setOpen(next));
    return () => off?.();
  }, [api]);

  const toggle = useCallback(async () => {
    if (!api?.toggleSecondary) return;
    const next = await api.toggleSecondary();
    setOpen(next);
  }, [api]);

  if (!api?.toggleSecondary) return null;

  return (
    <button
      type="button"
      className={`op-header-btn${open ? ' op-header-btn-active' : ''}`}
      onClick={() => void toggle()}
      aria-label={open ? '关闭副屏' : '打开副屏'}
      title={open ? '关闭副屏' : '打开副屏'}
    >
      <FundProjectionScreenOutlined />
    </button>
  );
}
