import { Result } from 'antd';

interface PlaceholderProps {
  title?: string;
}

/**
 * 通用「开发中」占位页。
 * 本轮未实现模块（WBS/齐套/引擎/可视化/统计）路由指过来。
 */
export default function Placeholder({ title }: PlaceholderProps) {
  return (
    <Result
      status="info"
      title={title ?? '页面建设中'}
      subTitle="该模块在本轮迭代暂未实现，请关注后续版本。"
    />
  );
}
