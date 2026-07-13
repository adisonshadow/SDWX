/**
 * OPHeader — OPWeb 共用 sticky header
 *
 * 左：返回按钮（可选）
 * 中：标题
 * 右：页面操作 slot + 更多按钮
 */
import type { ReactNode } from 'react';
import { ArrowLeftOutlined, MoreOutlined } from '@ant-design/icons';

export interface OPHeaderButton {
  key: string;
  label: string;
  icon?: ReactNode;
  onClick: () => void;
}

export default function OPHeader({
  title,
  onBack,
  rightButtons,
  rightSlot,
  trailingSlot,
  onMore,
}: {
  title: string;
  onBack?: () => void;
  rightButtons?: OPHeaderButton[];
  rightSlot?: ReactNode;
  /** 页面按钮之后、「更多」之前的全局操作区 */
  trailingSlot?: ReactNode;
  onMore?: () => void;
}) {
  return (
    <div className="op-header">
      <div className="op-header-left">
        {onBack ? (
          <button type="button" className="op-header-btn op-back-btn" onClick={onBack}>
            <ArrowLeftOutlined />
          </button>
        ) : null}
      </div>
      <div className="op-header-center">{title}</div>
      <div className="op-header-right">
        {rightSlot}
        {rightButtons?.map((btn) => (
          <button key={btn.key} type="button" className="op-header-btn" onClick={btn.onClick}>
            {btn.icon}
            {btn.label}
          </button>
        ))}
        {trailingSlot}
        {onMore && (
          <button type="button" className="op-header-btn op-more-btn" onClick={onMore} aria-label="更多">
            <MoreOutlined />
          </button>
        )}
      </div>
    </div>
  );
}
