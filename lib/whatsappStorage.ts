import type {
  WhatsAppAutoRule,
  WhatsAppConfig,
  WhatsAppContactGroup,
  WhatsAppDeliveryState,
  WhatsAppMessageLog,
  WhatsAppMessageStatus,
  WhatsAppTemplate,
} from '../types';
import { DEFAULT_WHATSAPP_AUTO_RULES, DEFAULT_WHATSAPP_TEMPLATES } from './whatsappTemplates';

const CONFIG_KEY = 'netchess_whatsapp_config';
const TEMPLATES_KEY = 'netchess_whatsapp_templates';
const LOGS_KEY = 'netchess_whatsapp_logs';
const RULES_KEY = 'netchess_whatsapp_auto_rules';
const GROUPS_KEY = 'netchess_whatsapp_contact_groups';
const DELIVERY_KEY = 'netchess_whatsapp_delivery';
const MAX_LOGS = 2000;
const MAX_DELIVERY_ENTRIES = 1000;

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

export const DEFAULT_WHATSAPP_CONFIG: WhatsAppConfig = {
  provider: 'wamessage',
  apiBaseUrl: 'https://api.toplusms.app',
  apiKey: '',
  instanceName: '',
  devicePhone: '',
  loginIdentifier: '',
  enabled: false,
};

export function loadWhatsAppConfig(): WhatsAppConfig {
  const stored = loadJson<Partial<WhatsAppConfig>>(CONFIG_KEY, {});
  const merged: WhatsAppConfig = { ...DEFAULT_WHATSAPP_CONFIG, ...stored };
  if (!merged.provider) merged.provider = 'wamessage';
  if (merged.provider === 'wamessage' && !String(merged.apiBaseUrl || '').trim()) {
    merged.apiBaseUrl = DEFAULT_WHATSAPP_CONFIG.apiBaseUrl;
  }
  return merged;
}

export function saveWhatsAppConfig(config: WhatsAppConfig) {
  saveJson(CONFIG_KEY, config);
}

export function loadWhatsAppTemplates(): WhatsAppTemplate[] {
  const stored = loadJson<WhatsAppTemplate[]>(TEMPLATES_KEY, []);
  if (stored.length === 0) return [...DEFAULT_WHATSAPP_TEMPLATES];
  const byKey = new Map(stored.map((t) => [t.key, t]));
  for (const d of DEFAULT_WHATSAPP_TEMPLATES) {
    if (!byKey.has(d.key)) byKey.set(d.key, d);
  }
  return [...byKey.values()];
}

export function saveWhatsAppTemplates(templates: WhatsAppTemplate[]) {
  saveJson(TEMPLATES_KEY, templates);
}

export function loadWhatsAppAutoRules(): WhatsAppAutoRule[] {
  const stored = loadJson<WhatsAppAutoRule[]>(RULES_KEY, []);
  if (stored.length === 0) return [...DEFAULT_WHATSAPP_AUTO_RULES];
  const byEvent = new Map(stored.map((r) => [r.event, r]));
  for (const d of DEFAULT_WHATSAPP_AUTO_RULES) {
    if (!byEvent.has(d.event)) byEvent.set(d.event, d);
  }
  return [...byEvent.values()];
}

export function saveWhatsAppAutoRules(rules: WhatsAppAutoRule[]) {
  saveJson(RULES_KEY, rules);
}

export function loadWhatsAppLogs(): WhatsAppMessageLog[] {
  return loadJson<WhatsAppMessageLog[]>(LOGS_KEY, []);
}

export function appendWhatsAppLog(entry: WhatsAppMessageLog) {
  const logs = loadWhatsAppLogs();
  logs.unshift(entry);
  saveJson(LOGS_KEY, logs.slice(0, MAX_LOGS));
}

export function loadWhatsAppContactGroups(): WhatsAppContactGroup[] {
  return loadJson<WhatsAppContactGroup[]>(GROUPS_KEY, []);
}

export function saveWhatsAppContactGroups(groups: WhatsAppContactGroup[]) {
  saveJson(GROUPS_KEY, groups);
}

export function mergeWhatsAppLogs(
  serverLogs: WhatsAppMessageLog[],
  localLogs: WhatsAppMessageLog[],
  limit = 100,
): WhatsAppMessageLog[] {
  const byId = new Map<string, WhatsAppMessageLog>();
  for (const log of [...serverLogs, ...localLogs]) {
    if (!log?.id) continue;
    const prev = byId.get(log.id);
    if (!prev) {
      byId.set(log.id, log);
      continue;
    }
    // Aynı kayıt hem sunucuda hem yerelde olabilir: daha yeni teslim bilgisi kazanır.
    const merged: WhatsAppMessageLog = { ...prev, ...log };
    const prevChecked = prev.deliveryCheckedAt ?? '';
    const nextChecked = log.deliveryCheckedAt ?? '';
    if (prev.deliveryState && prevChecked > nextChecked) {
      merged.deliveryState = prev.deliveryState;
      merged.deliveryCheckedAt = prev.deliveryCheckedAt;
      merged.deliveryNote = prev.deliveryNote ?? merged.deliveryNote;
      merged.providerReportId = prev.providerReportId ?? merged.providerReportId;
    }
    byId.set(log.id, merged);
  }
  return [...byId.values()]
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, limit);
}

