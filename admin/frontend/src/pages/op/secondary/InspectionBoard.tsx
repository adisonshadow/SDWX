/**
 * InspectionBoard — 故检副屏：检测执行 + 不合格处置分类
 *
 * - 检测页：按设备分组检测表 + 判异 + 采集
 * - 有合格/不合格判定后，header「AGV」前出现「处置」按钮
 * - 处置页：列出已判定项，三类分类 + 底部流转条码（可返回检测页）
 */
import { useEffect, useState, useMemo, useCallback } from 'react';
import { Spin, Empty, Button, InputNumber, Space, App, Radio } from 'antd';
import { CheckCircleOutlined, CameraOutlined, PartitionOutlined } from '@ant-design/icons';
import { useOPHeader } from '../../../layout/OPHeaderContext';
import { fetchInspectionItems, saveInspectionResult, fetchWorkCardDetail } from '../../../api/opApi';
import { useOpContext } from '../../../layout/OPContext';
import { useOpWs } from '../../../hooks/useOpWs';
import { useOpCardHeaderActions } from '../../../hooks/useOpCardHeaderActions';
import InspectionDisposal from './InspectionDisposal';
import type {
  InspectionItem,
  InspectionResultData,
  InspectionResultItem,
  InspectionResult as ResultType,
} from '@fmms/shared';
import type { OPHeaderButton } from '../../../components/OPHeader';

type ViewMode = 'inspect' | 'disposal';

export default function InspectionBoard({ cardId }: { cardId: string }) {
  const { message } = App.useApp();
  const ctx = useOpContext();
  const [view, setView] = useState<ViewMode>('inspect');
  const [items, setItems] = useState<InspectionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [values, setValues] = useState<Record<string, number | undefined>>({});
  const [results, setResults] = useState<Record<string, ResultType>>({});
  const [saving, setSaving] = useState(false);

  useOpWs(ctx.selectedPartId ?? cardId, (msg) => {
    if (msg.type === 'collect.frame') {
      const payload = msg.payload as { tool_code?: string; item_code?: string; raw?: string };
      if (payload.item_code) {
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
    Promise.all([fetchWorkCardDetail(cardId), fetchInspectionItems({ workCardId: cardId })])
      .then(([detail, itemsRes]) => {
        setItems(itemsRes.items);
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
      })
      .catch((e) => message.error(`加载失败: ${e.message}`))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    setView('inspect');
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardId]);

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

  const handleSave = useCallback(async () => {
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
      message.success(
        `检测结果已提交（${summary.qualified}合格 / ${summary.unqualified}不合格 / ${summary.pending}待检）`,
      );
    } catch (e) {
      message.error(`提交失败: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  }, [cardId, items, message, results, values]);

  const hasJudged = useMemo(
    () => Object.values(results).some((r) => r === 'qualified' || r === 'unqualified'),
    [results],
  );

  const goDisposal = useCallback(() => setView('disposal'), []);
  const goInspect = useCallback(() => setView('inspect'), []);

  const prependButtons = useMemo<OPHeaderButton[]>(() => {
    if (view !== 'inspect' || !hasJudged) return [];
    return [
      {
        key: 'disposal',
        label: '处置',
        icon: <PartitionOutlined />,
        onClick: goDisposal,
      },
    ];
  }, [view, hasJudged, goDisposal]);

  const { rightButtons, agvModal } = useOpCardHeaderActions(cardId, {
    onSubmit: handleSave,
    prependButtons,
  });

  const groups = useMemo(() => {
    const map = new Map<string, InspectionItem[]>();
    for (const item of items) {
      const key = item.measure_tool_code ?? '手动检测';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return Array.from(map.entries());
  }, [items]);

  useOPHeader({
    isPutTitleLeft: true,
    title: view === 'disposal' ? '故检处置' : '故检检测',
    onBack: view === 'disposal' ? goInspect : undefined,
    rightButtons: view === 'disposal'
      ? rightButtons.filter((b) => b.key === 'agv')
      : rightButtons,
  });

  if (loading) {
    return (
      <>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 48 }}>
          <Spin size="large" />
        </div>
        {agvModal}
      </>
    );
  }

  if (items.length === 0) {
    return (
      <>
        <div className="op-body">
          <Empty description="该工卡暂无检测项（请检查工步或零件是否已关联检测项）" />
        </div>
        {agvModal}
      </>
    );
  }

  if (view === 'disposal') {
    return (
      <>
        <InspectionDisposal
          cardId={cardId}
          items={items}
          results={results}
          values={values}
        />
        {agvModal}
      </>
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
                          <Radio.Group
                            className={`op-judge-radio${
                              result === 'unqualified' ? ' is-unqualified' : result === 'qualified' ? ' is-qualified' : ''
                            }`}
                            optionType="button"
                            buttonStyle="solid"
                            size="large"
                            value={result === 'qualified' || result === 'unqualified' ? result : undefined}
                            onChange={(e) => handleManualJudge(item.item_code, e.target.value as ResultType)}
                            options={[
                              { label: '合格', value: 'qualified' },
                              { label: '不合格', value: 'unqualified' },
                            ]}
                          />
                          {result === 'unqualified' && (
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

      <button className="op-float-call" onClick={() => void handleSave()} style={{ background: saving ? 'rgba(74,127,181,0.5)' : undefined }}>
        <CheckCircleOutlined style={{ fontSize: 28 }} />
        <span className="op-float-call-label">{saving ? '提交中' : '提交结果'}</span>
      </button>
      {agvModal}
    </div>
  );
}
