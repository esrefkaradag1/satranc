import type {
  WhatsAppAutoRule,
  WhatsAppConfig,
  WhatsAppContactGroup,
  WhatsAppMessageLog,
  WhatsAppTemplate,
} from '../types';
import { DEFAULT_WHATSAPP_AUTO_RULES, DEFAULT_WHATSAPP_TEMPLATES } from './whatsappTemplates';

const CONFIG_KEY = 'netchess_whatsapp_config';
const TEMPLATES_KEY = 'netchess_whatsapp_templates';
const LOGS_KEY = 'netchess_whatsapp_logs';
const RULES_KEY = 'netchess_whatsapp_auto_rules';
const GROUPS_KEY = 'netchess_whatsapp_contact_groups';
const MAX_LOGS = 2000;

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
  apiBaseUrl: '',
  apiKey: '',
  instanceName: 'netchess',
  enabled: false,
};

export function loadWhatsAppConfig(): WhatsAppConfig {
  return { ...DEFAULT_WHATSAPP_CONFIG, ...loadJson<Partial<WhatsAppConfig>>(CONFIG_KEY, {}) };
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
