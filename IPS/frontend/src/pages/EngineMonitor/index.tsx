/**
 * 引擎运行监控
 *
 * - 状态：GET /engine/status
 * - 手动触发：POST /engine/run
 * - 实时日志：WebSocket ENGINE_LOG / ENGINE_STATUS
 * - 异常告警：monitor/alerts
 */
import {
  AlertOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { PageContainer, ProCard, StatisticCard } from '@ant-design/pro-components';
import { Alert, Badge, Button, Empty, List, Space, Table, Tag, Typography } from 'antd';
import { useCallback, useEffect, useState } from 'react';
import { WS_EVENTS, type WsMessage } from '@ips/shared';
import { useIpsWebSocket } from '@/hooks/useIpsWebSocket';
import { getEngineStatus, runEngine, type EngineStatus } from '@/services/engine';
import { listAlerts } from '@/services/monitor';
import {
  getApiData,
  getApiErrorMessage,
  isApiSuccess,
  parseApiListResponse,
} from '@/utils/apiResponse';
import { message, modal } from '@/utils/antdAppApis';
import { ALERT_TYPE_LABELS } from '@/pages/Dashboard/alerts';
import './index.scss';

const { Text } = Typography;

interface LogItem {
  id: string;
  ts: string;
  message: string;
  level?: 'info' | 'success' | 'error';
}

let logSeq = 0;

export default function EngineMonitorPage() {
  const [status, setStatus] = useState<EngineStatus>({
    running: false,
    lastRunAt: null,
    lastRunError: null,
    runCount: 0,
  });
  const [statusLoading, setStatusLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [alerts, setAlerts] = useState<Record<string, any>[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(true);

  const pushLog = useCallback((messageText: string, ts?: string, level: LogItem['level'] = 'info') => {
    setLogs((prev) =>
      [
        {
          id: `log-${Date.now()}-${logSeq++}`,
          ts: ts ?? new Date().toISOString(),
          message: messageText,
          level,
        },
        ...prev,
      ].slice(0, 200),
    );
  }, []);

  const refreshStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const res = await getEngineStatus();
      if (isApiSuccess(res)) {
        const data = getApiData<EngineStatus>(res);
        if (data) setStatus(data);
      }
    } finally {
      setStatusLoading(false);
    }
  }, []);

  const refreshAlerts = useCallback(async () => {
    setAlertsLoading(true);
    try {
      const res = await listAlerts({ resolved: false });
      setAlerts(parseApiListResponse<Record<string, any>>(res).items);
    } catch {
      setAlerts([]);
    } finally {
      setAlertsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
    void refreshAlerts();
  }, [refreshStatus, refreshAlerts]);

  const { connected: wsConnected } = useIpsWebSocket((msg: WsMessage) => {
    if (msg.type === WS_EVENTS.ENGINE_LOG) {
      const p = (msg.payload ?? {}) as { message?: string; ts?: string };
      if (p.message) pushLog(p.message, p.ts, 'info');
    }
    if (msg.type === WS_EVENTS.ENGINE_STATUS) {
      const p = (msg.payload ?? {}) as {
        running?: boolean;
        runCount?: number;
        error?: string;
      };
      setStatus((prev) => ({
        ...prev,
        running: Boolean(p.running),
        runCount: p.runCount ?? prev.runCount,
        lastRunError: p.error ?? (p.running ? null : prev.lastRunError),
      }));
      if (p.error) pushLog(`引擎异常：${p.error}`, undefined, 'error');
    }
    if (msg.type === WS_EVENTS.ALERT) {
      void refreshAlerts();
    }
  });

  const doRun = () => {
    modal.confirm({
      title: '确认触发全量重算？',
      content: '将扫描全部「待生效」工卡并按引擎规则推进（当前简化实现：直接生效为待接受）。',
      onOk: async () => {
        setRunning(true);
        pushLog('手动触发全量重算…', undefined, 'info');
        try {
          const res = await runEngine();
          if (!isApiSuccess(res)) {
            message.error(getApiErrorMessage(res, '触发失败'));
            pushLog(getApiErrorMessage(res, '触发失败'), undefined, 'error');
            return;
          }
          const data = getApiData<EngineStatus>(res);
          if (data) {
            setStatus(data);
            pushLog(
              `重算完成：生效 ${data.effected ?? 0}/${data.total ?? 0} 张，累计运行 ${data.runCount} 次`,
              data.lastRunAt ?? undefined,
              'success',
            );
          }
          message.success('全量重算已完成');
          void refreshAlerts();
        } finally {
          setRunning(false);
          void refreshStatus();
        }
      },
    });
  };

  const isBusy = running || status.running;

  return (
    <PageContainer pageHeaderRender={() => <></>}>
      <Space orientation="vertical" size={16} style={{ width: '100%' }}>
        {status.lastRunError && (
          <Alert
            type="error"
            showIcon
            closable
            message="引擎最近一次运行异常"
            description={status.lastRunError}
          />
        )}

        <div className="engine-monitor__toolbar">
          <Space wrap>
            <Badge status={wsConnected || isBusy ? 'processing' : 'default'} text="实时推送" />
            <Badge
              status={isBusy ? 'processing' : status.lastRunError ? 'error' : 'success'}
              text={isBusy ? '运行中' : '空闲'}
            />
          </Space>
          <Space>
            <Button icon={<ReloadOutlined />} onClick={() => { void refreshStatus(); void refreshAlerts(); }}>
              刷新状态
            </Button>
            <Button
              type="primary"
              className="btn-gradient-primary"
              icon={<ThunderboltOutlined />}
              loading={isBusy}
              onClick={doRun}
            >
              手动触发全量重算
            </Button>
          </Space>
        </div>

        <StatisticCard.Group direction="row">
          <StatisticCard
            loading={statusLoading}
            statistic={{
              title: '运行状态',
              value: isBusy ? '运行中' : '空闲',
              icon: <PlayCircleOutlined style={{ fontSize: 28, color: isBusy ? '#1677ff' : '#52c41a' }} />,
            }}
          />
          <StatisticCard
            loading={statusLoading}
            statistic={{
              title: '累计运行次数',
              value: status.runCount,
            }}
          />
          <StatisticCard
            loading={statusLoading}
            statistic={{
              title: '最近运行时间',
              valueRender: () => (
                <Text style={{ fontSize: 16 }}>
                  {status.lastRunAt ? new Date(status.lastRunAt).toLocaleString() : '尚未运行'}
                </Text>
              ),
            }}
          />
          <StatisticCard
            loading={alertsLoading}
            statistic={{
              title: '未解决告警',
              value: alerts.length,
              icon: <AlertOutlined style={{ fontSize: 28, color: alerts.length ? '#ff4d4f' : '#8c8c8c' }} />,
            }}
          />
        </StatisticCard.Group>

        <div className="engine-monitor__grid">
          <ProCard title="实时日志流" headerBordered className="engine-monitor__logs">
            <div className="engine-monitor__log-list">
              {logs.length === 0 ? (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="暂无日志。触发重算或等待 WebSocket 推送。"
                />
              ) : (
                <List
                  size="small"
                  dataSource={logs}
                  renderItem={(item) => (
                    <List.Item className={`engine-monitor__log-item level-${item.level}`}>
                      <Text type="secondary" className="engine-monitor__log-ts">
                        {new Date(item.ts).toLocaleTimeString()}
                      </Text>
                      <Text>{item.message}</Text>
                    </List.Item>
                  )}
                />
              )}
            </div>
          </ProCard>

          <ProCard title="异常告警" headerBordered loading={alertsLoading}>
            <Table
              size="small"
              rowKey={(r) => r.id ?? `${r.alertType}-${r.triggerAt}`}
              dataSource={alerts}
              pagination={{ pageSize: 6, simple: true }}
              locale={{
                emptyText: <Empty description="暂无告警" image={Empty.PRESENTED_IMAGE_SIMPLE} />,
              }}
              columns={[
                {
                  title: '类型',
                  dataIndex: 'alertType',
                  width: 100,
                  render: (v: string) => (
                    <Tag color="orange">{ALERT_TYPE_LABELS[v] ?? v}</Tag>
                  ),
                },
                { title: '内容', dataIndex: 'content', ellipsis: true },
                {
                  title: '时间',
                  dataIndex: 'triggerAt',
                  width: 150,
                  render: (v: string) => (v ? new Date(v).toLocaleString() : '-'),
                },
              ]}
            />
          </ProCard>
        </div>
      </Space>
    </PageContainer>
  );
}
