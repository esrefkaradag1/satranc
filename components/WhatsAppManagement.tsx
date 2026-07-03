import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  MessageCircle, Send, Users, FileText, Settings, QrCode, Home, Phone,
  UserCheck, BookOpen, Trash2, Plus, Pencil, Check, X, Loader2, RefreshCw,
  KeyRound, Image, Contact,
} from 'lucide-react';
import { useApp } from '../AppContext';
import type { Student, WhatsAppContactGroup, WhatsAppTemplate } from '../types';
import {
  loadWhatsAppConfig, saveWhatsAppConfig, loadWhatsAppTemplates, saveWhatsAppTemplates,
  loadWhatsAppAutoRules, saveWhatsAppAutoRules, loadWhatsAppLogs, loadWhatsAppContactGroups,
  saveWhatsAppContactGroups, whatsAppStats, DEFAULT_WHATSAPP_CONFIG,
} from '../lib/whatsappStorage';
import { renderWhatsAppTemplate, buildStudentTemplateVars } from '../lib/whatsappTemplates';
import { primaryParentPhone } from '../lib/whatsappPhones';
import { isValidWhatsAppPhone } from '../lib/whatsappUtils';
import {
  fetchWhatsAppStatus, fetchWhatsAppQr, sendWhatsAppBulk, sendParentLoginBulk,
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
  { id: 'api', title: 'API Ayarları', desc: 'WhatsApp API anahtarı ve bağlantı', icon: <KeyRound className="w-7 h-7" />, color: 'from-slate-500/20 to-slate-600/10 border-slate-500/30' },
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

  const [view, setView] = useState<View>('home');
  const [branchOffice, setBranchOffice] = useState(activeClubBranch || branchOffices[0] || '');
  const [config, setConfig] = useState(loadWhatsAppConfig);
  const [templates, setTemplates] = useState(loadWhatsAppTemplates);
  const [autoRules, setAutoRules] = useState(loadWhatsAppAutoRules);
  const [contactGroups, setContactGroups] = useState(loadWhatsAppContactGroups);
  const [logs, setLogs] = useState(loadWhatsAppLogs);
  const [apiStatus, setApiStatus] = useState<{ connected: boolean; state: string }>({ connected: false, state: 'pasif' });
  const [statusLoading, setStatusLoading] = useState(false);
  const [qrImage, setQrImage] = useState('');
  const [qrLoading, setQrLoading] = useState(false);

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

  const refreshStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const s = await fetchWhatsAppStatus();
      setApiStatus({ connected: s.connected, state: s.state });
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => { void refreshStatus(); }, [refreshStatus, config]);

  const persistConfig = (next: typeof config) => {
    setConfig(next);
    saveWhatsAppConfig(next);
  };

  const loadQr = async () => {
    setQrLoading(true);
    setView('qr');
    try {
      const img = await fetchWhatsAppQr();
      setQrImage(img);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'QR alınamadı. API ayarlarını kontrol edin.', 'warning');
      setQrImage('');
    } finally {
      setQrLoading(false);
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
      showToast(`${r.sent + r.manual} mesaj gönderildi (${r.failed} hata).`, r.failed ? 'warning' : 'success');
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
              API Durumu: {statusLoading ? '...' : apiStatus.connected ? 'Aktif' : 'Pasif'}
              <button type="button" onClick={() => void refreshStatus()} className="ml-1 p-0.5 hover:bg-white/10 rounded">
                <RefreshCw className={`w-3 h-3 ${statusLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
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
          <p className="text-xs text-slate-500 mb-2">Veli telefonu kayıtlı öğrencileri seçin ({officeStudents.length} öğrenci)</p>
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
        <Panel title="API Ayarları">
          <p className="text-sm text-slate-400">
            Evolution API veya uyumlu bir WhatsApp sunucusu bağlayın. Örnek: <code className="text-emerald-300">http://localhost:8080</code>
          </p>
          <label className="text-xs font-bold text-slate-400 uppercase">API Adresi</label>
          <input value={config.apiBaseUrl} onChange={(e) => persistConfig({ ...config, apiBaseUrl: e.target.value })} placeholder="https://wa-api.example.com" className="input-field" />
          <label className="text-xs font-bold text-slate-400 uppercase">API Anahtarı</label>
          <input value={config.apiKey} onChange={(e) => persistConfig({ ...config, apiKey: e.target.value })} type="password" className="input-field" />
          <label className="text-xs font-bold text-slate-400 uppercase">Instance Adı</label>
          <input value={config.instanceName} onChange={(e) => persistConfig({ ...config, instanceName: e.target.value })} className="input-field" />
          <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
            <input type="checkbox" checked={config.enabled} onChange={(e) => persistConfig({ ...config, enabled: e.target.checked })} />
            API ile otomatik gönderim aktif
          </label>
          <p className="text-xs text-slate-500">Kapalıyken mesajlar WhatsApp Web üzerinden manuel açılır.</p>
          <button type="button" onClick={() => { persistConfig({ ...DEFAULT_WHATSAPP_CONFIG }); showToast('Ayarlar sıfırlandı.', 'info'); }} className="text-xs text-rose-400 font-bold">Sıfırla</button>
        </Panel>
      )}

      {/* QR */}
      {view === 'qr' && (
        <Panel title="QR Kod ile Bağlan">
          {qrLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-emerald-400" /></div>
          ) : qrImage ? (
            <img src={qrImage} alt="WhatsApp QR" className="mx-auto max-w-xs rounded-xl border border-white/10" />
          ) : (
            <p className="text-slate-500 text-center py-8">QR yüklenemedi. API ayarlarını yapıp tekrar deneyin.</p>
          )}
          <button type="button" onClick={() => void loadQr()} className="mt-4 w-full py-2.5 rounded-lg bg-emerald-600 text-white font-bold text-sm">QR Yenile</button>
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
