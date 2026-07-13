/**
 * InspectionBoard — 故检副屏：按设备分组检测表 + 判异 + 采集 + 照片
 *
 * 参考 5702demo inspect 页：
 * - 按测量工具(measure_tool_code)分组，每组一个 section
 * - 表格列：检测项 | 工艺值 | 公差 | 测量值(大输入) | 是否合格 | 照片
 * - 自动判异：nominal + lower ≤ 实测 ≤ nominal + upper
 * - 采集数据经 WS 自动填入
 * - 保存到 WorkCard.inspection_result JSON
 */
import { useEffect, useState, useMemo } from 'react';
import { Spin, Empty, Button, InputNumber, Space, App } from 'antd';
import { SaveOutlined, CameraOutlined } from '@ant-design/icons';
import { useOPHeader } from '../../../layout/OPHeaderContext';
import { fetchInspectionItems, saveInspectionResult, fetchWorkCardDetail } from '../../../api/opApi';
import { useOpContext } from '../../../layout/OPContext';
import { useOpWs } from '../../../hooks/useOpWs';
import type { InspectionItem, WorkCard, InspectionResultData, InspectionResultItem, InspectionResult as ResultType } from '@fmms/shared';

export default function InspectionBoard({ cardId }: { cardId: string }) {
  const { message } = App.useApp();
  const ctx = useOpContext();
  const [items, setItems] = useState<InspectionItem[]>([]);
  const [card, setCard] = useState<WorkCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [values, setValues] = useState<Record<string, number | undefined>>({});
  const [results, setResults] = useState<Record<string, ResultType>>({});
  const [saving, setSaving] = useState(false);

  // WS 监听采集数据
  useOpWs(ctx.selectedPartId ?? cardId, (msg) => {
    if (msg.type === 'collect.frame') {
      const payload = msg.payload as { tool_code?: string; item_code?: string; raw?: string };
      // 匹配 item_code 填值（实际由 BFF 解析 raw 得 measured_value，这里简化）
      if (payload.item_code) {
        // 尝试从 raw 解析数值（mock 格式: "MOCK,count,value,ts"）
        const match = payload.raw?.match(/([\d.]+)/g);
        if (match && match.length >= 3) {
          const val = parseFloat(match[2]);
          if (!isNaN(val)) {
            handleValueChange(payload.item_code, val);
          }
        }
      }
    }
  });

  const load = () => {
    setLoading(true);
    Promise.all([
      fetchWorkCardDetail(cardId),
    ])
      .then(async ([detail]) => {
        setCard(detail.work_card);
        // 加载检测项（按 WBS 节点）
        const wbsNodeId = detail.work_card.wbs_node_id;
        if (wbsNodeId) {
          const itemsRes = await fetchInspectionItems({ wbsNodeId });
          setItems(itemsRes.items);
          // 从已有检测结果恢复
          if (detail.work_card.inspection_result?.items) {
            const restoredVals: Record<string, number | undefined> = {};
            const restoredResults: Record<string, ResultType> = {};
            for (const r of detail.work_card.inspection_result.items) {
              restoredVals[r.item_code] = r.measured_value;
              restoredResults[r.item_code] = r.result;
            }
            setValues(restoredVals);
            setResults(restoredResults);
          }
        }
      })
      .catch((e) => message.error(`加载失败: ${e.message}`))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardId]);

  /** 判异 */
  const judge = (item: InspectionItem, val: number): ResultType => {
    const nominal = item.nominal_value ?? 0;
    const lower = item.lower_tolerance ?? 0;
    const upper = item.upper_tolerance ?? 0;
    if (val >= nominal + lower && val <= nominal + upper) return 'qualified';
    return 'unqualified';
  };

  const handleValueChange = (itemCode: string, val: number | undefined) => {
    setValues((prev) => ({ ...prev, [itemCode]: val }));
    const item = items.find((i) => i.item_code === itemCode);
    if (item && val != null) {
      setResults((prev) => ({ ...prev, [itemCode]: judge(item, val) }));
    }
  };

  const handleManualJudge = (itemCode: string, result: ResultType) => {
    setResults((prev) => ({ ...prev, [itemCode]: result }));
  };

  const handleSave = async () => {
    const resultItems: InspectionResultItem[] = items.map((item) => ({
      item_code: item.item_code,
      measured_value: values[item.item_code],
      result: results[item.item_code] ?? 'pending',
      collected_by: item.inspection_method === 'auto' ? 'auto' : 'manual',
    }));
    const summary = {
      total: items.length,
      qualified: resultItems.filter((r) => r.result === 'qualified').length,
      unqualified: resultItems.filter((r) => r.result === 'unqualified').length,
      pending: resultItems.filter((r) => r.result === 'pending').length,
    };
    const data: InspectionResultData = { items: resultItems, summary };
    setSaving(true);
    try {
      await saveInspectionResult(cardId, data);
      message.success(`检测结果已保存（${summary.qualified}合格 / ${summary.unqualified}不合格 / ${summary.pending}待检）`);
    } catch (e) {
      message.error(`保存失败: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  // 按 measure_tool_code 分组
  const groups = useMemo(() => {
    const map = new Map<string, InspectionItem[]>();
    for (const item of items) {
      const key = item.measure_tool_code ?? '手动检测';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return Array.from(map.entries());
  }, [items]);

  const headerTitle =
    items.length === 0
      ? '故检工作台'
      : `${card?.product_name ?? '故检'} — ${card?.card_code ?? ''}`;

  const rightButtons = useMemo(
    () =>
      items.length > 0
        ? [{ key: 'save', label: '保存', icon: <SaveOutlined />, onClick: handleSave }]
        : undefined,
    [items.length, saving],
  );

  useOPHeader({
    title: loading ? '故检工作台' : headerTitle,
    rightButtons,
  });

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 48 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="op-body">
        <Empty description="该工卡暂无检测项（检查 WBS 节点是否关联检测项）" />
      </div>
    );
  }

  return (
    <div style={{ paddingBottom: 100 }}>
      <div className="op-body">
        {groups.map(([toolCode, groupItems], gi) => (
          <div key={toolCode} className="op-inspect-section">
            <div className="op-inspect-title">
              测量设备{gi + 1} — {toolCode}
            </div>
            <table className="measure-table" style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse', fontSize: 'var(--op-font-base)' }}>
              <thead>
                <tr>
                  <th style={{ width: '22%', textAlign: 'left', padding: '14px 12px', color: 'var(--op-text-secondary)', borderBottom: '1px solid var(--op-border-subtle)' }}>检测项</th>
                  <th style={{ width: '15%', textAlign: 'left', padding: '14px 12px', color: 'var(--op-text-secondary)', borderBottom: '1px solid var(--op-border-subtle)' }}>工艺值</th>
                  <th style={{ width: '15%', textAlign: 'left', padding: '14px 12px', color: 'var(--op-text-secondary)', borderBottom: '1px solid var(--op-border-subtle)' }}>公差</th>
                  <th style={{ width: '18%', textAlign: 'left', padding: '14px 12px', color: 'var(--op-text-secondary)', borderBottom: '1px solid var(--op-border-subtle)' }}>测量值</th>
                  <th style={{ width: '30%', textAlign: 'left', padding: '14px 12px', color: 'var(--op-text-secondary)', borderBottom: '1px solid var(--op-border-subtle)' }}>是否合格</th>
                </tr>
              </thead>
              <tbody>
                {groupItems.map((item) => {
                  const val = values[item.item_code];
                  const result = results[item.item_code];
                  const isAuto = item.inspection_method !== 'manual';
                  return (
                    <tr key={item.item_code}>
                      <td style={{ padding: '14px 12px', fontWeight: 500, borderBottom: '1px solid var(--op-border-subtle)' }}>{item.item_name}</td>
                      <td style={{ padding: '14px 12px', color: 'var(--op-text-secondary)', borderBottom: '1px solid var(--op-border-subtle)' }}>
                        {item.nominal_value ?? '-'}
                      </td>
                      <td style={{ padding: '14px 12px', color: 'var(--op-text-secondary)', borderBottom: '1px solid var(--op-border-subtle)' }}>
                        {item.lower_tolerance != null && item.upper_tolerance != null
                          ? `${item.lower_tolerance >= 0 ? '+' : ''}${item.lower_tolerance} ~ +${item.upper_tolerance}`
                          : item.quality_criteria ?? '-'}
                        {item.unit && ` ${item.unit}`}
                      </td>
                      <td style={{ padding: '14px 12px', borderBottom: '1px solid var(--op-border-subtle)' }}>
                        {isAuto ? (
                          <InputNumber
                            size="large"
                            style={{ width: '100%' }}
                            value={val}
                            placeholder="采集/输入"
                            onChange={(v) => handleValueChange(item.item_code, v ?? undefined)}
                          />
                        ) : (
                          <span style={{ color: 'var(--op-text-secondary)' }}>手动判定</span>
                        )}
                      </td>
                      <td style={{ padding: '14px 12px', borderBottom: '1px solid var(--op-border-subtle)' }}>
                        <Space wrap>
                          {result && (
                            <span className={result === 'qualified' ? 'op-qualified-y' : 'op-qualified-n'}>
                              {result === 'qualified' ? '合格' : '不合格'}
                            </span>
                          )}
                          {!isAuto && (
                            <>
                              <Button size="small" type="primary" onClick={() => handleManualJudge(item.item_code, 'qualified')}>
                                合格
                              </Button>
                              <Button size="small" danger onClick={() => handleManualJudge(item.item_code, 'unqualified')}>
                                不合格
                              </Button>
                            </>
                          )}
                          {item.require_photo && (
                            <Button size="small" icon={<CameraOutlined />} onClick={() => message.info('拍照（待接 EADAF storage 上传）')}>
                              拍照
                            </Button>
                          )}
                        </Space>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      {/* 悬浮保存按钮 */}
      <button className="op-float-call" onClick={handleSave} style={{ background: saving ? 'rgba(74,127,181,0.5)' : undefined }}>
        <SaveOutlined style={{ fontSize: 28 }} />
        <span className="op-float-call-label">{saving ? '保存中' : '保存'}</span>
      </button>
    </div>
  );
}
