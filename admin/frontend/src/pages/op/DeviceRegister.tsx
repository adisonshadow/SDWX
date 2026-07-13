/**
 * DeviceRegister — 设备注册（参考 5702demo register 页）
 */
import { useState, useMemo } from 'react';
import { Input, Select, App } from 'antd';
import { useOPHeader } from '../../layout/OPHeaderContext';
import { registerTool } from '../../api/opApi';

const DEVICE_TYPES = [
  '激光频率梳 3D 轮廓测量仪',
  '高精度气动量仪',
  '三坐标测量机',
  '数显千分尺',
  '数显游标卡尺',
  '其他',
];

export default function DeviceRegister({ onBack }: { onBack: () => void }) {
  const { message } = App.useApp();
  const [deviceType, setDeviceType] = useState(DEVICE_TYPES[0]);
  const [deviceId, setDeviceId] = useState(generateDeviceId());
  const [deviceName, setDeviceName] = useState('');

  const handleRegister = async () => {
    if (!deviceName.trim()) {
      message.warning('请填写设备名称');
      return;
    }
    try {
      await registerTool({
        tool_code: deviceId,
        tool_name: deviceName,
        tool_model: deviceType,
        protocol_type: 'serial',
        status: 'online',
      });
      message.success('设备注册成功');
      setDeviceId(generateDeviceId());
      setDeviceName('');
    } catch (e) {
      message.error(`注册失败: ${(e as Error).message}`);
    }
  };

  const rightButtons = useMemo(
    () => [{ key: 'confirm', label: '确认注册', onClick: handleRegister }],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deviceName, deviceType, deviceId],
  );

  useOPHeader({ title: '设备注册', onBack, rightButtons });

  return (
    <div className="op-body" style={{ maxWidth: 560, margin: '0 auto', paddingTop: 32 }}>
        <p style={{ fontSize: 'var(--op-font-lg)', marginBottom: 24, color: 'var(--op-text-primary)' }}>
          发现新设备
        </p>
        <div style={{ marginBottom: 24 }}>
          <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>设备名称</label>
          <Input
            size="large"
            value={deviceName}
            onChange={(e) => setDeviceName(e.target.value)}
            placeholder="如：数显千分尺-1号"
          />
        </div>
        <div style={{ marginBottom: 24 }}>
          <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>设备类型</label>
          <Select
            size="large"
            style={{ width: '100%' }}
            value={deviceType}
            onChange={setDeviceType}
            options={DEVICE_TYPES.map((t) => ({ value: t, label: t }))}
          />
        </div>
        <div style={{ marginBottom: 24 }}>
          <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>设备编号</label>
          <Input size="large" value={deviceId} readOnly />
        </div>
    </div>
  );
}

function generateDeviceId(): string {
  const chars = '0123456789abcdef';
  let id = '';
  for (let i = 0; i < 16; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}