/**
 * Teslim durumu önbelleği: sunucudan gelen günlükler için de durum saklanır
 * (whatsapp_message_logs tablosuna kolon eklemeye gerek kalmadan).
 */
export type WhatsAppDeliveryCacheEntry = {
  state: WhatsAppDeliveryState;
  note?: string;
  reportId?: string;
  checkedAt: string;
};

export function loadWhatsAppDeliveryCache(): Record<string, WhatsAppDeliveryCacheEntry> {
  return loadJson<Record<string, WhatsAppDeliveryCacheEntry>>(DELIVERY_KEY, {});
}

/** delivery-check sonuçlarını önbelleğe yaz ve güncel önbelleği döndür */
export function saveWhatsAppDeliveryEntries(
  rows: { id: string; deliveryState: WhatsAppDeliveryState; note?: string; reportId?: string }[],
): Record<string, WhatsAppDeliveryCacheEntry> {
  const checkedAt = new Date().toISOString();
  const next: Record<string, WhatsAppDeliveryCacheEntry> = { ...loadWhatsAppDeliveryCache() };
  let changed = false;
  for (const row of rows) {
    if (!row?.id) continue;
    changed = true;
    next[row.id] = {
      state: row.deliveryState,
      note: row.note || undefined,
      reportId: row.reportId || undefined,
      checkedAt,
    };
  }
  if (!changed) return next;
  const trimmed = Object.fromEntries(Object.entries(next).slice(-MAX_DELIVERY_ENTRIES));
  saveJson(DELIVERY_KEY, trimmed);
  return trimmed;
}

/** Günlük listesine teslim durumu önbelleğini uygula */
export function applyWhatsAppDeliveryCache(
  logs: WhatsAppMessageLog[],
  cache: Record<string, WhatsAppDeliveryCacheEntry> = loadWhatsAppDeliveryCache(),
): WhatsAppMessageLog[] {
  const keys = Object.keys(cache);
  if (!keys.length) return logs;
  return logs.map((log) => {
    const entry = cache[log.id];
    if (!entry) return log;
    const known = log.deliveryCheckedAt ?? '';
    if (known && known > entry.checkedAt) return log;
    return {
      ...log,
      deliveryState: entry.state,
      deliveryNote: entry.note ?? log.deliveryNote,
      providerReportId: entry.reportId || log.providerReportId,
      deliveryCheckedAt: entry.checkedAt,
      status: entry.state === 'failed' ? 'failed' : log.status,
    };
  });
}

/** Teslim kontrolü sonuçlarını yerel günlüğe işle (delivery-check) */
export function patchWhatsAppLogs(
  patches: {
    id: string;
    deliveryState?: WhatsAppDeliveryState;
    providerReportId?: string;
    note?: string;
    status?: WhatsAppMessageStatus;
  }[],
) {
  if (!patches.length) return;
  const byId = new Map(patches.filter((p) => p.id).map((p) => [p.id, p]));
  if (!byId.size) return;
  const checkedAt = new Date().toISOString();
  let changed = false;
  const next = loadWhatsAppLogs().map((log) => {
    const p = byId.get(log.id);
    if (!p) return log;
    changed = true;
    return {
      ...log,
      deliveryCheckedAt: checkedAt,
      ...(p.deliveryState ? { deliveryState: p.deliveryState } : {}),
      ...(p.providerReportId ? { providerReportId: p.providerReportId } : {}),
      ...(p.note ? { deliveryNote: p.note } : {}),
      ...(p.status ? { status: p.status } : {}),
    };
  });
  if (changed) saveJson(LOGS_KEY, next.slice(0, MAX_LOGS));
}

export function whatsAppStats(logs: WhatsAppMessageLog[]) {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const weekAgo = new Date(now.getTime() - 7 * 86400000).toISOString();
  const monthAgo = new Date(now.getTime() - 30 * 86400000).toISOString();
  let todayCount = 0;
  let weekCount = 0;
  let monthCount = 0;
  let success = 0;
  let failed = 0;
  for (const log of logs) {
    const t = log.createdAt;
    if (t.startsWith(today)) todayCount += 1;
    if (t >= weekAgo) weekCount += 1;
    if (t >= monthAgo) monthCount += 1;
    if (log.status === 'sent' || log.status === 'manual') success += 1;
    else if (log.status === 'failed') failed += 1;
  }
  return {
    today: todayCount,
    week: weekCount,
    month: monthCount,
    success,
    failed,
    total: logs.length,
  };
}
