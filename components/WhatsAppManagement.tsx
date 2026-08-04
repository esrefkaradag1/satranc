import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  MessageCircle, Send, Users, FileText, Settings, QrCode, Home, Phone,
  UserCheck, BookOpen, Trash2, Plus, Pencil, Check, X, Loader2, RefreshCw,
  KeyRound, Image, Contact,
} from 'lucide-react';
import { useApp } from '../AppContext';
import { canShowStudentCounts } from '../lib/studentCountVisibility';
import type { Student, WhatsAppContactGroup, WhatsAppProvider, WhatsAppTemplate } from '../types';
import {
  loadWhatsAppConfig, saveWhatsAppConfig, loadWhatsAppTemplates, saveWhatsAppTemplates,
  loadWhatsAppAutoRules, saveWhatsAppAutoRules, loadWhatsAppLogs, loadWhatsAppContactGroups,
  saveWhatsAppContactGroups, whatsAppStats, DEFAULT_WHATSAPP_CONFIG,
} from '../lib/whatsappStorage';
import { renderWhatsAppTemplate, buildStudentTemplateVars } from '../lib/whatsappTemplates';
import { primaryParentPhone } from '../lib/whatsappPhones';
import { isValidWhatsAppPhone } from '../lib/whatsappUtils';
import {
  fetchWhatsAppStatus, fetchWhatsAppQr, fetchWhatsAppDevices, fetchWhatsAppPairCode,
  waitWhatsAppDeviceLogin,
  sendWhatsAppBulk, sendParentLoginBulk,
} from '../services/whatsappClient';
import { studentsInTrainingGroup } from '../lib/trainingGroupUtils';
import { normalizeClubKey } from '../lib/clubScope';

type View =
  | 'home' | 'manual' | 'bulk' | 'groups' | 'templates' | 'api' | 'auto'
  | 'parent-login' | 'contacts' | 'qr';

