/**
 * useOpCardHeaderActions — 工卡作业区公共 header 操作（AGV / 提交结果）
 *
 * 副屏开启后由副屏看板挂载；主屏详情在 secondaryOnline 时不再展示这两项。
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { App } from 'antd';
import { CarOutlined, CheckCircleOutlined } from '@ant-design/icons';
import AgvModal from '../components/AgvModal';
import { fetchWorkCardDetail, submitWorkCard } from '../api/opApi';
import { useLocalConfig } from './useLocalConfig';
import type { OPHeaderButton } from '../components/OPHeader';
import type { WorkCard } from '@fmms/shared';

export function useOpCardHeaderActions(
  cardId: string,
  options?: {
    /** 自定义提交逻辑（如故检保存检测记录）；默认调用 submitWorkCard */
    onSubmit?: () => Promise<void>;
    /** 额外前置按钮 */
    prependButtons?: OPHeaderButton[];
  },
): {
  card: WorkCard | null;
  rightButtons: OPHeaderButton[];
  agvModal: ReactNode;
  reloadCard: () => void;
} {
  const { message } = App.useApp();
  const { config } = useLocalConfig();
  const [card, setCard] = useState<WorkCard | null>(null);
  const [agvOpen, setAgvOpen] = useState(false);

  const reloadCard = useCallback(() => {
    fetchWorkCardDetail(cardId)
      .then((data) => setCard(data.work_card))
      .catch(() => setCard(null));
  }, [cardId]);

  useEffect(() => {
    reloadCard();
  }, [reloadCard]);

  const onSubmit = options?.onSubmit;
  const prependButtons = options?.prependButtons;

  const handleSubmit = useCallback(async () => {
    if (onSubmit) {
      await onSubmit();
      return;
    }
    try {
      await submitWorkCard(cardId);
      message.success('已提交执行结果');
      reloadCard();
    } catch (e) {
      message.error((e as Error).message);
    }
  }, [cardId, message, onSubmit, reloadCard]);

  const rightButtons = useMemo(() => {
    const buttons: OPHeaderButton[] = [
      ...(prependButtons ?? []),
      { key: 'agv', label: 'AGV', icon: <CarOutlined />, onClick: () => setAgvOpen(true) },
    ];
    if (card && card.status !== 'pending' && card.status !== 'completed') {
      buttons.push({
        key: 'submit',
        label: '提交结果',
        icon: <CheckCircleOutlined />,
        onClick: () => {
          void handleSubmit();
        },
      });
    }
    return buttons;
  }, [card, handleSubmit, prependButtons]);

  const agvModal = (
    <AgvModal
      open={agvOpen}
      onClose={() => setAgvOpen(false)}
      cardId={cardId}
      fromStation={config?.selected_station_code}
    />
  );

  return { card, rightButtons, agvModal, reloadCard };
}
