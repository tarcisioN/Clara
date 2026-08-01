import { useCallback, useEffect, useRef, useState } from 'react';
import './GlobalTooltip.css';

const SHOW_DELAY_MS = 100;

type TooltipState = {
  text: string;
  target: HTMLElement;
};

function tooltipTarget(node: EventTarget | null): HTMLElement | null {
  return node instanceof Element
    ? (node.closest('[title]') as HTMLElement | null)
    : null;
}

export default function GlobalTooltip() {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const timerRef = useRef<number | null>(null);
  const activeTargetRef = useRef<HTMLElement | null>(null);
  const originalTitleRef = useRef<string | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const hide = useCallback(() => {
    clearTimer();
    setTooltip(null);
    if (activeTargetRef.current && originalTitleRef.current != null) {
      activeTargetRef.current.setAttribute('title', originalTitleRef.current);
    }
    activeTargetRef.current = null;
    originalTitleRef.current = null;
  }, [clearTimer]);

  const show = useCallback(
    (target: HTMLElement) => {
      if (activeTargetRef.current === target) {
        return;
      }
      hide();
      const text = target.getAttribute('title');
      if (!text) {
        return;
      }

      // Suppress the OS tooltip while the faster Clara tooltip is active.
      target.removeAttribute('title');
      activeTargetRef.current = target;
      originalTitleRef.current = text;
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        setTooltip({ text, target });
      }, SHOW_DELAY_MS);
    },
    [hide]
  );

  useEffect(() => {
    const onPointerOver = (event: PointerEvent) => {
      const target = tooltipTarget(event.target);
      if (target) {
        show(target);
      }
    };
    const onPointerOut = (event: PointerEvent) => {
      const active = activeTargetRef.current;
      if (active && !(event.relatedTarget instanceof Node && active.contains(event.relatedTarget))) {
        hide();
      }
    };
    const onFocusIn = (event: FocusEvent) => {
      const target = tooltipTarget(event.target);
      if (target) {
        show(target);
      }
    };
    const onFocusOut = (event: FocusEvent) => {
      if (activeTargetRef.current?.contains(event.target as Node)) {
        hide();
      }
    };

    document.addEventListener('pointerover', onPointerOver, true);
    document.addEventListener('pointerout', onPointerOut, true);
    document.addEventListener('focusin', onFocusIn, true);
    document.addEventListener('focusout', onFocusOut, true);
    return () => {
      document.removeEventListener('pointerover', onPointerOver, true);
      document.removeEventListener('pointerout', onPointerOut, true);
      document.removeEventListener('focusin', onFocusIn, true);
      document.removeEventListener('focusout', onFocusOut, true);
      hide();
    };
  }, [hide, show]);

  if (!tooltip || !tooltip.target.isConnected) {
    return null;
  }

  const rect = tooltip.target.getBoundingClientRect();
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - 328));
  const showAbove = rect.bottom + 48 > window.innerHeight;

  return (
    <div
      className="global-tooltip"
      role="tooltip"
      style={{
        left,
        ...(showAbove
          ? { bottom: window.innerHeight - rect.top + 6 }
          : { top: rect.bottom + 6 })
      }}
    >
      {tooltip.text}
    </div>
  );
}
