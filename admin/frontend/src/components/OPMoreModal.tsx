/**
 * OPMoreModal — 更多功能弹窗
 *
 * 呼叫、登出、切换工位、设置（字体大小 / 默认全屏）、主副屏全屏
 */
import { useEffect, useState } from 'react';
import { Modal, Segmented, Switch, App } from 'antd';
import {
  ArrowLeftOutlined,
  LogoutOutlined,
  PhoneOutlined,
  ReloadOutlined,
  SettingOutlined,
  SwapOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { clearAuth } from '../auth/auth';
import { useLocalConfig } from '../hooks/useLocalConfig';
import { useOpContext } from '../layout/OPContext';
import CallModal from './CallModal';
import {
  OP_FONT_SCALE_LABELS,
  OP_FONT_SCALES,
} from '../hooks/useOpFontScale';
import {
  WORKSTATION_TYPES,
  WORKSTATION_TYPE_LABELS,
  type WorkstationType,
  type OpFontScale,
} from '@fmms/shared';

type MoreView = 'main' | 'station' | 'settings';

export default function OPMoreModal({
  open,
  onClose,
  stationCode,
  onRefresh,
}: {
  open: boolean;
  onClose: () => void;
  stationCode?: string;
  onRefresh?: () => void;
}) {
  const { message, modal } = App.useApp();
  const navigate = useNavigate();
  const ctx = useOpContext();
  const { config, habits, updateConfig, updateHabits, isElectron } = useLocalConfig();
  const [view, setView] = useState<MoreView>('main');
  const [callOpen, setCallOpen] = useState(false);
  const [mainFullscreen, setMainFullscreen] = useState(false);
  const [secondaryFullscreen, setSecondaryFullscreen] = useState(false);
  const [secondaryOpen, setSecondaryOpen] = useState(false);

  useEffect(() => {
    if (!open || !isElectron) return;
    const api = window.electronAPI;
    if (!api?.getMainFullscreen) return;

    void Promise.all([
      api.getMainFullscreen!(),
      api.getSecondaryFullscreen?.() ?? Promise.resolve(false),
      api.getSecondaryOpen?.() ?? Promise.resolve(false),
    ]).then(([mainFs, secFs, secOpen]) => {
      setMainFullscreen(mainFs);
      setSecondaryFullscreen(secFs);
      setSecondaryOpen(secOpen);
    });

    const off = api.onSecondaryChanged?.((next) => setSecondaryOpen(next));
    return () => off?.();
  }, [open, isElectron]);

  const handleClose = () => {
    setView('main');
    onClose();
  };

  const handleLogout = () => {
    modal.confirm({
      title: '确认登出',
      content: '登出后需重新登录 SSO',
      okText: '登出',
      cancelText: '取消',
      onOk: () => {
        clearAuth();
        navigate('/auth/login');
      },
    });
  };

  const switchStation = (key: string) => {
    if (key === '__select__') {
      updateConfig({ selected_station_type: undefined, selected_station_code: undefined });
    } else {
      updateConfig({ selected_station_type: key as WorkstationType });
    }
    ctx.setSelectedCardId(undefined);
    message.success('工位已切换');
    handleClose();
  };

  const handleRefresh = () => {
    if (onRefresh) onRefresh();
    else window.location.reload();
    handleClose();
  };

  const handleMainFullscreen = async (checked: boolean) => {
    setMainFullscreen(checked);
    try {
      const api = window.electronAPI;
      if (!api?.setMainFullscreen) {
        message.warning('请重启工位客户端以启用全屏控制');
        setMainFullscreen(!checked);
        return;
      }
      const next = await api.setMainFullscreen(checked);
      setMainFullscreen(next);
      updateHabits({ main_fullscreen: next });
    } catch (e) {
      setMainFullscreen(!checked);
      message.error(`主屏全屏切换失败: ${(e as Error).message}`);
    }
  };

  const handleSecondaryFullscreen = async (checked: boolean) => {
    setSecondaryFullscreen(checked);
    try {
      const api = window.electronAPI;
      if (!api?.setSecondaryFullscreen) {
        message.warning('请重启工位客户端以启用全屏控制');
        setSecondaryFullscreen(!checked);
        return;
      }
      const next = await api.setSecondaryFullscreen(checked);
      setSecondaryFullscreen(next);
      updateHabits({ secondary_fullscreen: next });
    } catch (e) {
      setSecondaryFullscreen(!checked);
      message.error(`副屏全屏切换失败: ${(e as Error).message}`);
    }
  };

  const title =
    view === 'station' ? '切换工位' : view === 'settings' ? '设置' : '更多';

  return (
    <>
      <Modal
        title={
          view === 'main' ? (
            title
          ) : (
            <button
              type="button"
              className="op-more-back"
              onClick={() => setView('main')}
            >
              <ArrowLeftOutlined />
              {title}
            </button>
          )
        }
        open={open}
        onCancel={handleClose}
        footer={null}
        width={480}
        destroyOnHidden
        afterClose={() => setView('main')}
      >
        {view === 'main' && (
          <>
            <div className="op-more-menu" style={{ marginTop: 30 }}>
              <button
                type="button"
                className="op-more-item"
                onClick={() => {
                  handleClose();
                  setCallOpen(true);
                }}
              >
                <PhoneOutlined />
                <span>呼叫</span>
              </button>
              <button type="button" className="op-more-item" onClick={() => setView('station')}>
                <SwapOutlined />
                <span>切换工位</span>
              </button>
              <button type="button" className="op-more-item" onClick={() => setView('settings')}>
                <SettingOutlined />
                <span>设置</span>
              </button>
              <button type="button" className="op-more-item" onClick={handleRefresh}>
                <ReloadOutlined />
                <span>刷新</span>
              </button>
              <button type="button" className="op-more-item op-more-item-danger" onClick={handleLogout}>
                <LogoutOutlined />
                <span>登出</span>
              </button>
            </div>

            {isElectron && (
              <div className="op-more-display-controls">
                <div className="op-more-settings-row">
                  <span>主屏全屏</span>
                  <Switch checked={mainFullscreen} onChange={(v) => void handleMainFullscreen(v)} />
                </div>
                <div className="op-more-settings-row">
                  <span>副屏全屏</span>
                  <Switch
                    checked={secondaryFullscreen}
                    disabled={!secondaryOpen}
                    onChange={(v) => void handleSecondaryFullscreen(v)}
                  />
                </div>
              </div>
            )}
          </>
        )}

        {view === 'station' && (
          <div className="op-more-menu">
            {WORKSTATION_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                className="op-more-item"
                onClick={() => switchStation(type)}
              >
                <SwapOutlined />
                <span>{WORKSTATION_TYPE_LABELS[type]}</span>
              </button>
            ))}
            <button
              type="button"
              className="op-more-item"
              onClick={() => switchStation('__select__')}
            >
              <SwapOutlined />
              <span>重新选择工位</span>
            </button>
          </div>
        )}

        {view === 'settings' && (
          <div className="op-more-settings">
            <div className="op-more-settings-label">字体大小</div>
            <Segmented
              block
              size="large"
              value={habits.font_scale ?? 'medium'}
              options={OP_FONT_SCALES.map((scale) => ({
                value: scale,
                label: OP_FONT_SCALE_LABELS[scale],
              }))}
              onChange={(val) => updateHabits({ font_scale: val as OpFontScale })}
            />

            {isElectron && (
              <>
                <div className="op-more-settings-label" style={{ marginTop: 24 }}>
                  显示
                </div>
                <div className="op-more-settings-row">
                  <span>默认全屏</span>
                  <Switch
                    checked={config?.default_fullscreen ?? false}
                    onChange={(checked) => updateConfig({ default_fullscreen: checked })}
                  />
                </div>
                <div className="op-more-settings-hint">下次启动时主屏/副屏的默认全屏状态</div>
              </>
            )}
          </div>
        )}
      </Modal>

      <CallModal open={callOpen} onClose={() => setCallOpen(false)} stationCode={stationCode} />
    </>
  );
}
