import { isEscalationAlert } from '../engine/escalate';
import type { Alert } from '../engine/types';

export interface DeliveryReceipt {
  channel: string;
  delivered: boolean;
  detail?: string;
}

/**
 * Port: how a page reaches the user outside the app window. The in-app LCD
 * and beep always run; a channel adds the out-of-app path.
 */
export interface PagerChannel {
  readonly name: string;
  deliver(alert: Alert): Promise<DeliveryReceipt>;
  /** Withdraw a page (on ACK), so a lock-screen notification does not linger. */
  withdraw(pageId: string): Promise<void>;
  /**
   * Optional: hand future beeps to a remote scheduler so they go out with the
   * app closed. A channel that schedules does not send those beeps again from
   * `deliver`.
   */
  schedule?(alerts: readonly Alert[]): Promise<boolean>;
}

/** Records deliveries in memory. Used by tests. */
export class MemoryChannel implements PagerChannel {
  readonly name = 'memory';
  readonly sent: Alert[] = [];
  readonly withdrawn: string[] = [];

  async deliver(alert: Alert): Promise<DeliveryReceipt> {
    this.sent.push(alert);
    return { channel: this.name, delivered: true };
  }

  async withdraw(pageId: string): Promise<void> {
    this.withdrawn.push(pageId);
  }
}

/** Minimal surface of the browser APIs the notification channel uses, so it can be tested without a browser. */
export interface NotificationHost {
  permission(): NotificationPermission | 'unsupported';
  registration(): Promise<Pick<ServiceWorkerRegistration, 'showNotification' | 'getNotifications'> | null>;
  vibrate?(pattern: number[]): void;
}

export const browserNotificationHost: NotificationHost = {
  permission: () => (typeof Notification === 'undefined' ? 'unsupported' : Notification.permission),
  registration: async () => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
    try {
      return (await navigator.serviceWorker.getRegistration()) ?? null;
    } catch {
      return null;
    }
  },
  vibrate: (pattern) => {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(pattern);
  },
};

/** Vibration pattern of a 1990s pager: three short buzzes. */
export const BUZZ = [180, 90, 180, 90, 420];

/**
 * Free local path: Web Notifications shown by the service worker, with an ACK
 * action button. Works while the PWA is installed or the tab is open.
 */
export class BrowserNotificationChannel implements PagerChannel {
  readonly name = 'browser-notifications';

  constructor(private readonly host: NotificationHost = browserNotificationHost) {}

  async deliver(alert: Alert): Promise<DeliveryReceipt> {
    if (isEscalationAlert(alert)) return { channel: this.name, delivered: false, detail: 'on-screen only' };
    if (alert.silent) return { channel: this.name, delivered: false, detail: 'silent page' };
    const permission = this.host.permission();
    if (permission !== 'granted') return { channel: this.name, delivered: false, detail: `notifications ${permission}` };
    const reg = await this.host.registration();
    if (!reg) return { channel: this.name, delivered: false, detail: 'no service worker' };
    this.host.vibrate?.(BUZZ);
    const options: NotificationOptions & { renotify?: boolean; actions?: { action: string; title: string }[]; vibrate?: number[] } = {
      body: alert.text,
      tag: alert.pageId,
      renotify: true,
      requireInteraction: true,
      vibrate: BUZZ,
      icon: '/icon.svg',
      badge: '/icon.svg',
      data: { pageId: alert.pageId, alertId: alert.id },
      actions: [{ action: 'ack', title: 'ACK' }],
    };
    await reg.showNotification(alert.code, options);
    return { channel: this.name, delivered: true };
  }

  async withdraw(pageId: string): Promise<void> {
    const reg = await this.host.registration();
    if (!reg) return;
    for (const n of await reg.getNotifications({ tag: pageId })) n.close();
  }
}

/**
 * Real: hands the page to the relay, which texts it through Amazon End User
 * Messaging SMS and cancels scheduled repeats on ACK. The browser never names
 * a phone number: the relay texts only the number in its own configuration.
 * Written and type-checked; used only when VITE_CHANNEL=relay.
 */
export class RelaySmsChannel implements PagerChannel {
  readonly name = 'sms (relay)';

  constructor(
    private readonly baseUrl: string,
    private readonly secret: string,
    private readonly fetchImpl: typeof fetch = (...args) => fetch(...args),
  ) {}

  /** Alert ids the relay's scheduler will send, so the open app does not send them twice. */
  private readonly scheduled = new Set<string>();

  private post(path: string, body: unknown): Promise<Response> {
    return this.fetchImpl(`${this.baseUrl.replace(/\/$/, '')}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-relay-secret': this.secret },
      body: JSON.stringify(body),
    });
  }

  async deliver(alert: Alert): Promise<DeliveryReceipt> {
    if (isEscalationAlert(alert)) return { channel: this.name, delivered: false, detail: 'on-screen only' };
    if (alert.silent) return { channel: this.name, delivered: false, detail: 'silent page' };
    if (this.scheduled.has(alert.id)) return { channel: this.name, delivered: true, detail: 'sent by the relay schedule' };
    const res = await this.post('/page', { pageId: alert.pageId, code: alert.code, text: alert.text });
    return { channel: this.name, delivered: res.ok, detail: res.ok ? undefined : `relay ${res.status}` };
  }

  async withdraw(pageId: string): Promise<void> {
    if (isEscalationAlert({ pageId })) return;
    for (const id of [...this.scheduled]) if (id.startsWith(`${pageId}#`)) this.scheduled.delete(id);
    await this.post('/ack', { pageId });
  }

  async schedule(alerts: readonly Alert[]): Promise<boolean> {
    const loud = alerts.filter((a) => !a.silent && !isEscalationAlert(a));
    if (loud.length === 0) return true;
    const res = await this.post('/schedule', {
      alerts: loud.map(({ id, at, code, text }) => ({ id, at, code, text })),
    });
    if (res.ok) for (const a of loud) this.scheduled.add(a.id);
    return res.ok;
  }
}
