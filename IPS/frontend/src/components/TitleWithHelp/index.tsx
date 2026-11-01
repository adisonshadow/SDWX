import { QuestionCircleFilled } from '@ant-design/icons';
import { Modal, Popover } from 'antd';
import type { PopoverProps } from 'antd';
import React, { useState } from 'react';

export interface TitleWithHelpProps {
  title: React.ReactNode;
  help: React.ReactNode;
  placement?: PopoverProps['placement'];
  /** popover=悬停；modal=点击打开详情（适合长文档/代码示例） */
  helpMode?: 'popover' | 'modal';
  modalTitle?: React.ReactNode;
  modalWidth?: number | string;
}

const TitleWithHelp: React.FC<TitleWithHelpProps> = ({
  title,
  help,
  placement = 'rightTop',
  helpMode = 'popover',
  modalTitle = '说明',
  modalWidth = 720,
}) => {
  const [open, setOpen] = useState(false);

  if (helpMode === 'modal') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        {title}
        <QuestionCircleFilled
          style={{ color: 'rgba(0,0,0,0.35)', cursor: 'pointer', fontSize: 14 }}
          onClick={(e) => {
            e.stopPropagation();
            setOpen(true);
          }}
        />
        <Modal
          title={modalTitle}
          open={open}
          onCancel={() => setOpen(false)}
          footer={null}
          width={modalWidth}
          destroyOnClose
        >
          <div className="title-with-help-modal-body">{help}</div>
        </Modal>
      </span>
    );
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      {title}
      <Popover content={help} trigger="hover" placement={placement}>
        <QuestionCircleFilled
          style={{ color: 'rgba(0,0,0,0.35)', cursor: 'pointer', fontSize: 14 }}
          onClick={(e) => e.stopPropagation()}
        />
      </Popover>
    </span>
  );
};

export default TitleWithHelp;
