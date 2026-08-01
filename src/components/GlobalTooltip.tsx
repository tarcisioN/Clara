import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CLARA_TOOLTIP_EVENT,
  type ClaraTooltipDetail
} from './claraTooltip.ts';
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
  const shownTextRef = useRef<string | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const hide = useCallback(() => {
    clearTimer();
    setTooltip(null);
    shownTextRef.current = null;
    if (activeTargetRef.current && originalTitleRef.current != null) {
      activeTargetRef.current.setAttribute('title', originalTitleRef.current);
    }
    activeTargetRef.current = null;
    originalTitleRef.current = null;
  }, [clearTimer]);

  const show = useCallback(
    (target: HTMLElement, options?: { text?: string; delayMs?: number }) => {
      const text = options?.text ?? target.getAttribute('title');
      if (!text) {
        return;
      }
      if (activeTargetRef.current === target && shownTextRef.current === text) {
        return;
      }
      hide();

      const existing = target.getAttribute('title');
      if (existing) {
        // Suppress the OS tooltip while the faster Clara tooltip is active.
        target.removeAttribute('title');
        originalTitleRef.current = existing;
      } else if (options?.text) {
        originalTitleRef.current = null;
      } else {
        return;
      }

      activeTargetRef.current = target;
      shownTextRef.current = text;
      const delay = options?.delayMs ?? SHOW_DELAY_MS;
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        setTooltip({ text, target });
      }, delay);
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
    const onProgrammatic = (event: Event) => {
      const detail = (event as CustomEvent<ClaraTooltipDetail>).detail;
      if (!detail?.selector) {
        return;
      }
      const target = document.querySelector(detail.selector);
      if (!(target instanceof HTMLElement)) {
        return;
      }
      // Force a fresh show even if the same control was already active.
      if (activeTargetRef.current === target) {
        hide();
      }
      show(target, {
        text: detail.text,
        delayMs: detail.delayMs ?? 0
      });
    };

    document.addEventListener('pointerover', onPointerOver, true);
    document.addEventListener('pointerout', onPointerOut, true);
    document.addEventListener('focusin', onFocusIn, true);
    document.addEventListener('focusout', onFocusOut, true);
    window.addEventListener(CLARA_TOOLTIP_EVENT, onProgrammatic);
    return () => {
      document.removeEventListener('pointerover', onPointerOver, true);
      document.removeEventListener('pointerout', onPointerOut, true);
      document.removeEventListener('focusin', onFocusIn, true);
      document.removeEventListener('focusout', onFocusOut, true);
      window.removeEventListener(CLARA_TOOLTIP_EVENT, onProgrammatic);
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