const MODULE_TILES: { id: View; title: string; desc: string; icon: React.ReactNode; color: string }[] = [
  { id: 'manual', title: 'Manuel Mesaj', desc: 'Özel numara listesine mesaj gönder', icon: <Send className="w-7 h-7" />, color: 'from-blue-500/20 to-indigo-500/10 border-blue-500/30' },
  { id: 'bulk', title: 'Bireysel / Toplu Mesaj', desc: 'Öğrenci seçerek toplu mesaj', icon: <Users className="w-7 h-7" />, color: 'from-violet-500/20 to-purple-500/10 border-violet-500/30' },
  { id: 'groups', title: 'Gruplara Mesaj', desc: 'Branş ve grup seçerek gönder', icon: <BookOpen className="w-7 h-7" />, color: 'from-emerald-500/20 to-teal-500/10 border-emerald-500/30' },
  { id: 'templates', title: 'Mesaj Şablonları', desc: 'Kayıtlı mesaj formatları', icon: <FileText className="w-7 h-7" />, color: 'from-amber-500/20 to-orange-500/10 border-amber-500/30' },
  { id: 'api', title: 'API Ayarları', desc: 'WaMessage API anahtarı ve cihaz', icon: <KeyRound className="w-7 h-7" />, color: 'from-slate-500/20 to-slate-600/10 border-slate-500/30' },
  { id: 'parent-login', title: 'Veli Giriş Bilgileri', desc: 'Toplu veli giriş bilgisi gönder', icon: <UserCheck className="w-7 h-7" />, color: 'from-rose-500/20 to-pink-500/10 border-rose-500/30' },
  { id: 'contacts', title: 'Telefon Rehberi', desc: 'İletişim grupları yönet', icon: <Contact className="w-7 h-7" />, color: 'from-cyan-500/20 to-sky-500/10 border-cyan-500/30' },
  { id: 'auto', title: 'Otomatik Mesajlar', desc: 'Ders başlangıcı, kayıt vb.', icon: <MessageCircle className="w-7 h-7" />, color: 'from-green-500/20 to-emerald-500/10 border-green-500/30' },
];

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
  const [contactGroups, setContactGroups] = useState(loadWhatsAppContactGroups);
  const [logs, setLogs] = useState(loadWhatsAppLogs);
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

  const stats = useMemo(() => whatsAppStats(logs), [logs]);
  const officeStudents = useMemo(
    () => students.filter((s) => !branchOffice || normalizeClubKey(s.branchOffice ?? '') === normalizeClubKey(branchOffice)),
    [students, branchOffice],
  );

  const persistConfig = useCallback((next: typeof config) => {
    setConfig(next);
    saveWhatsAppConfig(next);
  }, []);

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
          showToast(errKey, 'warning');
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
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-8">
      {/* Header */}
      <div className="rounded-2xl overflow-hidden border border-emerald-500/20 bg-gradient-to-br from-emerald-600/30 via-green-600/20 to-teal-700/10">
        <div className="p-6 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-white flex items-center gap-3">
                <MessageCircle className="w-8 h-8 text-emerald-300" />
                WhatsApp Yönetimi
              </h1>
              <p className="text-emerald-100/80 text-sm mt-1">Mesajlarınızı kolayca yönetin ve takip edin</p>
              <p className="text-white/90 text-sm font-bold mt-2">{displayName} | {branchOffice || 'Tüm şubeler'}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setView('home')} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-bold">
                <Home className="w-4 h-4" /> Anasayfa
              </button>
              <button type="button" onClick={loadQr} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-bold">
                <QrCode className="w-4 h-4" /> QR Okut
              </button>
              <button type="button" onClick={() => setView('auto')} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-bold">
                <MessageCircle className="w-4 h-4" /> Otomatik Mesajlar
              </button>
              <button type="button" onClick={() => setView('api')} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500/30 hover:bg-amber-500/40 text-white text-xs font-bold">
                <Settings className="w-4 h-4" /> API Ayarla
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <label className="text-xs font-bold text-emerald-200 uppercase">Şube</label>
            <select
              value={branchOffice}
              onChange={(e) => setBranchOffice(e.target.value)}
              className="px-3 py-2 rounded-lg bg-black/20 border border-white/10 text-white text-sm min-w-[12rem]"
            >
              <option value="">Tüm şubeler</option>
              {branchOffices.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
            <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold ${apiStatus.connected ? 'bg-emerald-500/20 text-emerald-200' : 'bg-rose-500/20 text-rose-200'}`}>
              <span className={`w-2 h-2 rounded-full ${apiStatus.connected ? 'bg-emerald-400' : 'bg-rose-400'}`} />
              {apiStatus.provider === 'evolution' ? 'Evolution' : 'WaMessage'}: {statusLoading ? '...' : apiStatus.connected ? 'Aktif' : 'Pasif'}
              <button type="button" onClick={() => void refreshStatus()} className="ml-1 p-0.5 hover:bg-white/10 rounded">
                <RefreshCw className={`w-3 h-3 ${statusLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
            {apiStatus.error ? (
              <span className="text-[11px] text-amber-200/90 max-w-md truncate" title={apiStatus.error}>{apiStatus.error}</span>
            ) : null}
            {!config.enabled ? (
              <span className="text-[11px] text-rose-200 font-bold">Otomatik gönderim KAPALI</span>
            ) : null}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Bugün', value: stats.today },
          { label: 'Bu Hafta', value: stats.week },
          { label: 'Bu Ay', value: stats.month },
          { label: 'Başarılı', value: stats.success, color: 'text-emerald-400' },
          { label: 'Hatalı', value: stats.failed, color: 'text-rose-400' },
          { label: 'Toplam', value: stats.total },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-white/5 bg-slate-900/60 p-4 text-center">
            <div className={`text-2xl font-black ${s.color ?? 'text-white'}`}>{s.value.toLocaleString('tr-TR')}</div>
            <div className="text-[10px] font-bold text-slate-500 uppercase mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {view === 'home' && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {MODULE_TILES.map((tile) => (
            <button
              key={tile.id}
              type="button"
              onClick={() => setView(tile.id)}
              className={`text-left p-5 rounded-xl border bg-gradient-to-br ${tile.color} hover:brightness-110 transition-all active:scale-[0.98]`}
            >
              <div className="text-emerald-300 mb-3">{tile.icon}</div>
              <div className="font-black text-white text-sm">{tile.title}</div>
              <div className="text-xs text-slate-400 mt-1">{tile.desc}</div>
            </button>
          ))}
        </div>
      )}

      {view !== 'home' && (
        <button type="button" onClick={() => setView('home')} className="text-sm text-slate-400 hover:text-white font-bold">
          ← Modül listesine dön
        </button>
      )}

      {/* Manual */}
      {view === 'manual' && (
        <Panel title="Manuel Mesaj">
          <textarea value={manualPhones} onChange={(e) => setManualPhones(e.target.value)} rows={3} placeholder="Telefon numaraları (her satıra bir numara)" className="input-field" />
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
        <Panel title="Mesaj Şablonları">
          <p className="text-xs text-slate-500 mb-3">
            Değişkenler: {'{{ogrenci_adi}}'}, {'{{veli_adi}}'}, {'{{kullanici_adi}}'}, {'{{sifre}}'}, {'{{veli_pin}}'}, {'{{ders_adi}}'}, {'{{ders_linki}}'}, {'{{form_linki}}'}, {'{{kulup_adi}}'}, {'{{grup}}'}, {'{{tarih}}'}, {'{{saat}}'}
          </p>
          <div className="space-y-3">
            {templates.map((t) => (
              <div key={t.id} className="rounded-lg border border-white/5 bg-slate-800/40 p-4">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="font-bold text-white">{t.name}</span>
                  <div className="flex gap-1">
                    <button type="button" onClick={() => setEditingTemplate(t)} className="p-1.5 rounded bg-amber-500/15 text-amber-400"><Pencil className="w-4 h-4" /></button>
                    <button
                      type="button"
                      onClick={() => {
                        const next = templates.map((x) => x.id === t.id ? { ...x, enabled: !x.enabled } : x);
                        setTemplates(next);
                        saveWhatsAppTemplates(next);
                      }}
                      className={`p-1.5 rounded ${t.enabled ? 'bg-emerald-500/15 text-emerald-400' : 'bg-slate-700 text-slate-500'}`}
                    >
                      {t.enabled ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <pre className="text-xs text-slate-400 whitespace-pre-wrap font-sans">{t.body}</pre>
              </div>
            ))}
          </div>
          {editingTemplate && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60" onClick={() => setEditingTemplate(null)}>
              <div className="bg-slate-900 border border-white/10 rounded-xl w-full max-w-lg p-6 space-y-3" onClick={(e) => e.stopPropagation()}>
                <h3 className="font-black text-white">{editingTemplate.name}</h3>
                <textarea
                  value={editingTemplate.body}
                  onChange={(e) => setEditingTemplate({ ...editingTemplate, body: e.target.value })}
                  rows={10}
                  className="input-field font-mono text-xs"
                />
                <button
                  type="button"
                  onClick={() => {
                    const next = templates.map((x) => x.id === editingTemplate.id ? editingTemplate : x);
                    setTemplates(next);
                    saveWhatsAppTemplates(next);
                    setEditingTemplate(null);
                    showToast('Şablon kaydedildi.', 'success');
                  }}
                  className="w-full py-2.5 rounded-lg bg-emerald-600 text-white font-bold text-sm"
                >
                  Kaydet
                </button>
              </div>
            </div>
          )}
        </Panel>
      )}

      {/* Auto rules */}
      {view === 'auto' && (
        <Panel title="Otomatik Mesajlar">
          <p className="text-sm text-slate-400 mb-4">Bu olaylar gerçekleştiğinde velilere otomatik WhatsApp bildirimi gönderilir (API aktifse).</p>
          {autoRules.map((rule) => (
            <label key={rule.event} className="flex items-center justify-between gap-4 p-4 rounded-lg border border-white/5 bg-slate-800/30 cursor-pointer">
              <div>
                <div className="font-bold text-white text-sm">
                  {rule.event === 'parent_login' && 'Öğrenci kaydı — veli giriş bilgileri'}
                  {rule.event === 'parent_consent' && 'Öğrenci kaydı — veli form daveti'}
                  {rule.event === 'lesson_start' && 'Canlı ders başlangıcı'}
                  {rule.event === 'training_completed' && 'Antrenman tamamlandı — anında veli bildirimi'}
                  {rule.event === 'training_incomplete' && 'Antrenman eksik — her gün 21:00 veli bildirimi'}
                </div>
                <div className="text-xs text-slate-500">Şablon: {rule.templateKey}</div>
              </div>
              <input
                type="checkbox"
                checked={rule.enabled}
                onChange={(e) => {
                  const next = autoRules.map((r) => r.event === rule.event ? { ...r, enabled: e.target.checked } : r);
                  setAutoRules(next);
                  saveWhatsAppAutoRules(next);
                }}
                className="w-5 h-5"
              />
            </label>
          ))}
        </Panel>
      )}

      {/* API */}
      {view === 'api' && (
        <Panel title="API Ayarları — WaMessage (X-Api-Key)">
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-50 space-y-2">
            <p className="font-bold">Kişisel WP akışı (login/SMS yok)</p>
            <ol className="text-emerald-50/85 text-xs leading-relaxed list-decimal pl-4 space-y-1">
              <li>WaMessage → Api Entegrasyonu → <b>API Key Göster</b> → buraya yapıştırın.</li>
              <li>Gönderici telefonu kaydedin (<code className="text-emerald-100">905xxxxxxxxx</code>).</li>
              <li><b>QR Okut</b> → WhatsApp’tan 30 sn içinde okutun → <code className="text-emerald-100">reg_id</code> otomatik kaydolur.</li>
              <li>Gönderim: <code className="text-emerald-100">POST /api/whatsapp/v1/messages/send</code> (reg_id, to, message).</li>
            </ol>
            <p className="text-[11px] text-emerald-100/70">
              Panelde “bağlı” görünmesi yetmez; QR bu uygulamanın API Key oturumunda üretilmeli.
            </p>
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

          <label className="text-xs font-bold text-slate-400 uppercase">API Key (X-Api-Key)</label>
          <input
            value={config.apiKey}
            onChange={(e) => persistConfig({ ...config, apiKey: e.target.value.trim() })}
            type="password"
            placeholder="WaMessage → Api Entegrasyonu → API Key Göster"
            className="input-field"
          />

          <label className="text-xs font-bold text-slate-400 uppercase">Gönderici telefon</label>
          <input
            value={config.devicePhone || ''}
            onChange={(e) => persistConfig({ ...config, devicePhone: e.target.value.trim() })}
            placeholder="905059860303"
            className="input-field"
          />
          <p className="text-[11px] text-slate-500">QR ve device/check için 905… formatı (artı olmadan da olur).</p>

          <label className="text-xs font-bold text-slate-400 uppercase">
            {config.provider === 'evolution' ? 'Instance Adı' : 'reg_id (QR sonrası otomatik)'}
          </label>
          <input
            value={config.instanceName}
            onChange={(e) => persistConfig({ ...config, instanceName: e.target.value.trim() })}
            placeholder={config.provider === 'evolution' ? 'netchess' : 'QR sonrası dolar'}
            className="input-field"
          />

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

      <style>{`.input-field{width:100%;padding:.75rem 1rem;border-radius:.5rem;background:#1e293b;border:1px solid rgba(255,255,255,.1);color:#fff;font-size:.875rem;outline:none}.input-field:focus{border-color:rgba(16,185,129,.5)}`}</style>
    </div>
  );
};

const Panel: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="rounded-xl border border-white/5 bg-slate-900/60 p-6 space-y-4 max-w-2xl">
    <h2 className="text-lg font-black text-white">{title}</h2>
    {children}
  </div>
);

const SendBtn: React.FC<{ loading: boolean; onClick: () => void; label?: string }> = ({ loading, onClick, label }) => (
  <button type="button" disabled={loading} onClick={onClick} className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-sm">
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

export default WhatsAppManagement;
