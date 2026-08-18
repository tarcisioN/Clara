export type AppCommand =
  | { type: 'open' }
  | { type: 'new-collection' }
  | { type: 'open-environment' }
  | { type: 'save' }
  | { type: 'save-all' }
  | { type: 'send' }
  | { type: 'close-tab' }
  | { type: 'force-close-tab' }
  | { type: 'new-request' }
  | { type: 'next-tab' }
  | { type: 'prev-tab' }
  | { type: 'select-tab'; index: number }
  | { type: 'next-change' }
  | { type: 'prev-change' };
