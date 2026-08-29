import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  MessageCircle, Send, Users, FileText, Settings, QrCode, Home, Phone,
  UserCheck, BookOpen, Trash2, Plus, Pencil, Check, X, Loader2, RefreshCw,
  KeyRound, Image, Contact,
} from 'lucide-react';
import { useApp } from '../AppContext';
import { canShowStudentCounts } from '../lib/studentCountVisibility';
import type { Student, WhatsAppContactGroup, WhatsAppMessageLog, WhatsAppProvider, WhatsAppTemplate } from '../types';
import {
  loadWhatsAppConfig, saveWhatsAppConfig, loadWhatsAppTemplates, saveWhatsAppTemplates,
  loadWhatsAppAutoRules, saveWhatsAppAutoRules, loadWhatsAppLogs, loadWhatsAppContactGroups,
  saveWhatsAppContactGroups, whatsAppStats, mergeWhatsAppLogs, DEFAULT_WHATSAPP_CONFIG,
} from '../lib/whatsappStorage';
import { renderWhatsAppTemplate, buildStudentTemplateVars, createCustomWhatsAppTemplate, isSystemWhatsAppTemplate } from '../lib/whatsappTemplates';
import { primaryParentPhone } from '../lib/whatsappPhones';
import { isValidWhatsAppPhone, resolveWhatsAppLogParties } from '../lib/whatsappUtils';
import {
  fetchWhatsAppStatus, fetchWhatsAppQr, fetchWhatsAppDevices, fetchWhatsAppPairCode,
  waitWhatsAppDeviceLogin,
  sendWhatsAppBulk, sendParentLoginBulk,
  fetchWhatsAppServerSettings, saveWhatsAppServerSettings, fetchWhatsAppServerLogs,
} from '../services/whatsappClient';
import { studentsInTrainingGroup } from '../lib/trainingGroupUtils';
import { normalizeClubKey } from '../lib/clubScope';
import {
  CHANNEL_LABELS,
  NOTIFICATION_EVENT_META,
  NOTIFICATION_EVENTS,
  channelUsesWhatsApp,
  type NotificationChannel,
  type NotificationDeliveryRule,
  type NotificationEvent,
} from '../lib/notificationEvents';
import {
  defaultDeliveryRules,
  deliveryRulesFromWhatsAppAuto,
  loadNotificationDeliveryRules,
  saveNotificationDeliveryRules,
  syncWhatsAppAutoRulesFromDelivery,
} from '../lib/notificationRouting';

type View =
  | 'home' | 'manual' | 'bulk' | 'groups' | 'templates' | 'api' | 'auto'
  | 'parent-login' | 'contacts' | 'qr' | 'logs';

const MODULE_TILES: { id: View; title: string; desc: string; icon: React.ReactNode }[] = [
  { id: 'manual', title: 'Manuel Mesaj', desc: 'Numara listesine özel mesaj', icon: <Send className="w-5 h-5" /> },
  { id: 'bulk', title: 'Bireysel / Toplu', desc: 'Öğrenci seçerek toplu gönder', icon: <Users className="w-5 h-5" /> },
  { id: 'groups', title: 'Gruplara Mesaj', desc: 'Branş ve gruba gönder', icon: <BookOpen className="w-5 h-5" /> },
  { id: 'templates', title: 'Mesaj Şablonları', desc: 'Hazır metinleri yönet', icon: <FileText className="w-5 h-5" /> },
  { id: 'logs', title: 'Gönderim Geçmişi', desc: 'Son mesajlar, hata ve durum', icon: <Phone className="w-5 h-5" /> },
  { id: 'api', title: 'API Ayarları', desc: 'WaMessage anahtar ve cihaz', icon: <KeyRound className="w-5 h-5" /> },
  { id: 'parent-login', title: 'Veli Giriş Bilgileri', desc: 'Toplu veli hesap bilgisi', icon: <UserCheck className="w-5 h-5" /> },
  { id: 'contacts', title: 'Telefon Rehberi', desc: 'İletişim grupları', icon: <Contact className="w-5 h-5" /> },
  { id: 'auto', title: 'Bildirim Kanalları', desc: 'WhatsApp / veli paneli yönlendirme', icon: <MessageCircle className="w-5 h-5" /> },
];

const TEMPLATE_VARS = [
  'ogrenci_adi', 'veli_adi', 'kullanici_adi', 'sifre', 'veli_pin',
  'ders_adi', 'ders_linki', 'form_linki', 'kulup_adi', 'grup', 'tarih', 'saat',
  'bulmaca_hedef', 'mac_hedef', 'bulmaca_sayisi', 'mac_sayisi', 'antrenman_adi',
];

const TEMPLATE_KEY_LABELS: Record<string, string> = {
  parent_login: 'Veli giriş',
  parent_consent: 'Veli formu',
  lesson_start: 'Canlı ders',
  training_completed: 'Antrenman tamam',
  training_partial: 'Antrenman kısmi',
  training_incomplete: 'Antrenman eksik',
};

function templateKeyLabel(key?: string): string {
  if (!key) return '—';
  return TEMPLATE_KEY_LABELS[key] ?? key;
}

function statusLabel(status: WhatsAppMessageLog['status']): string {
  if (status === 'sent') return 'Gönderildi';
  if (status === 'manual') return 'Manuel';
  if (status === 'failed') return 'Hata';
  if (status === 'queued') return 'Kuyrukta';
  return status;
}

function statusTone(status: WhatsAppMessageLog['status']): string {
  if (status === 'sent') return 'text-[#25D366] bg-[#25D366]/10 border-[#25D366]/25';
  if (status === 'manual') return 'text-amber-200 bg-amber-500/10 border-amber-500/25';
  if (status === 'failed') return 'text-rose-300 bg-rose-500/10 border-rose-500/25';
  return 'text-slate-300 bg-slate-700/40 border-white/10';
}

