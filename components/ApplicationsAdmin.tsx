import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2, XCircle, Clock, Users, Search, Eye, Trash2, Share2, Copy, MessageCircle,
  FileText, PenLine, X, UserPlus, Loader2, Filter, Link2, QrCode, Send,
} from 'lucide-react';
import { isValidWhatsAppPhone, openWhatsAppSend } from '../lib/whatsappUtils';
import { useApp } from '../AppContext';
import type { ApplicationStatus, StudentApplication } from '../lib/applicationTypes';
import { KVKK_TEXT } from '../lib/applicationTypes';
import {
  deleteApplicationAsync,
  getApplicationFormUrl,
  loadApplicationsAsync,
  saveApplicationAsync,
  updateApplicationStatusAsync,
} from '../services/applicationStorage';
import { syncStudentRatingsFromExternal } from '../services/studentRatingsSync';
import { ResponsiveTable } from './ui/ResponsiveTable';

const STATUS_LABEL: Record<ApplicationStatus, string> = {
  pending: 'Beklemede',
  signed: 'İmzalandı',
  approved: 'Onaylandı',
  rejected: 'Reddedildi',
};

const STATUS_CLS: Record<ApplicationStatus, string> = {
  pending: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  signed: 'bg-violet-500/15 text-violet-400 border-violet-500/30',
  approved: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  rejected: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
};

