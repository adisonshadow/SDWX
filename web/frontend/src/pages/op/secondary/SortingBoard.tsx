/**
 * 分拣副屏 — 按已发布行迹盘示意图和热区引导码放。
 * 点槽位或表格行只打开预览；确认后该槽才记为有料。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Button, Checkbox, Empty, Space, Spin, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useHeaderSuppressed, useOPHeader } from '../../../layout/OPHeaderContext';
import { useOpCardHeaderActions } from '../../../hooks/useOpCardHeaderActions';
import { fetchTrayTemplateDetail, fetchTrayTemplates, submitWorkCard, updateTraySlot } from '../../../api/opApi';
import type { TraySlot, TrayTemplate } from '@fmms/shared';

function slotKey(slot: TraySlot, index: number) {
  return slot.id ?? slot.slot_code ?? String(index);
}

export default function SortingBoard({ cardId }: { cardId: string }) {
  const { message } = App.useApp();
  const embedded = useHeaderSuppressed();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [template, setTemplate] = useState<TrayTemplate | null>(null);
  const [slots, setSlots] = useState<TraySlot[]>([]);
  const [showTray, setShowTray] = useState(true);
  const [showList, setShowList] = useState(true);
  const [selected, setSelected] = useState('');
  const [selectedFrom, setSelectedFrom] = useState<'tray' | 'list'>('tray');
  const [blink, setBlink] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    fetchTrayTemplates(cardId)
      .then(async (list) => {
        const first = list.items[0];
        if (!first?.id) {
          setTemplate(null);
          setSlots([]);
          return;
        }
        const detail = await fetchTrayTemplateDetail(first.id);
        setTemplate(detail.template);
        setSlots(detail.slots);
      })
      .catch((e: Error) => {
        setError(e.message);
        setTemplate(null);
        setSlots([]);
      })
      .finally(() => setLoading(false));
  }, [cardId]);

  useEffect(() => { load(); }, [load]);

  const requiredSlots = slots.filter((slot) => slot.required !== false);
  const kitted = requiredSlots.length > 0 && requiredSlots.every((slot) => slot.slotStatus === 'occupied');
  const selectedSlot = slots.find((slot, index) => slotKey(slot, index) === selected);

  const flash = (key: string) => {
    setBlink('');
    window.setTimeout(() => setBlink(key), 0);
  };

  useEffect(() => {
    if (!blink) return;
    const paint = (on: boolean) => {
      const row = document.querySelector('.op-sorting-table tr.op-sorting-row.is-blink');
      if (!row) return;
      row.querySelectorAll('td').forEach((cell) => {
        if (on) {
          cell.style.setProperty('background', '#fcd34d', 'important');
          cell.style.setProperty('color', '#1c1917', 'important');
        } else {
          cell.style.removeProperty('background');
          cell.style.removeProperty('color');
        }
      });
    };
    const scrollToRow = () => {
      const row = document.querySelector('.op-sorting-table tr.op-sorting-row.is-blink');
      const col = row?.closest('.op-sorting-col');
      if (!row || !col) return;
      const rowRect = row.getBoundingClientRect();
      const colRect = col.getBoundingClientRect();
      col.scrollTop += rowRect.top - colRect.top - col.clientHeight / 2 + rowRect.height / 2;
    };
    scrollToRow();
    let on = false;
    let count = 0;
    const timer = window.setInterval(() => {
      on = !on;
      paint(on);
      count += 1;
      if (count >= 8) {
        window.clearInterval(timer);
        paint(false);
        setBlink('');
      }
    }, 280);
    return () => {
      window.clearInterval(timer);
      paint(false);
    };
  }, [blink]);

  const confirmSlot = async (slot: TraySlot) => {
    if (!slot.id) return;
    await updateTraySlot(slot.id, { slotStatus: 'occupied' });
    setSlots((prev) => prev.map((item) => (item.id === slot.id ? { ...item, slotStatus: 'occupied' } : item)));
  };

  const { rightButtons, agvModal } = useOpCardHeaderActions(cardId, {
    onSubmit: async () => {
      if (!kitted) {
        message.warning('还有槽位未确认，不能提交');
        return;
      }
      await submitWorkCard(cardId);
      message.success('已提交执行结果');
    },
  });

  useOPHeader({
    isPutTitleLeft: true,
    onRefresh: load,
    title: '分拣操作',
    rightButtons,
  });

  const columns: ColumnsType<TraySlot> = useMemo(() => [
    {
      title: '物料',
      render: (_, slot) => slot.material_name || slot.slot_name || slot.part_code || '物料',
    },
    { title: '编号', dataIndex: 'part_code' },
    { title: '第几件', dataIndex: 'instance_no', width: 90 },
    {
      title: '状态',
      dataIndex: 'slotStatus',
      width: 100,
      render: (status: string) => (
        <Tag color={status === 'occupied' ? 'green' : 'default'}>{status === 'occupied' ? '有料' : '无料'}</Tag>
      ),
    },
  ], []);

  const photo = template?.trayPhotoObjectId
    ? `/api/op/storage/${template.trayPhotoObjectId}/preview`
    : '';

  return (
    <>
      <div className={embedded ? 'op-sorting-board' : 'op-sorting-board is-secondary'}>
        <div className="op-sorting-toolbar">
          <Space>
            <Checkbox checked={showTray} onChange={(e) => setShowTray(e.target.checked)}>行迹盘</Checkbox>
            <Checkbox checked={showList} onChange={(e) => setShowList(e.target.checked)}>表格</Checkbox>
            {kitted && <Tag color="green">已齐套</Tag>}
          </Space>
          {selectedSlot && (
            <div className="op-sorting-toolbar-actions">
              <span>{selectedSlot.material_name || selectedSlot.part_code || '物料'}</span>
              <span>编号 {selectedSlot.part_code || '—'}</span>
              <span>第 {selectedSlot.instance_no ?? 1} 件</span>
              <Button
                type="primary"
                disabled={selectedSlot.slotStatus === 'occupied'}
                onClick={() => confirmSlot(selectedSlot).catch((e: Error) => message.error(e.message))}
              >
                确认物料
              </Button>
              <Button
                onClick={() => {
                  const key = slotKey(selectedSlot, slots.indexOf(selectedSlot));
                  if (selectedFrom === 'tray') setShowList(true);
                  else setShowTray(true);
                  flash(key);
                }}
              >
                {selectedFrom === 'tray' ? '在表格中闪烁' : '在行迹盘中闪烁'}
              </Button>
            </div>
          )}
        </div>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spin size="large" /></div>
        ) : error ? (
          <Empty description={error} />
        ) : !template ? (
          <Empty description="没有已发布的分拣示意图" />
        ) : (
          <div className="op-sorting-cols">
            {showTray && (
              <div className="op-sorting-col">
                <div className="op-sorting-tray">
                {photo ? (
                  <img src={photo} alt={template.template_name} style={{ width: '100%', height: 'auto', display: 'block' }} />
                ) : (
                  <Empty description="示意图未上传" />
                )}
                {slots.map((slot, index) => {
                  const zone = slot.hot_zone;
                  if (!zone) return null;
                  const key = slotKey(slot, index);
                  const active = key === selected;
                  return (
                    <button
                      key={key}
                      type="button"
                      className={blink === key ? 'op-hotzone is-blink' : 'op-hotzone'}
                      onClick={() => { setSelected(key); setSelectedFrom('tray'); }}
                      style={{
                        position: 'absolute',
                        left: `${zone.x * 100}%`,
                        top: `${zone.y * 100}%`,
                        width: `${zone.w * 100}%`,
                        height: `${zone.h * 100}%`,
                        border: `2px solid ${slot.slotStatus === 'occupied' ? 'var(--op-success, #52c41a)' : 'var(--op-accent-light)'}`,
                        borderRadius: zone.shape === 'circle' ? '50%' : 0,
                        background: active ? 'rgba(106, 159, 213, 0.35)' : 'rgba(106, 159, 213, 0.15)',
                        color: 'var(--op-text-primary)',
                        padding: 0,
                      }}
                    />
                  );
                })}
                </div>
              </div>
            )}
            {showList && (
              <div className="op-sorting-col">
                <Table
                  className="op-sorting-table"
                  rowKey={(row, index) => slotKey(row, index ?? 0)}
                  columns={columns}
                  dataSource={slots}
                  pagination={false}
                  size="middle"
                  rowClassName={(row, index) => (blink === slotKey(row, index ?? 0) ? 'op-sorting-row is-blink' : '')}
                  onRow={(row, index) => ({
                    onClick: () => {
                      setSelected(slotKey(row, index ?? 0));
                      setSelectedFrom('list');
                    },
                  })}
                />
              </div>
            )}
          </div>
        )}
      </div>
      {agvModal}
    </>
  );
}
