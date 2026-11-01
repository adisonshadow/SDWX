import { LeftOutlined } from '@ant-design/icons';
import { Button, Flex } from 'antd';
import React from 'react';
import { useNavigate } from 'react-router-dom';

export interface PageContainerTitleWithBackProps {
  title: React.ReactNode;
  /** 指定返回路径；省略时 navigate(-1) */
  backTo?: string;
}

const PageContainerTitleWithBack: React.FC<PageContainerTitleWithBackProps> = ({
  title,
  backTo,
}) => {
  const navigate = useNavigate();

  const handleBack = () => {
    if (backTo) {
      navigate(backTo);
      return;
    }
    navigate(-1);
  };

  return (
    <Flex align="center" gap={8}>
      <Button
        type="text"
        icon={<LeftOutlined />}
        styles={{
          root: { padding: 0, margin: 0 },
          icon: { fontSize: 18 },
        }}
        onClick={handleBack}
      />
      <span style={{ fontSize: 18 }}>{title}</span>
    </Flex>
  );
};

export default PageContainerTitleWithBack;