const ApplicationsAdmin: React.FC = () => {
  const { addStudent, updateStudent, disciplines, students } = useApp();
  const [list, setList] = useState<StudentApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ApplicationStatus | 'all'>('all');
  const [detail, setDetail] = useState<StudentApplication | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareTab, setShareTab] = useState<'link' | 'whatsapp' | 'qr'>('whatsapp');
  const [whatsappPhone, setWhatsappPhone] = useState('');
  const [whatsappPhoneError, setWhatsappPhoneError] = useState('');
  const [actionId, setActionId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const formUrl = getApplicationFormUrl();

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await loadApplicationsAsync();
      setList(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const stats = useMemo(() => ({
    total: list.length,
    pending: list.filter((a) => a.status === 'pending').length,
    approved: list.filter((a) => a.status === 'approved').length,
    rejected: list.filter((a) => a.status === 'rejected').length,
  }), [list]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return list.filter((a) => {
      if (statusFilter !== 'all' && a.status !== statusFilter) return false;
      if (!q) return true;
      return (
        a.name.toLowerCase().includes(q) ||
        a.applicationNo.toLowerCase().includes(q) ||
        a.tcNo.includes(q) ||
        a.branchOffice.toLowerCase().includes(q)
      );
    });
  }, [list, search, statusFilter]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(formUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  const openShareModal = () => {
    setShareTab('whatsapp');
    setWhatsappPhone('');
    setWhatsappPhoneError('');
    setCopied(false);
    setShareOpen(true);
  };

  const applicationShareMessage = `Merhaba,\n\nSpor okulumuza başvuru formunu aşağıdaki linkten doldurabilirsiniz:\n${formUrl}\n\nTeşekkürler.`;

  const handleWhatsAppSend = () => {
    const trimmed = whatsappPhone.trim();
    if (!isValidWhatsAppPhone(trimmed)) {
      setWhatsappPhoneError('Geçerli bir numara girin (ör. 05551234567).');
      return;
    }
    setWhatsappPhoneError('');
    openWhatsAppSend(trimmed, applicationShareMessage);
    setShareOpen(false);
  };

  const handleStatus = async (id: string, status: ApplicationStatus) => {
    setActionId(id);
    try {
      const updated = await updateApplicationStatusAsync(id, status);
      if (updated) setList((prev) => prev.map((a) => (a.id === id ? updated : a)));
      if (detail?.id === id) setDetail(updated);
    } finally {
      setActionId(null);
    }
  };

  const handleApproveToStudent = async (app: StudentApplication) => {
    if (app.status === 'approved') return;
    const dup = students.some((s) => (s.tcNo ?? '') === app.tcNo);
    if (dup) {
      alert('Bu TC Kimlik No ile kayıtlı öğrenci zaten var.');
      return;
    }
    setActionId(app.id);
    try {
      const parentPhone = app.phones[0] || app.fatherPhone || app.motherPhone || '';
      const phoneDigits = parentPhone.replace(/\D/g, '');
      const newStudent = await addStudent({
        name: app.name,
        level: 'Başlangıç',
        elo: 0,
        ukd: 0,
        lastAttendance: new Date().toISOString().slice(0, 10),
        paymentStatus: 'Unpaid',
        group: app.group || 'A Grubu',
        parentName: app.fatherName || app.motherName || app.signatureName || 'Veli',
        parentPhone: phoneDigits,
        birthDate: app.birthDate,
        registrationDate: new Date().toISOString().slice(0, 10),
        tcNo: app.tcNo,
        lichessUsername: app.lichessUsername || undefined,
        chessComUsername: app.chessComUsername || undefined,
        school: app.school || undefined,
        teacher: app.teacher || undefined,
        notes: app.notes || undefined,
        healthInfo: app.healthInfo || undefined,
        branch: disciplines[0] || 'Satranç',
        branchOffice: app.branchOffice,
        fatherName: app.fatherName || undefined,
        fatherPhone: app.fatherPhone?.replace(/\D/g, '') || undefined,
        fatherJob: app.fatherJob || undefined,
        motherName: app.motherName || undefined,
        motherPhone: app.motherPhone?.replace(/\D/g, '') || undefined,
        motherJob: app.motherJob || undefined,
        address: app.address || undefined,
        contactNumbers: app.phones.length ? app.phones.map((p) => p.replace(/\D/g, '')).filter(Boolean) : undefined,
        photoUrl: app.photoDataUrl?.startsWith('http') ? app.photoDataUrl : undefined,
        status: 'active',
      });
      try {
        const sync = await syncStudentRatingsFromExternal(newStudent);
        if (Object.keys(sync.patch).length > 0) {
          await updateStudent(newStudent.id, sync.patch);
        }
      } catch {
        /* UKD/FIDE arka planda çekilemedi */
      }
      await saveApplicationAsync({
        ...app,
        studentId: newStudent.id,
        status: 'approved',
        updatedAt: new Date().toISOString(),
      });
      setList((prev) =>
        prev.map((a) =>
          a.id === app.id ? { ...a, studentId: newStudent.id, status: 'approved' as const } : a
        )
      );
      if (detail?.id === app.id) {
        setDetail({ ...app, studentId: newStudent.id, status: 'approved' });
      }
    } catch (err) {
      console.error('[Applications] approve failed:', err);
      alert('Öğrenci kaydı sırasında hata oluştu. Listede görünüyorsa Supabase şemasını güncelleyin (supabase_tables.sql).');
    } finally {
      setActionId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Bu başvuruyu silmek istediğinize emin misiniz?')) return;
    await deleteApplicationAsync(id);
    setList((prev) => prev.filter((a) => a.id !== id));
    if (detail?.id === id) setDetail(null);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight">Başvurular</h1>
          <p className="text-sm text-slate-400 mt-1">Online başvuru formlarını yönetin</p>
        </div>
        <button
          type="button"
          onClick={openShareModal}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold shadow-lg"
        >
          <Share2 className="w-4 h-4" /> Başvuru Formu Gönder
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Toplam', value: stats.total, icon: Users, cls: 'text-indigo-400' },
          { label: 'Beklemede', value: stats.pending, icon: Clock, cls: 'text-amber-400' },
          { label: 'Onaylı', value: stats.approved, icon: CheckCircle2, cls: 'text-emerald-400' },
          { label: 'Red', value: stats.rejected, icon: XCircle, cls: 'text-rose-400' },
        ].map(({ label, value, icon: Icon, cls }) => (
          <div key={label} className="rounded-xl border border-slate-700/50 bg-slate-800/40 p-4">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold text-slate-500 uppercase">{label}</p>
              <Icon className={`w-4 h-4 ${cls}`} />
            </div>
            <p className="text-2xl font-black text-white mt-1">{value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Ad, başvuru no, TC veya şube ara..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900/60 border border-slate-700/60 text-sm text-white placeholder:text-slate-500 outline-none focus:border-indigo-500/50"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-500 shrink-0" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as ApplicationStatus | 'all')}
            className="px-4 py-2.5 rounded-xl bg-slate-900/60 border border-slate-700/60 text-sm text-white outline-none"
          >
            <option value="all">Tüm durumlar</option>
            <option value="pending">Beklemede</option>
            <option value="approved">Onaylandı</option>
            <option value="rejected">Reddedildi</option>
          </select>
        </div>
      </div>

      <div className="rounded-xl border border-slate-700/50 overflow-hidden bg-slate-800/30">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-400 gap-2">
            <Loader2 className="w-5 h-5 animate-spin" /> Yükleniyor...
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-center py-16 text-slate-500 text-sm">Başvuru bulunamadı.</p>
        ) : (
          <ResponsiveTable minWidth={600}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/50 text-left text-[10px] font-bold uppercase text-slate-500">
                  <th className="px-4 py-3">No</th>
                  <th className="px-4 py-3">Öğrenci</th>
                  <th className="px-4 py-3 hidden md:table-cell">Şube</th>
                  <th className="px-4 py-3 hidden lg:table-cell">Tarih</th>
                  <th className="px-4 py-3">Durum</th>
                  <th className="px-4 py-3 text-right">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((app) => (
                  <tr key={app.id} className="border-b border-slate-700/30 hover:bg-slate-800/50">
                    <td data-label="No" className="px-4 py-3 font-mono text-xs text-indigo-400">{app.applicationNo}</td>
                    <td data-label="Öğrenci" className="px-4 py-3">
                      <p className="font-bold text-white">{app.name}</p>
                      <p className="text-xs text-slate-500">{app.tcNo}</p>
                    </td>
                    <td data-label="Şube" className="px-4 py-3 max-md:!flex hidden md:table-cell text-slate-400">{app.branchOffice}</td>
                    <td data-label="Tarih" className="px-4 py-3 max-md:!flex hidden lg:table-cell text-slate-500 text-xs">
                      {new Date(app.createdAt).toLocaleDateString('tr-TR')}
                    </td>
                    <td data-label="Durum" className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border ${STATUS_CLS[app.status]}`}>
                        {STATUS_LABEL[app.status]}
                      </span>
                    </td>
                    <td data-label="İşlem" className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button type="button" onClick={() => setDetail(app)} className="p-2 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white" title="Detay">
                          <Eye className="w-4 h-4" />
                        </button>
                        {app.status === 'pending' && (
                          <>
                            <button
                              type="button"
                              disabled={actionId === app.id}
                              onClick={() => handleApproveToStudent(app)}
                              className="p-2 rounded-lg hover:bg-emerald-500/20 text-emerald-400"
                              title="Onayla ve öğrenci ekle"
                            >
                              {actionId === app.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                            </button>
                            <button type="button" onClick={() => handleStatus(app.id, 'rejected')} className="p-2 rounded-lg hover:bg-rose-500/20 text-rose-400" title="Reddet">
                              <XCircle className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        <button type="button" onClick={() => handleDelete(app.id)} className="p-2 rounded-lg hover:bg-rose-500/20 text-slate-500 hover:text-rose-400" title="Sil">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ResponsiveTable>
        )}
      </div>

      {detail ? (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60" onClick={() => setDetail(null)}>
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-[#1e293b] border border-slate-600 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 flex items-center justify-between px-5 py-4 border-b border-slate-700 bg-[#1e293b] z-10">
              <div>
                <h2 className="text-lg font-black text-white">{detail.name}</h2>
                <p className="text-xs text-indigo-400 font-mono">{detail.applicationNo}</p>
              </div>
              <button type="button" onClick={() => setDetail(null)} className="p-2 rounded-lg hover:bg-slate-700 text-slate-400"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-5 text-sm">
              <div className="flex flex-wrap gap-4">
                {detail.photoDataUrl ? (
                  <img src={detail.photoDataUrl} alt="" className="w-24 h-24 rounded-xl object-cover border border-slate-600" />
                ) : null}
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 flex-1 min-w-[200px]">
                  <p><span className="text-slate-500">TC:</span> <span className="text-white">{detail.tcNo}</span></p>
                  <p><span className="text-slate-500">Doğum:</span> <span className="text-white">{detail.birthDate}</span></p>
                  <p><span className="text-slate-500">Şube:</span> <span className="text-white">{detail.branchOffice}</span></p>
                  <p><span className="text-slate-500">Grup:</span> <span className="text-white">{detail.group || '—'}</span></p>
                  <p><span className="text-slate-500">Okul:</span> <span className="text-white">{detail.school || '—'}</span></p>
                  <p><span className="text-slate-500">IP:</span> <span className="text-white font-mono text-xs">{detail.clientIp || '—'}</span></p>
                </div>
              </div>
              {detail.healthInfo ? (
                <div><p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Sağlık</p><p className="text-slate-300">{detail.healthInfo}</p></div>
              ) : null}
              <div className="grid sm:grid-cols-2 gap-4">
                <div><p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Baba</p><p className="text-white">{detail.fatherName || '—'}</p><p className="text-slate-400 text-xs">{detail.fatherPhone}</p></div>
                <div><p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Anne</p><p className="text-white">{detail.motherName || '—'}</p><p className="text-slate-400 text-xs">{detail.motherPhone}</p></div>
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase mb-1 flex items-center gap-1"><FileText className="w-3 h-3" /> KVKK</p>
                <p className="text-xs text-slate-400 whitespace-pre-wrap max-h-32 overflow-y-auto border border-slate-700 rounded-lg p-3">{KVKK_TEXT}</p>
                <p className="text-xs text-emerald-400 mt-1">Onay: {new Date(detail.kvkkAcceptedAt).toLocaleString('tr-TR')}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase mb-2 flex items-center gap-1"><PenLine className="w-3 h-3" /> İmza — {detail.signatureName}</p>
                {detail.signatureDataUrl ? (
                  <img src={detail.signatureDataUrl} alt="İmza" className="max-h-32 rounded-lg border border-slate-600 bg-white p-2" />
                ) : (
                  <p className="text-slate-500">İmza yok</p>
                )}
                <p className="text-xs text-slate-500 mt-1">{new Date(detail.signedAt).toLocaleString('tr-TR')}</p>
              </div>
              {detail.status === 'pending' ? (
                <div className="flex flex-wrap gap-2 pt-2">
                  <button
                    type="button"
                    disabled={actionId === detail.id}
                    onClick={() => handleApproveToStudent(detail)}
                    className="flex-1 min-w-[140px] py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm inline-flex items-center justify-center gap-2"
                  >
                    <UserPlus className="w-4 h-4" /> Onayla ve öğrenci ekle
                  </button>
                  <button type="button" onClick={() => handleStatus(detail.id, 'rejected')} className="px-4 py-2.5 rounded-xl border border-rose-500/50 text-rose-400 font-bold text-sm">
                    Reddet
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {shareOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={() => setShareOpen(false)}>
          <div className="w-full max-w-lg rounded-2xl bg-[#1e293b] border border-slate-600/80 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/80 bg-slate-800/50">
              <h3 className="text-base font-black text-white">Başvuru Formu Paylaş</h3>
              <button type="button" onClick={() => setShareOpen(false)} className="p-2 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex border-b border-slate-700/80">
              {([
                { id: 'link' as const, label: 'Link Kopyala', icon: Link2 },
                { id: 'whatsapp' as const, label: 'WhatsApp', icon: MessageCircle },
                { id: 'qr' as const, label: 'QR Code', icon: QrCode },
              ]).map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setShareTab(id)}
                  className={`flex-1 flex flex-col sm:flex-row items-center justify-center gap-1.5 px-2 py-3.5 text-xs sm:text-sm font-bold transition-colors ${
                    shareTab === id
                      ? 'text-indigo-400 border-b-2 border-indigo-500 bg-indigo-500/10'
                      : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="text-center leading-tight">{label}</span>
                </button>
              ))}
            </div>

            <div className="p-6 min-h-[180px]">
              {shareTab === 'link' && (
                <div className="space-y-4">
                  <p className="text-sm text-slate-400">Form linkini kopyalayıp paylaşın.</p>
                  <div className="flex gap-2">
                    <input
                      readOnly
                      value={formUrl}
                      className="flex-1 px-4 py-2.5 rounded-xl border border-slate-600 bg-slate-900/80 text-slate-200 text-sm font-mono"
                    />
                    <button
                      type="button"
                      onClick={copyLink}
                      className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold inline-flex items-center gap-2 shrink-0"
                    >
                      <Copy className="w-4 h-4" />
                      {copied ? 'Kopyalandı' : 'Kopyala'}
                    </button>
                  </div>
                </div>
              )}

              {shareTab === 'whatsapp' && (
                <div className="space-y-4">
                  <p className="text-sm text-slate-400">
                    Numarayı yazın; WhatsApp açılır ve başvuru linki hazır mesaj olarak gelir.
                  </p>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">
                      Telefon Numarası <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="tel"
                      value={whatsappPhone}
                      onChange={(e) => {
                        setWhatsappPhone(e.target.value);
                        if (whatsappPhoneError) setWhatsappPhoneError('');
                      }}
                      onKeyDown={(e) => e.key === 'Enter' && handleWhatsAppSend()}
                      placeholder="05551234567"
                      className={`w-full px-4 py-3 rounded-xl border bg-slate-900/80 text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500/50 ${
                        whatsappPhoneError ? 'border-rose-500/60' : 'border-slate-600'
                      }`}
                      inputMode="tel"
                      autoFocus
                    />
                    {whatsappPhoneError ? (
                      <p className="text-xs text-rose-400 font-medium">{whatsappPhoneError}</p>
                    ) : (
                      <p className="text-xs text-slate-500">
                        Başvuru formu bu numaraya WhatsApp üzerinden iletilecektir.
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={handleWhatsAppSend}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-lg"
                  >
                    <Send className="w-4 h-4" /> WhatsApp ile Gönder
                  </button>
                </div>
              )}

              {shareTab === 'qr' && (
                <div className="flex flex-col items-center gap-4">
                  <p className="text-sm text-slate-400 text-center">QR kodu okutarak forma gidilir.</p>
                  <div className="p-4 bg-white rounded-xl">
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(formUrl)}`}
                      alt="Başvuru formu QR kodu"
                      width={200}
                      height={200}
                      className="block"
                    />
                  </div>
                  <p className="text-[10px] text-slate-500 font-mono break-all text-center max-w-full px-2">{formUrl}</p>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-700/80 bg-slate-800/30">
              <button
                type="button"
                onClick={() => setShareOpen(false)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-slate-600 text-slate-300 text-sm font-bold hover:bg-slate-700/50"
              >
                <X className="w-4 h-4" /> İptal
              </button>
              {shareTab === 'link' && (
                <button
                  type="button"
                  onClick={() => { copyLink(); setShareOpen(false); }}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold"
                >
                  <Copy className="w-4 h-4" /> Kopyala
                </button>
              )}
              {shareTab === 'qr' && (
                <a
                  href={formUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold"
                >
                  Formu Aç
                </a>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default ApplicationsAdmin;
