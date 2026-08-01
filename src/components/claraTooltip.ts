/** Programmatic Clara tooltip (picked up by GlobalTooltip). */

export const CLARA_TOOLTIP_EVENT = 'clara:tooltip';

export type ClaraTooltipDetail = {
  /** CSS selector for the target element with (or receiving) a title. */
  selector: string;
  /** Optional title override for this nudge. */
  text?: string;
  /** Delay before showing; default matches hover tooltips. */
  delayMs?: number;
};

export function showClaraTooltip(detail: ClaraTooltipDetail): void {
  window.dispatchEvent(
    new CustomEvent<ClaraTooltipDetail>(CLARA_TOOLTIP_EVENT, { detail })
  );
}
