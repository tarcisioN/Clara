export type AppCommand =
  | { type: 'open' }
  | { type: 'save' }
  | { type: 'close-tab' }
  | { type: 'next-tab' }
  | { type: 'prev-tab' }
  | { type: 'select-tab'; index: number };
