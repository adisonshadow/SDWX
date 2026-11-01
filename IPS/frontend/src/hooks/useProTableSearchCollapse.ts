import { useUserHabit } from '@/hooks/useUserHabit';
import { proTableSearchCollapseKey } from '@/utils/userHabit';

type SearchConfig = Record<string, unknown>;

/**
 * ProTable 查询区收起/展开，状态持久化到浏览器。
 * 返回值可作为 ProTable 的 search prop。
 */
export function useProTableSearchCollapse(pageId: string, options: SearchConfig = {}): SearchConfig {
  const defaultCollapsed = (options.defaultCollapsed as boolean | undefined) ?? true;
  const habitKey = proTableSearchCollapseKey(pageId);
  const [collapsed, setCollapsed] = useUserHabit<boolean>(habitKey, defaultCollapsed);

  const { defaultCollapsed: _defaultCollapsed, ...rest } = options;

  return {
    labelWidth: 'auto',
    ...rest,
    collapsed,
    onCollapse: setCollapsed,
  };
}
