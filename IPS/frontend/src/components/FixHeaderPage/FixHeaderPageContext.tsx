import { createContext, useContext, type RefObject } from 'react';

export type FixHeaderPageScrollContextValue = {
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  scrollReady: boolean;
  scrollToElement: (element: HTMLElement | null, offset?: number) => void;
};

export const FixHeaderPageScrollContext = createContext<FixHeaderPageScrollContextValue | null>(null);

export function useFixHeaderPageScroll() {
  const ctx = useContext(FixHeaderPageScrollContext);
  if (!ctx) {
    throw new Error('useFixHeaderPageScroll must be used within FixHeaderPage');
  }
  return ctx;
}

export function useFixHeaderPageScrollOptional() {
  return useContext(FixHeaderPageScrollContext);
}
