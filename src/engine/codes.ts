import type { PageKind } from './types';

export interface CodeEntry {
  code: string;
  meaning: string;
  detail: string;
}

/** The numeric codes, printed on the wallet card that ships with the pager. */
export const CODE_FOR: Record<PageKind, string> = {
  'get-ready': '411',
  'leave-now': '911',
  'focus-start': '121',
  'check-in': '121',
  'wrap-up': '200',
  digest: '100',
};

export const BOOT_CODE = '07734';
export const MISSED_CODE = '666';

export const CODE_CARD: CodeEntry[] = [
  { code: '411', meaning: 'Get ready', detail: 'Start getting ready now. Shoes, keys, meds.' },
  { code: '911', meaning: 'Leave now', detail: 'Walk out the door now to arrive on time.' },
  { code: '911 911', meaning: 'Still here?', detail: 'Unanswered pages repeat, louder, until you ACK.' },
  { code: '121', meaning: 'Body double', detail: 'Start, or check in on, a focus block.' },
  { code: '200', meaning: 'Wrap up', detail: 'Focus block is over. Stop, save, stand up.' },
  { code: '100', meaning: 'Digest', detail: 'One quiet page with everything that did not earn a beep.' },
  { code: '666', meaning: 'Missed', detail: 'A page nobody answered. It stays in memory to haunt you.' },
  { code: '07734', meaning: 'hELLO', detail: 'Turn the pager upside down.' },
];

/** Escalation repeats the code, like a 1990s "911 911 911" page. */
export function escalatedCode(code: string, level: number): string {
  const repeats = Math.min(level + 1, 3);
  return Array.from({ length: repeats }, () => code).join(' ');
}
