/**
 * 帮助页 — 业务卖点 + 使用手册
 * 入口：顶栏帮助图标 → /help
 */
import { PageContainer } from '@ant-design/pro-components';
import { Card, Col, Menu, Row, Space, Typography } from 'antd';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { HELP_SECTIONS, SELL_POINTS } from './helpContent';

const { Title, Paragraph, Text } = Typography;

export default function HelpPage() {
  const [activeKey, setActiveKey] = useState(HELP_SECTIONS[0]?.key ?? 'overview');

  const section = useMemo(
    () => HELP_SECTIONS.find((s) => s.key === activeKey) ?? HELP_SECTIONS[0],
    [activeKey],
  );

  const menuItems = useMemo(
    () => HELP_SECTIONS.map((s) => ({ key: s.key, label: s.title })),
    [],
  );

  return (
    <PageContainer title="帮助" subTitle="面向车间业务人员的系统说明与操作指引">
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Card title="系统优势" size="small">
          <Row gutter={[16, 12]}>
            {SELL_POINTS.map((text, index) => (
              <Col key={text} xs={24} sm={12} lg={12} xl={12}>
                <Space align="start" size={8}>
                  <Text type="secondary" style={{ minWidth: 22 }}>
                    {index + 1}.
                  </Text>
                  <Text>{text}</Text>
                </Space>
              </Col>
            ))}
          </Row>
        </Card>

        <Card title="使用帮助手册" size="small" styles={{ body: { padding: 0 } }}>
          <Row style={{ minHeight: 520 }}>
            <Col
              xs={24}
              sm={8}
              md={6}
              style={{
                borderInlineEnd: '1px solid var(--ant-color-split, #f0f0f0)',
              }}
            >
              <Menu
                mode="inline"
                selectedKeys={[activeKey]}
                items={menuItems}
                onClick={({ key }) => setActiveKey(key)}
                style={{ borderInlineEnd: 'none', height: '100%' }}
              />
            </Col>
            <Col
              xs={24}
              sm={16}
              md={18}
              style={{ padding: 16, maxHeight: 'calc(100vh - 320px)', overflow: 'auto' }}
            >
              <Title level={5} style={{ marginTop: 0 }}>
                {section?.title}
              </Title>
              <Space direction="vertical" size={24} style={{ width: '100%' }}>
                {section?.items.map((item) => (
                  <div key={item.title}>
                    <Text strong style={{ fontSize: 15 }}>
                      {item.title}
                    </Text>
                    {item.paragraphs.map((p, i) => (
                      <Paragraph
                        key={`${item.title}-${i}`}
                        type="secondary"
                        style={{ marginBottom: 8, marginTop: 8 }}
                      >
                        {p}
                      </Paragraph>
                    ))}
                    {item.links?.length ? (
                      <Space size="middle" wrap>
                        {item.links.map((link) => (
                          <Link key={link.path} to={link.path}>
                            {link.label} →
                          </Link>
                        ))}
                      </Space>
                    ) : null}
                  </div>
                ))}
              </Space>
            </Col>
          </Row>
        </Card>
      </Space>
    </PageContainer>
  );
}
