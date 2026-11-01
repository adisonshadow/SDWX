import { App as AntdApp } from 'antd';
import { useEffect } from 'react';
import { setStaticApis } from '@/utils/antdAppApis';

/**
 * 在 <AntdApp> 内挂载一次，把 message/modal/notification 注入静态桥。
 * 放在 App.tsx 的 <AntdApp> 内部、<BrowserRouter> 之前。
 */
export default function StaticApiSetter() {
  const { message, modal, notification } = AntdApp.useApp();
  useEffect(() => {
    setStaticApis({ message, modal, notification } as never);
  }, [message, modal, notification]);
  return null;
}
