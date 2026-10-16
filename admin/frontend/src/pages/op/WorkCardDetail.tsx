/**
 * WorkCardDetail — 工卡详情 + 次屏区域
 *
 * 工卡信息（Descriptions / 工步 / 进度）在上方；下方「次屏区域」在副屏未开启时
 * 内嵌对应工位类型的作业看板（分拣/故检/修理/收发）。副屏开启时该区域隐藏（由独立副屏承载）。
 */
import { useEffect, useState, useMemo } from 'react';
import { Spin, Empty, Tag, App, Descriptions, Progress, Modal } from 'antd';
import { CheckCircleOutlined, CarOutlined } from '@ant-design/icons';
import { useOPHeader } from '../../layout/OPHeaderContext';
import AgvModal from '../../components/AgvModal';
import {
  fetchWorkCardDetail,
  acceptWorkCard,
  submitWorkCard,
} from '../../api/opApi';
import { useOpContext } from '../../layout/OPContext';
import { useLocalConfig } from '../../hooks/useLocalConfig';
import { renderOpBoard } from '../../layout/renderOpBoard';
import {
  type WorkCard,
  type WorkStep,
  type WbsNode,
  type ProcessResource,
} from '@fmms/shared';

/** 兼容 EADAF 返回的 array / record，以及 camelCase / snake_case 字段 */
function normalizeProcessResources(raw: unknown): ProcessResource[] {
  if (!raw) return [];
  const list = Array.isArray(raw)
    ? raw
    : typeof raw === 'object'
      ? Object.values(raw as Record<string, unknown>)
      : [];
  return list
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map((item) => {
      const resourceType = (item.resource_type ?? item.resourceType) as ProcessResource['resource_type'] | undefined;
      return {
        resource_type: resourceType ?? 'file',
        title: String(item.title ?? ''),
        url: String(item.url ?? ''),
        mime_type: (item.mime_type ?? item.mimeType) as string | undefined,
        playable_in_client: Boolean(item.playable_in_client ?? item.playableInClient),
      } satisfies ProcessResource;
    })
    .filter((r) => r.title && r.url);
}

function isPlayableVideo(res: ProcessResource): boolean {
  return res.resource_type === 'video' || !!res.playable_in_client;
}

