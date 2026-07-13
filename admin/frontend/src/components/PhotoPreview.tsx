/**
 * PhotoPreview — 图片预览弹窗
 */
import { Modal } from 'antd';

export default function PhotoPreview({
  open,
  onClose,
  src,
  title = '图片预览',
}: {
  open: boolean;
  onClose: () => void;
  src: string;
  title?: string;
}) {
  return (
    <Modal title={title} open={open} onCancel={onClose} footer={null} width={640}>
      <div style={{ textAlign: 'center' }}>
        <img
          src={src}
          alt="检测图片"
          style={{ maxWidth: '100%', maxHeight: '60vh', borderRadius: 'var(--op-radius-sm)' }}
        />
      </div>
    </Modal>
  );
}
