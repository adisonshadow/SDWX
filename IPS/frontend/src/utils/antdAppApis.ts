/**
 * antd 静态 API 桥（message / modal / notification）
 *
 * antd v6 推荐通过 App.useApp() 取实例；但 ProTable request 回调、拦截器、事件处理器等
 * 非 React 上下文里无法用 hook。这里用静态 holder 持有 App.useApp() 注入的实例，
 * 任何地方 `import { message } from '@/utils/antdAppApis'` 即可调用。
 *
 * 必须在应用根部用 <StaticApiSetter /> 挂载一次（在 <AntdApp> 内）。
 */
import { App as AntdApp } from 'antd';

type AnyApi = Record<string, (...args: any[]) => any>;

interface StaticApis {
  message: AnyApi;
  modal: AnyApi;
  notification: AnyApi;
}

let staticApis: StaticApis | null = null;

export function setStaticApis(apis: StaticApis): void {
  staticApis = apis;
}

// 回退：AntdApp 的静态方法（antd v6 仍提供 App.message / App.modal / App.notification）
const fallback: StaticApis = {
  message: (AntdApp as unknown as { message: AnyApi }).message,
  modal: (AntdApp as unknown as { modal: AnyApi }).modal,
  notification: (AntdApp as unknown as { notification: AnyApi }).notification,
};

function makeProxy(name: 'message' | 'modal' | 'notification'): AnyApi {
  return new Proxy({} as AnyApi, {
    get(_t, prop: string) {
      const apis = staticApis ?? fallback;
      const fn = apis[name]?.[prop];
      return typeof fn === 'function' ? fn.bind(apis[name]) : fn;
    },
  });
}

export const message = makeProxy('message') as AnyApi;
export const modal = makeProxy('modal') as AnyApi;
export const notification = makeProxy('notification') as AnyApi;
