import { type ReactNode, useRef, useState, useEffect, useCallback } from 'react';

type ScrollableMainProps = {
  children: ReactNode;
  className?: string;
};

const HIDE_DELAY_MS = 1000;

export function ScrollableMain({ children, className = '' }: ScrollableMainProps) {
  const ref = useRef<HTMLElement>(null);
  const [scrolling, setScrolling] = useState(false);
  const timerRef = useRef<number | null>(null);

  const scheduleHide = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => {
      setScrolling(false);
      timerRef.current = null;
    }, HIDE_DELAY_MS);
  }, []);

  const handleScroll = useCallback(() => {
    if (!scrolling) {
      setScrolling(true);
    }
    scheduleHide();
  }, [scrolling, scheduleHide]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const onScroll = () => handleScroll();
    el.addEventListener('scroll', onScroll, { passive: true });

    // Show briefly on mount so the user knows the element is scrollable if it overflows.
    setScrolling(true);
    scheduleHide();

    return () => {
      el.removeEventListener('scroll', onScroll);
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, [handleScroll, scheduleHide]);

  return (
    <main
      ref={ref}
      className={`scrollable-main ${scrolling ? 'scrollable-active' : ''} ${className}`}
    >
      {children}
    </main>
  );
}
