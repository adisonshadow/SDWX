/**
 * 用户信息 store（zustand）
 * 从 localStorage 的 SSO user_info 初始化；供页面取操作人 id/name。
 */
import { create } from 'zustand';
import { getUserInfo } from '@/auth/auth';

export interface IpsUser {
  id?: string;
  name?: string;
  username?: string;
}

interface UserState {
  user: IpsUser | null;
  refresh: () => void;
  setUser: (user: IpsUser | null) => void;
}

export const useUserStore = create<UserState>((set) => ({
  user: getUserInfo<IpsUser>(),
  refresh: () => set({ user: getUserInfo<IpsUser>() }),
  setUser: (user) => set({ user }),
}));
