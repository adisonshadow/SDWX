import React, { useCallback, useMemo, useRef, useState } from 'react';
import { FixHeaderPageScrollContext } from './FixHeaderPageContext';
import './index.css';

export type FixHeaderPageProps = {
  title: React.ReactNode;
  subTitle?: React.ReactNode;
  centerSlot?: React.ReactNode;
  extra?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
};

const FixHeaderPage: React.FC<FixHeaderPageProps> = ({
  title,
  subTitle,
  centerSlot,
  extra,
  children,
  className,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [scrollReady, setScrollReady] = useState(false);

  const setScrollContainerRef = useCallback((node: HTMLDivElement | null) => {
    scrollContainerRef.current = node;
    setScrollReady(!!node);
  }, []);

  const scrollToElement = useCallback((element: HTMLElement | null, offset = 0) => {
    const container = scrollContainerRef.current;
    if (!element || !container) return;
    const top =
      element.getBoundingClientRect().top -
      container.getBoundingClientRect().top +
      container.scrollTop -
      offset;
    container.scrollTo({ top: Math.max(top, 0), behavior: 'smooth' });
  }, []);

  const scrollContextValue = useMemo(
    () => ({ scrollContainerRef, scrollReady, scrollToElement }),
    [scrollReady, scrollToElement],
  );

  return (
    <FixHeaderPageScrollContext.Provider value={scrollContextValue}>
      <div className={['fix-header-page', className].filter(Boolean).join(' ')}>
        <header className="fix-header-page__header">
          <div className="fix-header-page__header-main">
            <div className="fix-header-page__header-text">
              <div className="fix-header-page__title">{title}</div>
              {subTitle ? (
                <div className="fix-header-page__subtitle">{subTitle}</div>
              ) : null}
            </div>
            <div className="fix-header-page__center">{centerSlot}</div>
            <div className="fix-header-page__extra">{extra}</div>
          </div>
        </header>
        <div ref={setScrollContainerRef} className="fix-header-page__body">
          {children}
        </div>
      </div>
    </FixHeaderPageScrollContext.Provider>
  );
};

export default FixHeaderPage;
export { useFixHeaderPageScroll, useFixHeaderPageScrollOptional } from './FixHeaderPageContext';
