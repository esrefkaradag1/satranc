import type { WhatsAppAutoRule } from '../types';
import { getServiceSupabase, isSupabaseBackend, supabase } from '../services/supabase';
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
  return NOTIFICATION_EVENTS.map((event) => ({
    event,
    channel: byEvent.get(event) ?? DEFAULT_NOTIFICATION_CHANNELS[event],
  }));
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
    const fallback = DEFAULT_NOTIFICATION_CHANNELS[event];
    if (!auto) return { event, channel: fallback };
    if (!auto.enabled) return { event, channel: 'off' as const };
    if (fallback === 'panel' || fallback === 'both') return { event, channel: fallback };
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

const RULES_TABLE = 'notification_delivery_rules';
const HYDRATE_TTL_MS = 30_000;
let hydrateInFlight: Promise<void> | null = null;
let lastHydrateAt = 0;

function rulesClient() {
  if (!isSupabaseBackend()) return null;
  return getServiceSupabase() ?? supabase;
}

export async function persistNotificationDeliveryRulesRemote(
  rules: NotificationDeliveryRule[],
): Promise<boolean> {
  const sb = rulesClient();
  if (!sb) return false;
  try {
    const rows = rules.map((r) => ({
      event: r.event,
      channel: r.channel,
      updated_at: new Date().toISOString(),
    }));
    const { error } = await sb.from(RULES_TABLE).upsert(rows, { onConflict: 'event' });
    if (error) {
      console.warn('[notification-rules] save failed:', error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('[notification-rules] save failed:', e);
    return false;
  }
}

export async function hydrateNotificationDeliveryRules(): Promise<NotificationDeliveryRule[]> {
  if (Date.now() - lastHydrateAt < HYDRATE_TTL_MS) {
    return loadNotificationDeliveryRules();
  }
  if (hydrateInFlight) {
    await hydrateInFlight;
    return loadNotificationDeliveryRules();
  }
  hydrateInFlight = (async () => {
    const sb = rulesClient();
    if (!sb) return;
    try {
      const { data, error } = await sb.from(RULES_TABLE).select('event, channel');
      if (error || !data?.length) return;
      const byEvent = new Map<NotificationEvent, NotificationChannel>();
      for (const row of data as { event?: string; channel?: string }[]) {
        if (!row.event || !row.channel) continue;
        byEvent.set(row.event as NotificationEvent, row.channel as NotificationChannel);
      }
      if (byEvent.size === 0) return;
      saveNotificationDeliveryRules(
        NOTIFICATION_EVENTS.map((event) => ({
          event,
          channel: byEvent.get(event) ?? DEFAULT_NOTIFICATION_CHANNELS[event],
        })),
      );
      lastHydrateAt = Date.now();
    } catch (e) {
      console.warn('[notification-rules] load failed:', e);
    }
  })();
  try {
    await hydrateInFlight;
  } finally {
    hydrateInFlight = null;
  }
  return loadNotificationDeliveryRules();
}