const WhatsAppManagement: React.FC = () => {
  const {
    scopedStudents: students,
    scopedTrainingGroups: trainingGroups,
    branchOffices,
    activeClubBranch,
    auth,
    showToast,
  } = useApp();
  const showStudentCounts = canShowStudentCounts(auth);

  const [view, setView] = useState<View>('home');
  const [branchOffice, setBranchOffice] = useState(activeClubBranch || branchOffices[0] || '');
  const [config, setConfig] = useState(loadWhatsAppConfig);
  const [templates, setTemplates] = useState(loadWhatsAppTemplates);
  const [autoRules, setAutoRules] = useState(loadWhatsAppAutoRules);
  const [deliveryRules, setDeliveryRules] = useState<NotificationDeliveryRule[]>(loadNotificationDeliveryRules);
  const [contactGroups, setContactGroups] = useState(loadWhatsAppContactGroups);
  const [logs, setLogs] = useState(loadWhatsAppLogs);
  const [serverLogs, setServerLogs] = useState<WhatsAppMessageLog[]>([]);
  const [serverLogsLoading, setServerLogsLoading] = useState(false);
  const [serverSyncNote, setServerSyncNote] = useState('');
  const [apiStatus, setApiStatus] = useState<{
    connected: boolean;
    state: string;
    provider?: string;
    regId?: string;
    devices?: { regId: string; phone: string; connected: boolean }[];
    error?: string;
  }>({ connected: false, state: 'pasif' });
  const [statusLoading, setStatusLoading] = useState(false);
  const [qrImage, setQrImage] = useState('');
  const [qrLoading, setQrLoading] = useState(false);
  const [qrWaiting, setQrWaiting] = useState(false);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [pairCodeBusy, setPairCodeBusy] = useState(false);
  const [pairCode, setPairCode] = useState('');
  const lastStatusErrorRef = React.useRef('');

  const [manualPhones, setManualPhones] = useState('');
  const [manualMessage, setManualMessage] = useState('');
  const [bulkMessage, setBulkMessage] = useState('');
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [groupBranch, setGroupBranch] = useState('');
  const [groupName, setGroupName] = useState('');
  const [groupMessage, setGroupMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<WhatsAppTemplate | null>(null);
  const [newContactName, setNewContactName] = useState('');
  const [newContactPhones, setNewContactPhones] = useState('');

  const stats = useMemo(() => {
    const merged = mergeWhatsAppLogs(serverLogs, logs, 2000);
    return whatsAppStats(merged);
  }, [logs, serverLogs]);

  const mergedLogs = useMemo(() => {
    const merged = mergeWhatsAppLogs(serverLogs, logs, 2000);
    if (!branchOffice) return merged;
    const officeKey = normalizeClubKey(branchOffice);
    return merged.filter((log) => {
      if (!log.branchOffice) return true;
      return normalizeClubKey(log.branchOffice) === officeKey;
    });
  }, [logs, serverLogs, branchOffice]);
  const officeStudents = useMemo(
    () => students.filter((s) => !branchOffice || normalizeClubKey(s.branchOffice ?? '') === normalizeClubKey(branchOffice)),
    [students, branchOffice],
  );

  const persistConfig = useCallback((next: typeof config) => {
    setConfig(next);
    saveWhatsAppConfig(next);
    void saveWhatsAppServerSettings({ config: next }).then((r) => {
      if (!r.ok && r.error) setServerSyncNote(r.error);
      else setServerSyncNote('Sunucu ayarları güncellendi');
    });
  }, []);

  const persistTemplates = useCallback((next: WhatsAppTemplate[]) => {
    setTemplates(next);
    saveWhatsAppTemplates(next);
    void saveWhatsAppServerSettings({ templates: next }).then((r) => {
      if (r.ok) showToast('Şablonlar sunucuya kaydedildi (otomatik mesajlar bunları kullanır).', 'success');
      else if (r.error) showToast(`Yerel kaydedildi; sunucu: ${r.error}`, 'warning');
    });
  }, [showToast]);

  const persistAutoRules = useCallback((next: typeof autoRules) => {
    setAutoRules(next);
    saveWhatsAppAutoRules(next);
    void saveWhatsAppServerSettings({
      rules: next.map((r) => ({ event: r.event, enabled: r.enabled, templateKey: r.templateKey })),
    }).then((r) => {
      if (r.ok) showToast('Otomatik kurallar sunucuya kaydedildi.', 'success');
      else if (r.error) showToast(`Yerel kaydedildi; sunucu: ${r.error}`, 'warning');
    });
  }, [showToast]);

  const persistDeliveryRules = useCallback((next: NotificationDeliveryRule[]) => {
    setDeliveryRules(next);
    saveNotificationDeliveryRules(next);
    const syncedAuto = syncWhatsAppAutoRulesFromDelivery(next, loadWhatsAppAutoRules());
    setAutoRules(syncedAuto);
    saveWhatsAppAutoRules(syncedAuto);
    void saveWhatsAppServerSettings({
      deliveryRules: next.map((r) => ({ event: r.event, channel: r.channel })),
      rules: syncedAuto.map((r) => ({ event: r.event, enabled: r.enabled, templateKey: r.templateKey })),
    }).then((r) => {
      if (r.ok) showToast('Bildirim kanalları kaydedildi.', 'success');
      else if (r.error) showToast(`Yerel kaydedildi; sunucu: ${r.error}`, 'warning');
    });
  }, [showToast]);

  const refreshServerLogs = useCallback(async () => {
    setServerLogsLoading(true);
    try {
      const rows = await fetchWhatsAppServerLogs(500);
      setServerLogs(rows);
      setLogs(loadWhatsAppLogs());
    } finally {
      setServerLogsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (view !== 'home' && view !== 'logs') return;
    setLogs(loadWhatsAppLogs());
    void refreshServerLogs();
  }, [view, refreshServerLogs]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const remote = await fetchWhatsAppServerSettings();
      if (cancelled || !remote) return;
      setServerSyncNote(
        remote.scheduler
          ? `Otomatik antrenman: tamamlanınca anında · kısmi/yapılmadı her gün ${remote.scheduler.eveningHourTr}:00 TR`
          : 'Sunucu ayarları yüklendi',
      );
      if (remote.templates.length > 0) {
        setTemplates((prev) => {
          const byKey = new Map(prev.map((t) => [t.key, t]));
          for (const t of remote.templates) {
            const existing = byKey.get(t.key as WhatsAppTemplate['key']);
            if (existing) {
              byKey.set(t.key, { ...existing, body: t.body || existing.body, enabled: t.enabled });
            } else {
              byKey.set(t.key, {
                id: `tpl-server-${t.key}`,
                key: t.key,
                name: t.key,
                body: t.body,
                enabled: t.enabled,
              });
            }
          }
          const merged = [...byKey.values()];
          saveWhatsAppTemplates(merged);
          return merged;
        });
      }
      if (remote.rules.length > 0) {
        setAutoRules((prev) => {
          const byEvent = new Map(prev.map((r) => [r.event, r]));
          for (const r of remote.rules) {
            const existing = byEvent.get(r.event as typeof prev[number]['event']);
            if (existing) byEvent.set(r.event, { ...existing, enabled: r.enabled });
            else {
              byEvent.set(r.event as typeof prev[number]['event'], {
                event: r.event as typeof prev[number]['event'],
                enabled: r.enabled,
                templateKey: r.event as typeof prev[number]['templateKey'],
              });
            }
          }
          const merged = [...byEvent.values()];
          saveWhatsAppAutoRules(merged);
          return merged;
        });
      }
      if (remote.deliveryRules && remote.deliveryRules.length > 0) {
        const mapped = NOTIFICATION_EVENTS.map((event) => {
          const row = remote.deliveryRules!.find((r) => r.event === event);
          return {
            event,
            channel: (row?.channel ?? 'whatsapp') as NotificationChannel,
          };
        });
        setDeliveryRules(mapped);
        saveNotificationDeliveryRules(mapped);
      } else if (remote.rules.length > 0) {
        const derived = deliveryRulesFromWhatsAppAuto(
          remote.rules.map((r) => ({
            event: r.event as NotificationEvent,
            enabled: r.enabled,
            templateKey: r.event,
          })),
        );
        setDeliveryRules(derived);
        saveNotificationDeliveryRules(derived);
      }
      if (remote.config) {
        setConfig((prev) => {
          const next = {
            ...prev,
            apiBaseUrl: remote.config.apiBaseUrl || prev.apiBaseUrl,
            instanceName: remote.config.instanceName || prev.instanceName,
            enabled: remote.config.enabled,
            // Maskeli key'i ezme
            apiKey: remote.config.apiKeySet && remote.config.apiKey.includes('…')
              ? prev.apiKey
              : (remote.config.apiKey || prev.apiKey),
          };
          saveWhatsAppConfig(next);
          return next;
        });
      }
      void refreshServerLogs();
    })();
    return () => { cancelled = true; };
  }, [refreshServerLogs]);

  const refreshStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const s = await fetchWhatsAppStatus();
      setApiStatus({
        connected: s.connected,
        state: s.state,
        provider: s.provider,
        regId: s.regId,
        devices: s.devices,
        error: s.error,
      });
      const errKey = s.error || '';
      if (errKey && !s.connected && errKey !== lastStatusErrorRef.current) {
        // Sadece yeni hatalarda toast; QR beklerken spam olmasın
        if (!/cihaz_yok|api_key_yok|bağlı cihaz yok/i.test(errKey)) {
          const short = errKey.length > 220 ? `${errKey.slice(0, 220)}…` : errKey;
          showToast(short, 'warning');
        }
      }
      lastStatusErrorRef.current = errKey;
    } finally {
      setStatusLoading(false);
    }
  }, [showToast]);

  const refreshDevices = useCallback(async () => {
    setDevicesLoading(true);
    try {
      const devices = await fetchWhatsAppDevices();
      setApiStatus((prev) => ({ ...prev, devices }));
      setConfig((prev) => {
        if (devices.length === 1 && !prev.instanceName) {
          const next = {
            ...prev,
            instanceName: devices[0].regId,
            devicePhone: devices[0].phone || prev.devicePhone,
          };
          saveWhatsAppConfig(next);
          return next;
        }
        return prev;
      });
      if (!devices.length) {
        showToast('API Key altında cihaz yok. QR Okut ile bağlayın.', 'warning');
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Cihaz listesi alınamadı', 'warning');
    } finally {
      setDevicesLoading(false);
    }
  }, [showToast]);

  useEffect(() => { void refreshStatus(); }, [
    refreshStatus,
    config.apiKey,
    config.instanceName,
    config.provider,
    config.apiBaseUrl,
    config.enabled,
  ]);

  const loadQr = async () => {
    if (!config.apiKey?.trim()) {
      showToast('Önce API Key kaydedin.', 'warning');
      setView('api');
      return;
    }
    if (!config.devicePhone?.trim()) {
      showToast('Gönderici telefonu girin (905xxxxxxxxx).', 'warning');
      setView('api');
      return;
    }
    setQrLoading(true);
    setQrWaiting(false);
    setView('qr');
    setQrImage('');
    try {
      const res = await fetchWhatsAppQr(config.devicePhone);
      setQrImage(res.base64 || '');
      if (res.regId) {
        persistConfig({
          ...config,
          instanceName: res.regId,
          devicePhone: res.phone || config.devicePhone,
          enabled: true,
        });
      }
      showToast('QR hazır — 30 sn içinde WhatsApp’tan okutun.', 'success');
      // Paralel: device/check (~30 sn bekleyebilir)
      if (res.regId) {
        setQrWaiting(true);
        try {
          const check = await waitWhatsAppDeviceLogin(res.regId, res.phone || config.devicePhone || '');
          if (check.ok) {
            showToast('Cihaz bağlandı.', 'success');
            await refreshStatus();
            await refreshDevices();
          } else {
            showToast('Henüz bağlanmadı — QR’ı okutup “Durumu yenile”yin.', 'warning');
          }
        } catch (e) {
          showToast(e instanceof Error ? e.message : 'Cihaz kontrolü zaman aşımı — QR okutup yenileyin.', 'warning');
        } finally {
          setQrWaiting(false);
        }
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'QR alınamadı. API Key ve telefonu kontrol edin.', 'warning');
      setQrImage('');
    } finally {
      setQrLoading(false);
    }
  };

  const requestPairCode = async () => {
    if (!config.apiKey || !config.devicePhone) {
      showToast('API Key ve gönderici telefon gerekli.', 'warning');
      return;
    }
    setPairCodeBusy(true);
    try {
      const r = await fetchWhatsAppPairCode(config.devicePhone);
      setPairCode(r.code || '');
      if (r.regId) persistConfig({ ...config, instanceName: r.regId, enabled: true });
      showToast(r.code ? `Bağlama kodu: ${r.code}` : 'Kod alındı — WhatsApp’a yazın.', 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Kod alınamadı', 'error');
    } finally {
      setPairCodeBusy(false);
    }
  };

  const handleManualSend = async () => {
    const phones = manualPhones.split(/[\n,;]+/).map((p) => p.trim()).filter(Boolean);
    if (!phones.length || !manualMessage.trim()) {
      showToast('Numara ve mesaj girin.', 'warning');
      return;
    }
    setSending(true);
    try {
      const recipients = phones.map((phone) => ({ phone, message: manualMessage.trim() }));
      const r = await sendWhatsAppBulk(recipients, { branchOffice });
      setLogs(loadWhatsAppLogs());
      if (!config.enabled) {
        showToast('Otomatik gönderim kapalı — API Ayarlarından açın (WaMessage).', 'warning');
      } else if (r.sent > 0) {
        showToast(`${r.sent} mesaj API ile gönderildi${r.failed ? ` (${r.failed} hata)` : ''}.`, r.failed ? 'warning' : 'success');
      } else if (r.manual > 0) {
        showToast(`${r.manual} mesaj manuel açıldı (API kullanılmadı).`, 'warning');
      } else {
        showToast(r.error || `Gönderilemedi (${r.failed} hata). API Key, reg_id ve krediyi kontrol edin.`, 'error');
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Gönderim hatası', 'error');
    } finally {
      setSending(false);
    }
  };

  const handleBulkSend = async () => {
    if (!bulkMessage.trim() || selectedStudentIds.length === 0) {
      showToast('Öğrenci seçin ve mesaj yazın.', 'warning');
      return;
    }
    setSending(true);
    try {
      const recipients: { phone: string; message: string; studentId: string; studentName: string }[] = [];
      for (const id of selectedStudentIds) {
        const s = students.find((x) => x.id === id);
        if (!s) continue;
        const phone = primaryParentPhone(s);
        if (!phone) continue;
        recipients.push({ phone, message: bulkMessage.trim(), studentId: s.id, studentName: s.name });
      }
      const r = await sendWhatsAppBulk(recipients, { branchOffice });
      setLogs(loadWhatsAppLogs());
      showToast(`${r.sent + r.manual} veliye mesaj iletildi.`, 'success');
    } finally {
      setSending(false);
    }
  };

  const handleGroupSend = async () => {
    if (!groupName || !groupMessage.trim()) {
      showToast('Grup ve mesaj seçin.', 'warning');
      return;
    }
    const tg = trainingGroups.find(
      (g) => g.name === groupName && (!groupBranch || g.discipline === groupBranch),
    );
    const groupStudents = tg ? studentsInTrainingGroup(students, tg) : students.filter((s) => s.group === groupName);
    setSending(true);
    try {
      const recipients = groupStudents
        .map((s) => {
          const phone = primaryParentPhone(s);
          return phone ? { phone, message: groupMessage.trim(), studentId: s.id, studentName: s.name } : null;
        })
        .filter(Boolean) as { phone: string; message: string; studentId: string; studentName: string }[];
      const r = await sendWhatsAppBulk(recipients, { branchOffice });
      setLogs(loadWhatsAppLogs());
      showToast(`${r.sent + r.manual} veliye grup mesajı gönderildi.`, 'success');
    } finally {
      setSending(false);
    }
  };

  const handleParentLoginBulk = async () => {
    setSending(true);
    try {
      const r = await sendParentLoginBulk(officeStudents, branchOffice);
      setLogs(loadWhatsAppLogs());
      showToast(`${r.sent + r.manual} veli giriş bilgisi gönderildi.`, 'success');
    } finally {
      setSending(false);
    }
  };

  const groupOptions = useMemo(() => {
    const names = new Set<string>();
    for (const g of trainingGroups) {
      if (branchOffice && normalizeClubKey(g.branchOffice) !== normalizeClubKey(branchOffice)) continue;
      if (groupBranch && g.discipline !== groupBranch) continue;
      names.add(g.name);
    }
    return [...names].sort();
  }, [trainingGroups, branchOffice, groupBranch]);

  const disciplineOptions = useMemo(() => {
    const names = new Set<string>();
    for (const g of trainingGroups) {
      if (branchOffice && normalizeClubKey(g.branchOffice) !== normalizeClubKey(branchOffice)) continue;
      if (g.discipline) names.add(g.discipline);
    }
    return [...names].sort();
  }, [trainingGroups, branchOffice]);

  const displayName = auth?.role === 'club' ? auth.branch : 'Yönetim';

  return (
    <div className="space-y-5 animate-in fade-in duration-300 pb-10">
      {/* Header */}
      <header className="relative overflow-hidden rounded-2xl border border-[#25D366]/25 bg-[#0b141a]">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage:
              'radial-gradient(ellipse 80% 60% at 10% -10%, rgba(37,211,102,0.35), transparent 55%), radial-gradient(ellipse 50% 40% at 90% 0%, rgba(18,140,126,0.25), transparent 50%)',
          }}
        />
        <div className="relative p-5 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#25D366]/30 bg-[#25D366]/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#25D366]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#25D366]" />
                WhatsApp
              </div>
              <h1 className="mt-3 text-2xl sm:text-3xl font-black tracking-tight text-white">
                WhatsApp Yönetimi
              </h1>
              <p className="mt-1 text-sm text-slate-400">Mesaj, şablon ve cihaz bağlantısını buradan yönetin</p>
              <p className="mt-2 text-sm font-semibold text-slate-200 truncate">{displayName}</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {([
                { id: 'home' as View, label: 'Anasayfa', icon: <Home className="w-3.5 h-3.5" /> },
                { id: 'qr' as View, label: 'QR Okut', icon: <QrCode className="w-3.5 h-3.5" />, onClick: () => void loadQr() },
                { id: 'auto' as View, label: 'Otomatik', icon: <MessageCircle className="w-3.5 h-3.5" /> },
                { id: 'api' as View, label: 'API', icon: <Settings className="w-3.5 h-3.5" />, accent: true },
              ]).map((b) => (
                <button
                  key={b.label}
                  type="button"
                  onClick={() => (b.onClick ? b.onClick() : setView(b.id))}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition ${
                    b.accent || view === b.id
                      ? 'bg-[#25D366] text-[#0b141a] hover:bg-[#20bd5a]'
                      : 'bg-white/5 text-slate-200 hover:bg-white/10 border border-white/10'
                  }`}
                >
                  {b.icon}
                  {b.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/25 px-3 py-2">
              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Şube</span>
              <select
                value={branchOffice}
                onChange={(e) => setBranchOffice(e.target.value)}
                className="bg-transparent text-sm text-white outline-none min-w-[10rem]"
              >
                <option value="">Tüm şubeler</option>
                {branchOffices.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold ${
              apiStatus.connected
                ? 'border-[#25D366]/40 bg-[#25D366]/10 text-[#25D366]'
                : 'border-rose-500/30 bg-rose-500/10 text-rose-300'
            }`}>
              <span className={`h-2 w-2 rounded-full ${apiStatus.connected ? 'bg-[#25D366] animate-pulse' : 'bg-rose-400'}`} />
              {apiStatus.provider === 'evolution' ? 'Evolution' : 'WaMessage'}: {statusLoading ? '…' : apiStatus.connected ? 'Aktif' : 'Pasif'}
              <button type="button" onClick={() => void refreshStatus()} className="rounded p-0.5 hover:bg-white/10" aria-label="Durumu yenile">
                <RefreshCw className={`w-3 h-3 ${statusLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
            {!config.enabled ? (
              <span className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] font-bold text-amber-200">
                Otomatik gönderim kapalı
              </span>
            ) : null}
          </div>
          {apiStatus.error ? (
            <p className="mt-3 text-[11px] text-amber-200/90 line-clamp-2" title={apiStatus.error}>{apiStatus.error}</p>
          ) : null}
        </div>
      </header>

      {/* Stats */}
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
        {[
          { label: 'Bugün', value: stats.today },
          { label: 'Bu hafta', value: stats.week },
          { label: 'Bu ay', value: stats.month },
          { label: 'Başarılı', value: stats.success, tone: 'ok' as const },
          { label: 'Hatalı', value: stats.failed, tone: 'bad' as const },
          { label: 'Toplam', value: stats.total },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-white/[0.06] bg-slate-900/70 px-3 py-3 sm:px-4 sm:py-3.5 text-center"
          >
            <div className={`text-xl sm:text-2xl font-black tabular-nums ${
              s.tone === 'ok' ? 'text-[#25D366]' : s.tone === 'bad' ? 'text-rose-400' : 'text-white'
            }`}>
              {s.value.toLocaleString('tr-TR')}
            </div>
            <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">{s.label}</div>
          </div>
        ))}
      </div>

      {view === 'home' && (
        <>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {MODULE_TILES.map((tile) => (
            <button
              key={tile.id}
              type="button"
              onClick={() => setView(tile.id)}
              className="group text-left rounded-2xl border border-white/[0.07] bg-slate-900/60 p-4 hover:border-[#25D366]/40 hover:bg-slate-900 transition-all active:scale-[0.99]"
            >
              <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#25D366]/15 text-[#25D366] group-hover:bg-[#25D366]/25">
                {tile.icon}
              </div>
              <div className="font-bold text-white text-sm">{tile.title}</div>
              <div className="mt-1 text-xs text-slate-500 leading-snug">{tile.desc}</div>
            </button>
          ))}
        </div>

        <WhatsAppMessageFeed
          logs={mergedLogs}
          students={students}
          loading={serverLogsLoading}
          onRefresh={() => void refreshServerLogs()}
          onOpenAll={() => setView('logs')}
        />
        </>
      )}

      {view !== 'home' && (
        <button
          type="button"
          onClick={() => setView('home')}
          className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-[#25D366] font-semibold transition"
        >
          ← Modüllere dön
        </button>
      )}

      {/* Manual */}
      {view === 'manual' && (
        <Panel title="Manuel Mesaj">
          <textarea value={manualPhones} onChange={(e) => setManualPhones(e.target.value)} rows={3} placeholder="Telefon numaraları (her satıra bir numara)" className="input-field" />
          <select
            className="input-field"
            defaultValue=""
            onChange={(e) => {
              const tpl = templates.find((t) => t.id === e.target.value);
              if (tpl) setManualMessage(tpl.body);
              e.target.value = '';
            }}
          >
            <option value="">Şablondan yükle…</option>
            {templates.filter((t) => t.enabled).map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <textarea value={manualMessage} onChange={(e) => setManualMessage(e.target.value)} rows={6} placeholder="Mesajınız..." className="input-field" />
          <SendBtn loading={sending} onClick={() => void handleManualSend()} />
        </Panel>
      )}

      {/* Bulk */}
      {view === 'bulk' && (
        <Panel title="Bireysel / Toplu Mesaj">
          <p className="text-xs text-slate-500 mb-2">
            Veli telefonu kayıtlı öğrencileri seçin{showStudentCounts ? ` (${officeStudents.length} öğrenci)` : ''}
          </p>
          <div className="max-h-48 overflow-y-auto space-y-1 border border-white/5 rounded-lg p-2">
            {officeStudents.map((s) => (
              <label key={s.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-white/5 cursor-pointer text-sm">
                <input
                  type="checkbox"
                  checked={selectedStudentIds.includes(s.id)}
                  onChange={() => setSelectedStudentIds((prev) => prev.includes(s.id) ? prev.filter((x) => x !== s.id) : [...prev, s.id])}
                />
                <span className="text-white font-medium">{s.name}</span>
                <span className="text-slate-500 text-xs">{primaryParentPhone(s) || 'telefon yok'}</span>
              </label>
            ))}
          </div>
          <select
            className="input-field"
            defaultValue=""
            onChange={(e) => {
              const tpl = templates.find((t) => t.id === e.target.value);
              if (tpl) setBulkMessage(tpl.body);
              e.target.value = '';
            }}
          >
            <option value="">Şablondan yükle…</option>
            {templates.filter((t) => t.enabled).map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <textarea value={bulkMessage} onChange={(e) => setBulkMessage(e.target.value)} rows={5} placeholder="Mesaj..." className="input-field" />
          <SendBtn loading={sending} onClick={() => void handleBulkSend()} label={`${selectedStudentIds.length} veliye gönder`} />
        </Panel>
      )}

      {/* Groups */}
      {view === 'groups' && (
        <Panel title="Gruplara Mesaj">
          <select value={groupBranch} onChange={(e) => setGroupBranch(e.target.value)} className="input-field">
            <option value="">Branş (tümü)</option>
            {disciplineOptions.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <select value={groupName} onChange={(e) => setGroupName(e.target.value)} className="input-field">
            <option value="">Grup seçin</option>
            {groupOptions.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
          <textarea value={groupMessage} onChange={(e) => setGroupMessage(e.target.value)} rows={5} className="input-field" placeholder="Grup mesajı..." />
          <SendBtn loading={sending} onClick={() => void handleGroupSend()} />
        </Panel>
      )}

      {/* Parent login */}
      {view === 'parent-login' && (
        <Panel title="Veli Giriş Bilgileri">
          <p className="text-sm text-slate-400">
            Seçili şubedeki tüm öğrencilerin velilerine giriş bilgileri şablonu ile mesaj gönderilir.
            API aktifse otomatik, değilse WhatsApp Web açılır.
          </p>
          <PreviewTemplate templates={templates} templateKey="parent_login" student={officeStudents[0]} />
          <SendBtn loading={sending} onClick={() => void handleParentLoginBulk()} label="Toplu veli giriş bilgisi gönder" />
        </Panel>
      )}

      {/* Templates */}
      {view === 'templates' && (
        <Panel
          title="Mesaj Şablonları"
          subtitle="Metinleri kaydedin; manuel ve toplu gönderimde şablondan yükleyin."
          wide
          action={(
            <button
              type="button"
              onClick={() => setEditingTemplate(createCustomWhatsAppTemplate({
                name: 'Yeni şablon',
                body: `Merhaba {{veli_adi}},

{{ogrenci_adi}} için bilgilendirme:

Mesajınızı buraya yazın.

{{kulup_adi}}`,
              }))}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#25D366] px-3.5 py-2 text-xs font-bold text-[#0b141a] hover:bg-[#20bd5a] transition"
            >
              <Plus className="w-4 h-4" />
              Yeni şablon
            </button>
          )}
        >
          <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">Kullanılabilir değişkenler</p>
            <div className="flex flex-wrap gap-1.5">
              {TEMPLATE_VARS.map((v) => (
                <code
                  key={v}
                  className="rounded-md border border-white/10 bg-slate-800/80 px-2 py-0.5 text-[11px] font-mono text-[#25D366]/90"
                >
                  {`{{${v}}}`}
                </code>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {templates.map((t) => (
              <article
                key={t.id}
                className={`flex flex-col rounded-2xl border p-4 transition ${
                  t.enabled
                    ? 'border-white/[0.07] bg-slate-800/40 hover:border-[#25D366]/30'
                    : 'border-white/[0.04] bg-slate-900/40 opacity-70'
                }`}
              >
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-bold text-white text-sm truncate">{t.name}</h3>
                      {!isSystemWhatsAppTemplate(t.key) && (
                        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-300">
                          Özel
                        </span>
                      )}
                      <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
                        t.enabled ? 'bg-[#25D366]/15 text-[#25D366]' : 'bg-slate-700 text-slate-400'
                      }`}>
                        {t.enabled ? 'Aktif' : 'Pasif'}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button type="button" onClick={() => setEditingTemplate({ ...t })} className="rounded-lg bg-white/5 p-1.5 text-slate-300 hover:bg-white/10 hover:text-white" title="Düzenle">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const next = templates.map((x) => x.id === t.id ? { ...x, enabled: !x.enabled } : x);
                        persistTemplates(next);
                      }}
                      className={`rounded-lg p-1.5 ${t.enabled ? 'bg-[#25D366]/15 text-[#25D366]' : 'bg-slate-700 text-slate-400'}`}
                      title={t.enabled ? 'Pasifleştir' : 'Aktifleştir'}
                    >
                      {t.enabled ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                    </button>
                    {!isSystemWhatsAppTemplate(t.key) && (
                      <button
                        type="button"
                        onClick={() => {
                          if (!window.confirm(`“${t.name}” şablonunu silmek istiyor musunuz?`)) return;
                          const next = templates.filter((x) => x.id !== t.id);
                          persistTemplates(next);
                        }}
                        className="rounded-lg bg-rose-500/10 p-1.5 text-rose-400 hover:bg-rose-500/20"
                        title="Sil"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                <pre className="flex-1 whitespace-pre-wrap font-sans text-xs leading-relaxed text-slate-400 line-clamp-6">
                  {t.body}
                </pre>
              </article>
            ))}
          </div>

          {editingTemplate && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#0b141a]/80 backdrop-blur-sm" onClick={() => setEditingTemplate(null)}>
              <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-slate-900 shadow-2xl shadow-black/40 p-5 sm:p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-lg font-black text-white">
                    {templates.some((x) => x.id === editingTemplate.id) ? 'Şablonu düzenle' : 'Yeni şablon'}
                  </h3>
                  <button type="button" onClick={() => setEditingTemplate(null)} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/5 hover:text-white">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Şablon adı</label>
                  <input
                    value={editingTemplate.name}
                    onChange={(e) => setEditingTemplate({ ...editingTemplate, name: e.target.value })}
                    className="input-field"
                    placeholder="Örn. Turnuva daveti"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Mesaj</label>
                  <textarea
                    value={editingTemplate.body}
                    onChange={(e) => setEditingTemplate({ ...editingTemplate, body: e.target.value })}
                    rows={10}
                    className="input-field font-mono text-xs leading-relaxed"
                  />
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setEditingTemplate(null)}
                    className="flex-1 rounded-xl border border-white/10 py-2.5 text-sm font-bold text-slate-300 hover:bg-white/5"
                  >
                    İptal
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const name = editingTemplate.name.trim();
                      const body = editingTemplate.body.trim();
                      if (!name || !body) {
                        showToast('Şablon adı ve mesaj zorunlu.', 'warning');
                        return;
                      }
                      const exists = templates.some((x) => x.id === editingTemplate.id);
                      const next = exists
                        ? templates.map((x) => (x.id === editingTemplate.id ? { ...editingTemplate, name, body } : x))
                        : [...templates, { ...editingTemplate, name, body }];
                      persistTemplates(next);
                      setEditingTemplate(null);
                    }}
                    className="flex-1 rounded-xl bg-[#25D366] py-2.5 text-sm font-bold text-[#0b141a] hover:bg-[#20bd5a]"
                  >
                    Kaydet
                  </button>
                </div>
              </div>
            </div>
          )}
        </Panel>
      )}

      {/* Bildirim kanalları */}
      {view === 'auto' && (
        <Panel title="Bildirim Kanalları">
          <p className="text-sm text-slate-400 mb-2">
            Her olay için bildirimin nereye gideceğini seçin: WhatsApp, veli paneli bildirim ekranı, ikisi birden veya kapalı.
          </p>
          {serverSyncNote ? (
            <p className="text-[11px] text-emerald-300/90 mb-4">{serverSyncNote}</p>
          ) : null}
          <div className="mb-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => persistDeliveryRules(defaultDeliveryRules())}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-white/10 bg-slate-800/50 text-slate-300 hover:border-indigo-500/30"
            >
              Varsayılanlara dön
            </button>
          </div>
          {(['kayit', 'ders', 'antrenman'] as const).map((category) => {
            const events = NOTIFICATION_EVENTS.filter((e) => NOTIFICATION_EVENT_META[e].category === category);
            const categoryLabel = category === 'kayit' ? 'Kayıt' : category === 'ders' ? 'Ders' : 'Antrenman';
            return (
              <div key={category} className="mb-6">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">{categoryLabel}</h3>
                <div className="space-y-2">
                  {events.map((event) => {
                    const meta = NOTIFICATION_EVENT_META[event];
                    const rule = deliveryRules.find((r) => r.event === event);
                    const channel = rule?.channel ?? 'whatsapp';
                    const autoRule = autoRules.find((r) => r.event === event);
                    return (
                      <div
                        key={event}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-lg border border-white/5 bg-slate-800/30"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-white text-sm">{meta.label}</div>
                          <div className="text-xs text-slate-500 mt-0.5">{meta.description}</div>
                          {channelUsesWhatsApp(channel) && autoRule ? (
                            <div className="text-[10px] text-slate-600 mt-1">WhatsApp şablonu: {autoRule.templateKey}</div>
                          ) : null}
                        </div>
                        <select
                          value={channel}
                          onChange={(e) => {
                            const nextChannel = e.target.value as NotificationChannel;
                            const next = deliveryRules.map((r) =>
                              r.event === event ? { ...r, channel: nextChannel } : r,
                            );
                            persistDeliveryRules(next);
                          }}
                          className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white min-w-[11rem] shrink-0"
                        >
                          {(Object.keys(CHANNEL_LABELS) as NotificationChannel[]).map((ch) => (
                            <option key={ch} value={ch}>{CHANNEL_LABELS[ch]}</option>
                          ))}
                        </select>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          <p className="text-[11px] text-slate-500 border-t border-white/5 pt-4">
            Antrenman bildirimleri sunucu zamanlayıcısı ile çalışır. Şablon metinleri için Mesaj Şablonları bölümünü kullanın.
          </p>
        </Panel>
      )}

      {view === 'logs' && (
        <WhatsAppMessageFeed
          logs={mergedLogs}
          students={students}
          loading={serverLogsLoading}
          onRefresh={() => void refreshServerLogs()}
          showAll
        />
      )}

      {/* API */}
      {view === 'api' && (
        <Panel title="API Ayarları — WaMessage">
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-50 space-y-2">
            <p className="font-bold">Kişisel WP — kurulum</p>
            <ol className="text-emerald-50/85 text-xs leading-relaxed list-decimal pl-4 space-y-1">
              <li>WaMessage → <a className="underline" href="https://app.wamessage.app/apiIntegration" target="_blank" rel="noreferrer">Api Entegrasyonu</a> → <b>API Key Göster</b> → SMS’teki anahtarı buraya yapıştırın.</li>
              <li>Gönderici telefon: <code className="text-emerald-100">+905xxxxxxxxx</code></li>
              <li>WaMessage → <b>WhatsApp Hesaplarım</b> → Aktif satırdaki <code className="text-emerald-100">REG_ID</code>’yi kopyalayıp aşağıdaki alana yapıştırın (QR şart değil).</li>
              <li>Gönderim: <code className="text-emerald-100">POST /bulk/wp/nton</code></li>
            </ol>
          </div>

          {apiStatus.connected ? (
            <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
              Bağlı · reg_id: {apiStatus.regId || config.instanceName || '—'} · {apiStatus.state}
            </div>
          ) : config.apiKey ? (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
              {apiStatus.error || 'Cihaz yok — QR Okut ile bağlayın.'}
            </div>
          ) : null}

          <label className="text-xs font-bold text-slate-400 uppercase">Sağlayıcı</label>
          <select
            value={config.provider || 'wamessage'}
            onChange={(e) => {
              const provider = e.target.value as WhatsAppProvider;
              persistConfig({
                ...config,
                provider,
                apiBaseUrl: provider === 'wamessage'
                  ? (config.apiBaseUrl?.includes('toplusms') ? config.apiBaseUrl : 'https://api.toplusms.app')
                  : (config.apiBaseUrl?.includes('toplusms') ? '' : config.apiBaseUrl),
              });
            }}
            className="input-field"
          >
            <option value="wamessage">WaMessage (önerilen)</option>
            <option value="evolution">Evolution API (eski)</option>
          </select>

          <label className="text-xs font-bold text-slate-400 uppercase">API Adresi</label>
          <input
            value={config.apiBaseUrl}
            onChange={(e) => persistConfig({ ...config, apiBaseUrl: e.target.value })}
            placeholder="https://api.toplusms.app"
            className="input-field"
          />

          <label className="text-xs font-bold text-slate-400 uppercase">API Key</label>
          <input
            type="password"
            value={config.apiKey || ''}
            onChange={(e) => persistConfig({ ...config, apiKey: e.target.value.trim(), authMode: undefined })}
            placeholder="WaMessage → Api Entegrasyonu → API Key Göster"
            className="input-field font-mono text-sm"
            autoComplete="off"
          />

          <label className="text-xs font-bold text-slate-400 uppercase">Gönderici telefon (+90…)</label>
          <input
            type="text"
            value={config.devicePhone || ''}
            onChange={(e) => persistConfig({ ...config, devicePhone: e.target.value.trim() })}
            placeholder="+905059860303"
            className="input-field font-mono text-sm"
          />
          <p className="text-[11px] text-slate-500">QR ve device/check için +905… (artısız 905… da kabul edilir).</p>

          <label className="text-xs font-bold text-slate-400 uppercase">
            {config.provider === 'evolution' ? 'Instance Adı' : 'REG_ID (WhatsApp Hesaplarım)'}
          </label>
          <input
            value={config.instanceName}
            onChange={(e) => persistConfig({ ...config, instanceName: e.target.value.trim() })}
            placeholder={config.provider === 'evolution' ? 'netchess' : 'ör. 704346159'}
            className="input-field font-mono"
          />
          <p className="text-[11px] text-amber-200/80">
            Panelde Aktif cihazın REG_ID’sini yapıştırın. Eski/yanlış reg_id (ör. QR denemesinden kalan) 401 veya cihaz yok hatası verir.
          </p>

          {(config.provider || 'wamessage') === 'wamessage' && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void loadQr()}
                disabled={!config.apiKey || !config.devicePhone}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-600 disabled:opacity-40 text-white text-xs font-bold"
              >
                <QrCode className="w-3.5 h-3.5" />
                QR ile bağla
              </button>
              <button
                type="button"
                onClick={() => void requestPairCode()}
                disabled={pairCodeBusy || !config.apiKey || !config.devicePhone}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-indigo-600 disabled:opacity-40 text-white text-xs font-bold"
              >
                {pairCodeBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Phone className="w-3.5 h-3.5" />}
                Telefon kodu
              </button>
              <button
                type="button"
                onClick={() => void refreshDevices()}
                disabled={!config.apiKey || devicesLoading}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-700 disabled:opacity-40 text-white text-xs font-bold"
              >
                {devicesLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                Cihazları Listele
              </button>
              <button
                type="button"
                disabled={statusLoading}
                onClick={() => void refreshStatus()}
                className="inline-flex items-center gap-1.5 text-xs text-slate-200 font-bold px-2 py-1 rounded border border-white/10"
              >
                {statusLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                Durumu yenile
              </button>
            </div>
          )}

          {pairCode ? (
            <div className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-2 text-sm text-indigo-100 font-mono">
              Bağlama kodu: {pairCode}
            </div>
          ) : null}

          {(apiStatus.devices?.length ?? 0) > 0 && (
            <div className="space-y-1 rounded-lg border border-white/5 bg-slate-800/40 p-3">
              <p className="text-[10px] font-bold text-slate-500 uppercase">API Key altındaki cihazlar</p>
              {apiStatus.devices!.map((d) => (
                <button
                  key={d.regId || d.phone}
                  type="button"
                  onClick={() => persistConfig({
                    ...config,
                    instanceName: d.regId,
                    devicePhone: d.phone || config.devicePhone,
                  })}
                  className={`w-full text-left px-3 py-2 rounded text-xs font-medium ${
                    config.instanceName === d.regId
                      ? 'bg-emerald-500/20 text-emerald-200'
                      : 'bg-white/5 text-slate-300 hover:bg-white/10'
                  }`}
                >
                  {d.phone || '—'} · reg_id: {d.regId || '—'} · {d.connected ? 'bağlı' : 'pasif'}
                </button>
              ))}
            </div>
          )}

          <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
            <input type="checkbox" checked={config.enabled} onChange={(e) => persistConfig({ ...config, enabled: e.target.checked })} />
            API ile otomatik gönderim aktif
          </label>
          <p className="text-xs text-slate-500">API Key + reg_id tanımlıyken mesajlar WaMessage üzerinden gider; tarayıcıda WhatsApp linki açılmaz. Otomatik gönderim kapalıysa hata gösterilir.</p>
          <button type="button" onClick={() => { persistConfig({ ...DEFAULT_WHATSAPP_CONFIG }); showToast('Ayarlar sıfırlandı.', 'info'); }} className="text-xs text-rose-400 font-bold">Sıfırla</button>
        </Panel>
      )}

      {/* QR */}
      {view === 'qr' && (
        <Panel title="QR Kod ile Bağlan">
          <p className="text-xs text-slate-400 mb-3">
            WhatsApp → Bağlı Cihazlar → Cihaz Bağla. QR bu API Key oturumuna aittir.
            {config.instanceName ? ` · reg_id: ${config.instanceName}` : ''}
          </p>
          {qrLoading && !qrImage ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
              <span className="text-xs text-slate-400">QR üretiliyor…</span>
            </div>
          ) : qrImage ? (
            <img src={qrImage} alt="WhatsApp QR" className="mx-auto max-w-xs rounded-xl border border-white/10 bg-white p-3" />
          ) : (
            <p className="text-slate-500 text-center py-8">QR yüklenemedi. API Key ve gönderici telefonu kontrol edin.</p>
          )}
          {qrWaiting ? (
            <p className="mt-3 text-center text-xs text-amber-200 flex items-center justify-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Okutulması bekleniyor (device/check, ~30 sn)…
            </p>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => void loadQr()} className="flex-1 py-2.5 rounded-lg bg-emerald-600 text-white font-bold text-sm">
              QR Yenile
            </button>
            <button type="button" onClick={() => void refreshStatus()} className="px-4 py-2.5 rounded-lg bg-slate-700 text-white font-bold text-sm">
              Durumu yenile
            </button>
          </div>
        </Panel>
      )}

      {/* Contacts */}
      {view === 'contacts' && (
        <Panel title="Telefon Rehberi">
          <div className="space-y-2 mb-4">
            {contactGroups.map((g) => (
              <div key={g.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-800/40 border border-white/5">
                <div>
                  <div className="font-bold text-white text-sm">{g.name}</div>
                  <div className="text-xs text-slate-500">{g.phones.length} numara</div>
                </div>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => void sendWhatsAppBulk(g.phones.map((phone) => ({ phone, message: 'Merhaba,' })), { branchOffice })}
                    className="p-2 rounded bg-emerald-500/15 text-emerald-400"
                    title="Mesaj gönder"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const next = contactGroups.filter((x) => x.id !== g.id);
                      setContactGroups(next);
                      saveWhatsAppContactGroups(next);
                    }}
                    className="p-2 rounded bg-rose-500/15 text-rose-400"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <input value={newContactName} onChange={(e) => setNewContactName(e.target.value)} placeholder="Grup adı" className="input-field" />
          <textarea value={newContactPhones} onChange={(e) => setNewContactPhones(e.target.value)} placeholder="Numaralar (satır satır)" rows={3} className="input-field" />
          <button
            type="button"
            onClick={() => {
              const phones = newContactPhones.split(/[\n,;]+/).map((p) => p.trim()).filter((p) => isValidWhatsAppPhone(p));
              if (!newContactName.trim() || !phones.length) {
                showToast('Grup adı ve geçerli numara girin.', 'warning');
                return;
              }
              const g: WhatsAppContactGroup = { id: Math.random().toString(36).slice(2, 9), name: newContactName.trim(), phones, branchOffice };
              const next = [...contactGroups, g];
              setContactGroups(next);
              saveWhatsAppContactGroups(next);
              setNewContactName('');
              setNewContactPhones('');
              showToast('Rehber grubu eklendi.', 'success');
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-bold"
          >
            <Plus className="w-4 h-4" /> Grup Ekle
          </button>
        </Panel>
      )}

      <style>{`
        .input-field{
          width:100%;
          padding:.75rem 1rem;
          border-radius:.75rem;
          background:rgba(15,23,42,.85);
          border:1px solid rgba(255,255,255,.08);
          color:#fff;
          font-size:.875rem;
          outline:none;
          transition:border-color .15s ease;
        }
        .input-field:focus{border-color:rgba(37,211,102,.45)}
      `}</style>
    </div>
  );
};

const Panel: React.FC<{
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  wide?: boolean;
  fullWidth?: boolean;
}> = ({ title, subtitle, children, action, wide, fullWidth }) => (
  <section className={`rounded-2xl border border-white/[0.07] bg-slate-900/70 p-5 sm:p-6 space-y-4 ${
    fullWidth ? 'w-full max-w-none' : wide ? 'max-w-5xl' : 'max-w-2xl'
  }`}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-lg font-black tracking-tight text-white">{title}</h2>
        {subtitle ? <p className="mt-1 text-xs text-slate-500">{subtitle}</p> : null}
      </div>
      {action}
    </div>
    {children}
  </section>
);

const SendBtn: React.FC<{ loading: boolean; onClick: () => void; label?: string }> = ({ loading, onClick, label }) => (
  <button
    type="button"
    disabled={loading}
    onClick={onClick}
    className="inline-flex items-center gap-2 rounded-xl bg-[#25D366] px-5 py-3 text-sm font-bold text-[#0b141a] hover:bg-[#20bd5a] disabled:opacity-50 transition"
  >
    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
    {label ?? 'Gönder'}
  </button>
);

const PreviewTemplate: React.FC<{ templates: WhatsAppTemplate[]; templateKey: WhatsAppTemplate['key']; student?: Student }> = ({ templates, templateKey, student }) => {
  const tpl = templates.find((t) => t.key === templateKey);
  if (!tpl || !student) return null;
  const preview = renderWhatsAppTemplate(tpl.body, buildStudentTemplateVars(student));
  return <pre className="text-xs text-slate-400 bg-slate-800/50 rounded-lg p-3 whitespace-pre-wrap">{preview}</pre>;
};

const WhatsAppMessageFeed: React.FC<{
  logs: WhatsAppMessageLog[];
  students?: Student[];
  loading?: boolean;
  onRefresh?: () => void;
  onOpenAll?: () => void;
  showAll?: boolean;
}> = ({ logs, students = [], loading, onRefresh, onOpenAll, showAll }) => {
  const displayLogs = showAll ? logs : logs.slice(0, 100);

  return (
    <section className="w-full rounded-2xl border border-white/[0.07] bg-slate-900/70 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3 sm:px-5">
        <div>
          <h2 className="text-sm sm:text-base font-black text-white">Giden mesajlar</h2>
          <p className="mt-0.5 text-[11px] text-slate-500">
            Veliye giden mesajlar — hitap edilen veli ve ilgili öğrenci ayrı gösterilir
          </p>
        </div>
        <div className="flex items-center gap-2">
          {onOpenAll ? (
            <button
              type="button"
              onClick={onOpenAll}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-[11px] font-bold text-slate-300 hover:bg-white/5"
            >
              Tümünü gör
            </button>
          ) : null}
          {onRefresh ? (
            <button
              type="button"
              onClick={onRefresh}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-[11px] font-bold text-slate-300 hover:bg-white/5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Yenile
            </button>
          ) : null}
        </div>
      </div>

      {displayLogs.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-slate-500">
          {loading ? 'Mesajlar yükleniyor…' : 'Henüz kayıt yok. Mesaj gönderince veya otomatik bildirim çalışınca burada görünür.'}
        </p>
      ) : (
        <div className={`w-full overflow-auto custom-scrollbar ${showAll ? 'max-h-[min(70vh,42rem)]' : 'max-h-[min(60vh,36rem)]'}`}>
          <table className="w-full min-w-[960px] text-left text-xs">
            <thead className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur border-b border-white/[0.06]">
              <tr className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2.5 font-bold w-[7.5rem]">Tarih</th>
                <th className="px-3 py-2.5 font-bold min-w-[9rem]">Veli (alıcı)</th>
                <th className="px-3 py-2.5 font-bold min-w-[9rem]">Öğrenci</th>
                <th className="px-3 py-2.5 font-bold w-[8.5rem]">Telefon</th>
                <th className="px-3 py-2.5 font-bold min-w-[14rem]">Mesaj</th>
                <th className="px-3 py-2.5 font-bold w-[6.5rem]">Tür</th>
                <th className="px-4 py-2.5 font-bold w-[6.5rem]">Durum</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {displayLogs.map((log) => {
                const parties = resolveWhatsAppLogParties(log, students);
                return (
                <tr key={log.id} className="hover:bg-white/[0.02] align-top">
                  <td className="px-4 py-2.5 whitespace-nowrap tabular-nums text-slate-400">
                    {log.createdAt
                      ? new Date(log.createdAt).toLocaleString('tr-TR', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="font-semibold text-white" title={parties.parentName}>
                      {parties.parentName}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-slate-200" title={parties.studentName}>
                      {parties.studentName}
                    </div>
                    {log.branchOffice ? (
                      <div className="text-[10px] text-slate-600 truncate max-w-[12rem]" title={log.branchOffice}>
                        {log.branchOffice}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-slate-400 whitespace-nowrap">{log.phone || '—'}</td>
                  <td className="px-3 py-2.5">
                    <p className="text-slate-300 line-clamp-3 whitespace-pre-wrap" title={log.message}>
                      {log.message || '—'}
                    </p>
                    {log.error ? (
                      <p className="mt-1 text-[10px] text-rose-300/90 line-clamp-1" title={log.error}>
                        {log.error}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">
                    {templateKeyLabel(log.templateKey)}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${statusTone(log.status)}`}>
                      {statusLabel(log.status)}
                    </span>
                  </td>
                </tr>
              );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!showAll && logs.length > 100 ? (
        <div className="border-t border-white/[0.06] px-4 py-2 text-center">
          <button
            type="button"
            onClick={onOpenAll}
            className="text-[11px] font-bold text-[#25D366] hover:underline"
          >
            +{logs.length - 100} kayıt daha — tüm geçmişi aç
          </button>
        </div>
      ) : null}
    </section>
  );
};

export default WhatsAppManagement;
