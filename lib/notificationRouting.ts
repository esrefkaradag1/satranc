import type { WhatsAppAutoRule } from '../types';
import {
  DEFAULT_NOTIFICATION_CHANNELS,
  NOTIFICATION_EVENTS,
  type NotificationChannel,
  type NotificationDeliveryRule,
  type NotificationEvent,
} from './notificationEvents';

const STORAGE_KEY = 'netchess_notification_delivery_rules';

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as T;
  } catch { /* ignore */ }
  return fallback;
}

function saveJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch { /* quota */ }
}

export function defaultDeliveryRules(): NotificationDeliveryRule[] {
  return NOTIFICATION_EVENTS.map((event) => ({
    event,
    channel: DEFAULT_NOTIFICATION_CHANNELS[event],
  }));
}

export function loadNotificationDeliveryRules(): NotificationDeliveryRule[] {
  const stored = loadJson<NotificationDeliveryRule[]>(STORAGE_KEY, []);
  const byEvent = new Map<NotificationEvent, NotificationChannel>();
  for (const row of stored) {
    if (row?.event && row.channel) byEvent.set(row.event, row.channel);
  }
  return NOTIFICATION_EVENTS.map((event) => {
    let channel = byEvent.get(event) ?? DEFAULT_NOTIFICATION_CHANNELS[event];
    // Eski kurulumda yoklama yalnızca panele gidiyordu; şablonlar eklendi.
    if ((event === 'lesson_present' || event === 'lesson_absent') && channel === 'panel') {
      channel = 'both';
    }
    return { event, channel };
  });
}

export function saveNotificationDeliveryRules(rules: NotificationDeliveryRule[]) {
  saveJson(STORAGE_KEY, rules);
}

export function getDeliveryChannel(
  event: NotificationEvent,
  rules?: NotificationDeliveryRule[],
): NotificationChannel {
  const list = rules ?? loadNotificationDeliveryRules();
  return list.find((r) => r.event === event)?.channel ?? DEFAULT_NOTIFICATION_CHANNELS[event];
}

/** Eski WhatsApp auto kurallarından kanal türet (ilk yükleme). */
export function deliveryRulesFromWhatsAppAuto(autoRules: WhatsAppAutoRule[]): NotificationDeliveryRule[] {
  return NOTIFICATION_EVENTS.map((event) => {
    const auto = autoRules.find((r) => r.event === event);
    if (!auto) return { event, channel: DEFAULT_NOTIFICATION_CHANNELS[event] };
    if (!auto.enabled) return { event, channel: 'off' as const };
    if (event === 'lesson_start') return { event, channel: 'both' as const };
    return { event, channel: 'whatsapp' as const };
  });
}

/** Kanal ayarına göre WhatsApp auto rule enabled bayrağı. */
export function whatsAppAutoEnabledFromChannel(channel: NotificationChannel): boolean {
  return channel === 'whatsapp' || channel === 'both';
}

export function syncWhatsAppAutoRulesFromDelivery(
  deliveryRules: NotificationDeliveryRule[],
  autoRules: WhatsAppAutoRule[],
): WhatsAppAutoRule[] {
  const byEvent = new Map(deliveryRules.map((r) => [r.event, r.channel]));
  return autoRules.map((rule) => {
    const channel = byEvent.get(rule.event as NotificationEvent);
    if (!channel) return rule;
    return { ...rule, enabled: whatsAppAutoEnabledFromChannel(channel) };
  });
}
