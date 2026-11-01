/**
 * 顶栏喇叭：只显示本工位最近一条呼叫。
 * 已发出橙色，已接受蓝色，处理完成绿色。
 * 已取消、发出超过 10 分钟，或已被更新的呼叫顶掉时不显示。
 */
import { useEffect, useState } from 'react';
import { Modal } from 'antd';
import { SoundOutlined } from '@ant-design/icons';
import { get } from '../api/request';
import { CALL_TYPE_LABELS, type NotificationLog } from '@fmms/shared';

const TEN_MINUTES = 10 * 60 * 1000;
const STATUS_LABEL: Record<string, string> = {
  sent: '已发出',
  accepted: '已接受',
  completed: '处理完成',
  cancelled: '已取消',
};

function latestVisible(items: NotificationLog[]): NotificationLog | null {
  const sorted = [...items].sort((a, b) => String(b.call_time).localeCompare(String(a.call_time)));
  const latest = sorted[0];
  if (!latest) return null;
  if (latest.status === 'cancelled') return null;
  const sentAt = Date.parse(latest.call_time);
  if (!Number.isFinite(sentAt) || Date.now() - sentAt > TEN_MINUTES) return null;
  if (latest.status !== 'sent' && latest.status !== 'accepted' && latest.status !== 'completed') return null;
  return latest;
}

export default function CallStatusButton({ stationCode }: { stationCode?: string }) {
  const [call, setCall] = useState<NotificationLog | null>(null);
  const [names, setNames] = useState<Record<string, string>>({ ...CALL_TYPE_LABELS });
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!stationCode) {
      setCall(null);
      return;
    }
    let stopped = false;
    const load = () => {
      get<{ items: NotificationLog[] }>(`/api/op/calls?station_code=${encodeURIComponent(stationCode)}`)
        .then((data) => {
          if (!stopped) setCall(latestVisible(data.items ?? []));
        })
        .catch(() => {
          if (!stopped) setCall(null);
        });
    };
    load();
    const timer = window.setInterval(load, 4000);
    window.addEventListener('fmms-call-sent', load);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      window.removeEventListener('fmms-call-sent', load);
    };
  }, [stationCode]);

  useEffect(() => {
    get<{ items: Array<{ code: string; name: string }> }>('/api/op/call-types')
      .then((data) => {
        const next = { ...CALL_TYPE_LABELS } as Record<string, string>;
        for (const item of data.items ?? []) next[item.code] = item.name;
        setNames(next);
      })
      .catch(() => undefined);
  }, []);

  if (!call) return null;
  const status = call.status || 'sent';
  const typeName = names[call.call_type] || call.call_type;

  return (
    <>
      <button
        type="button"
        className={`op-header-btn op-call-status-btn is-${status}`}
        aria-label="最近呼叫"
        onClick={() => setOpen(true)}
      >
        <SoundOutlined />
      </button>
      <Modal title="呼叫状态" open={open} onCancel={() => setOpen(false)} footer={null} centered>
        <p>类型：{typeName}</p>
        <p>问题描述：{call.call_content || '无'}</p>
        <p>当前状态：{STATUS_LABEL[status] || status}</p>
        <p>接受人：{call.accepted_by || '—'}</p>
        <p>接受时间：{call.accepted_at || '—'}</p>
        <p>完成时间：{call.completed_at || '—'}</p>
      </Modal>
    </>
  );
}