export default function WorkCardDetail({
  cardId,
  onBack,
}: {
  cardId: string;
  onBack: () => void;
}) {
  const { message } = App.useApp();
  const ctx = useOpContext();
  const { config } = useLocalConfig();
  const [card, setCard] = useState<WorkCard | null>(null);
  const [workSteps, setWorkSteps] = useState<WorkStep[]>([]);
  const [wbsNode, setWbsNode] = useState<WbsNode | null>(null);
  const [loading, setLoading] = useState(false);
  const [agvOpen, setAgvOpen] = useState(false);
  const [videoRes, setVideoRes] = useState<ProcessResource | null>(null);
  /** 工步分页（超过 1 个时，一页只显示一个） */
  const [stepPage, setStepPage] = useState(0);

  const load = () => {
    setLoading(true);
    fetchWorkCardDetail(cardId)
      .then((data) => {
        setCard(data.work_card);
        setWorkSteps(data.work_steps ?? []);
        setWbsNode(data.wbs_node ?? null);
      })
      .catch((e) => message.error(`加载失败: ${e.message}`))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    setStepPage(0);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardId]);

  const sortedSteps = useMemo(
    () =>
      [...workSteps].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [workSteps],
  );

  const currentStep = sortedSteps[Math.min(stepPage, Math.max(sortedSteps.length - 1, 0))];

  const handleAccept = async () => {
    try {
      await acceptWorkCard(cardId);
      message.success('已接受');
      load();
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const handleSubmit = async () => {
    try {
      await submitWorkCard(cardId);
      message.success('已提交执行结果');
      load();
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const workstationType = ctx.workstationType ?? config?.selected_station_type;

  const processResources = useMemo(
    () => normalizeProcessResources(wbsNode?.process_resources),
    [wbsNode?.process_resources],
  );

  const rightButtons = useMemo(() => {
    // 副屏在线时，AGV / 提交结果改由副屏 header 承载
    if (ctx.secondaryOnline) {
      if (card?.status === 'pending') {
        return [{ key: 'accept', label: '接受任务', icon: <CheckCircleOutlined />, onClick: () => void handleAccept() }];
      }
      return [];
    }
    const buttons = [
      { key: 'agv', label: 'AGV', icon: <CarOutlined />, onClick: () => setAgvOpen(true) },
    ];
    if (card?.status === 'pending') {
      buttons.push({ key: 'accept', label: '接受任务', icon: <CheckCircleOutlined />, onClick: () => void handleAccept() });
    } else if (card && card.status !== 'completed') {
      buttons.push({ key: 'submit', label: '提交结果', icon: <CheckCircleOutlined />, onClick: () => void handleSubmit() });
    }
    return buttons;
  }, [card, ctx.secondaryOnline]);

  useOPHeader({
    title: card?.card_name ?? card?.card_code ?? '工卡详情',
    onBack,
    rightButtons,
  });

  return (
    <>
      <div className="op-body">
        {loading ? (
          <div style={{ textAlign: 'center', padding: 48 }}>
            <Spin size="large" />
          </div>
        ) : !card ? (
          <Empty description="工卡不存在" />
        ) : (
          <>
            <Descriptions bordered column={3} size="small" style={{ marginBottom: 20 }}>
              <Descriptions.Item label="工卡号">{card.card_code}</Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag>{card.status}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="产品">{card.product_name ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="令号">{card.batch_no ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="序列号">{card.serial_no ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="操作员">{card.accept_operator_name ?? '-'}</Descriptions.Item>
            </Descriptions>

            {card.progress != null && card.progress > 0 && (
              <div style={{ marginBottom: 20 }}>
                <Progress percent={card.progress} />
              </div>
            )}

            <div style={{ marginBottom: 20 }}>
              <h3 style={{ marginBottom: 12, color: 'var(--op-text-primary)' }}>工艺信息</h3>
              <Descriptions bordered column={3} size="small">
                <Descriptions.Item label="工序">{wbsNode?.process_name ?? wbsNode?.wbs_name ?? '-'}</Descriptions.Item>
                <Descriptions.Item label="工序编码">{wbsNode?.process_code ?? '-'}</Descriptions.Item>
                <Descriptions.Item label="预计工时">
                  {wbsNode?.estimated_minutes != null ? `${wbsNode.estimated_minutes} 分钟` : '-'}
                </Descriptions.Item>
                {wbsNode?.process_description && (
                  <Descriptions.Item label="工序说明" span={3}>{wbsNode.process_description}</Descriptions.Item>
                )}
                {processResources.length > 0 && (
                  <Descriptions.Item label="工艺资源" span={3}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                      {processResources.map((res, idx) => {
                        const playable = isPlayableVideo(res);
                        if (playable) {
                          return (
                            <a
                              key={idx}
                              href={res.url}
                              onClick={(e) => {
                                e.preventDefault();
                                setVideoRes(res);
                              }}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
                            >
                              {res.title}
                              <Tag style={{ marginLeft: 4 }}>视频</Tag>
                            </a>
                          );
                        }
                        return (
                          <a
                            key={idx}
                            href={res.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                          >
                            {res.title}
                          </a>
                        );
                      })}
                    </div>
                  </Descriptions.Item>
                )}
              </Descriptions>
            </div>

            <div style={{ marginBottom: 20 }}>
              <div className="op-step-header">
                <h3 className="op-step-title">工步</h3>
                {sortedSteps.length > 1 && (
                  <div className="op-step-pager" role="tablist" aria-label="工步分页">
                    {sortedSteps.map((step, idx) => (
                      <button
                        key={step.id ?? step.step_code ?? idx}
                        type="button"
                        role="tab"
                        aria-selected={idx === stepPage}
                        className={`op-step-page-dot${idx === stepPage ? ' is-active' : ''}`}
                        onClick={() => setStepPage(idx)}
                      >
                        {idx + 1}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {sortedSteps.length === 0 ? (
                <Empty description="暂无工步" />
              ) : currentStep ? (
                <Descriptions
                  key={currentStep.id ?? currentStep.step_code ?? stepPage}
                  bordered
                  column={3}
                  size="small"
                  title={
                    <span style={{ fontSize: 14 }}>
                      {stepPage + 1}. {currentStep.step_name ?? currentStep.step_code ?? '-'}
                    </span>
                  }
                >
                  <Descriptions.Item label="工步编码">{currentStep.step_code ?? '-'}</Descriptions.Item>
                  <Descriptions.Item label="使用工具">{currentStep.tool_code ?? '-'}</Descriptions.Item>
                  <Descriptions.Item label="质量标准">{currentStep.quality_standard ?? '-'}</Descriptions.Item>
                  {currentStep.operation_content && (
                    <Descriptions.Item label="操作内容" span={3}>
                      {currentStep.operation_content}
                    </Descriptions.Item>
                  )}
                  {currentStep.remark && (
                    <Descriptions.Item label="备注" span={3}>{currentStep.remark}</Descriptions.Item>
                  )}
                </Descriptions>
              ) : null}
            </div>

            {!ctx.secondaryOnline && (
              <div className="op-secondary-area">
                <h3 style={{ marginBottom: 12, color: 'var(--op-text-primary)' }}>次屏区域</h3>
                {renderOpBoard(workstationType, cardId, true)}
              </div>
            )}
          </>
        )}
      </div>

      <AgvModal
        open={agvOpen}
        onClose={() => setAgvOpen(false)}
        cardId={cardId}
        fromStation={config?.selected_station_code}
      />

      <Modal
        title={videoRes?.title ?? '工艺视频'}
        open={!!videoRes}
        onCancel={() => setVideoRes(null)}
        footer={null}
        width={880}
        destroyOnHidden
        styles={{ body: { padding: 0, background: '#000' } }}
      >
        {videoRes && (
          <video
            key={videoRes.url}
            src={encodeURI(videoRes.url)}
            controls
            autoPlay
            style={{ display: 'block', width: '100%', maxHeight: '70vh' }}
          />
        )}
      </Modal>
    </>
  );
}
