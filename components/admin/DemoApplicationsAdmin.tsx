import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Copy,
  Eye,
  Loader2,
  Filter,
  Search,
  Trash2,
  UserPlus,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import { useApp } from '../../AppContext';
import type { DemoApplication, DemoApplicationStatus } from '../../lib/demoApplicationTypes';
import { DEMO_APPLICATIONS_UPDATED_EVENT } from '../../lib/demoApplicationTypes';
import {
  deleteDemoApplicationAsync,
  formatDemoPhone,
  loadDemoApplicationsListAsync,
  normalizeDemoPhone,
  updateDemoApplicationAsync,
} from '../../services/demoApplicationStorage';
import { suggestClubUsername } from '../../lib/clubLoginUtils';
import { generateStudentPassword } from '../../lib/studentCredentials';
import { normalizeClubKey } from '../../lib/clubScope';
import { publicLoginHref } from '../../lib/panelRouting';
import { ResponsiveTable } from '../ui/ResponsiveTable';

const STATUS_LABEL: Record<DemoApplicationStatus, string> = {
  pending: 'Beklemede',
  approved: 'Onaylandı',
  rejected: 'Reddedildi',
};

const STATUS_CLS: Record<DemoApplicationStatus, string> = {
  pending: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  approved: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  rejected: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
};

type ApprovedCreds = {
  applicationNo: string;
  clubName: string;
  contactPerson: string;
  clubUsername: string;
  clubPassword: string;
  coachLogin: string;
  coachPassword: string;
  existingClub: boolean;
};

const DemoApplicationsAdmin: React.FC = () => {
  const {
    clubs,
    addClub,
    addCoach,
    seedClubOrgStructure,
    showToast,
    confirmDialog,
  } = useApp();
  const [list, setList] = useState<DemoApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<DemoApplicationStatus | 'all'>('all');
  const [detail, setDetail] = useState<DemoApplication | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [approvedCreds, setApprovedCreds] = useState<ApprovedCreds | null>(null);
  const [credsCopied, setCredsCopied] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setList(await loadDemoApplicationsListAsync());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onUpd = () => {
      void refresh();
    };
    window.addEventListener(DEMO_APPLICATIONS_UPDATED_EVENT, onUpd);
    return () => window.removeEventListener(DEMO_APPLICATIONS_UPDATED_EVENT, onUpd);
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
        a.applicationNo.toLowerCase().includes(q) ||
        a.clubName.toLowerCase().includes(q) ||
        a.contactPerson.toLowerCase().includes(q) ||
        a.phone.includes(q.replace(/\D/g, '')) ||
        formatDemoPhone(a.phone).toLowerCase().includes(q)
      );
    });
  }, [list, search, statusFilter]);

  const handleReject = async (app: DemoApplication) => {
    const updated = await updateDemoApplicationAsync(app.id, { status: 'rejected' });
    if (updated) {
      setList((prev) => prev.map((a) => (a.id === app.id ? updated : a)));
      if (detail?.id === app.id) setDetail(updated);
      showToast('Demo başvurusu reddedildi.', 'info');
    }
  };

  const handleApprove = async (app: DemoApplication) => {
    if (app.status === 'approved' || actionId) return;
    const ok = await confirmDialog({
      title: 'Demo hesabı aç',
      message: `${app.clubName} için kulüp ve antrenör paneli açılsın mı? Giriş bilgileri onaydan sonra bir kez gösterilir.`,
      confirmLabel: 'Onayla ve aç',
    });
    if (!ok) return;
    setActionId(app.id);
    try {
      const clubKey = normalizeClubKey(app.clubName);
      const existingClub = clubs.find((c) => normalizeClubKey(c.name) === clubKey);
      const clubPassword = generateStudentPassword(10);
      const coachPassword = generateStudentPassword(10);
      const club = existingClub ?? addClub({
        name: app.clubName,
        loginUsername: suggestClubUsername(app.clubName, clubs),
        loginPassword: clubPassword,
        activeDays: [true, true, true, true, true, true, false],
      });
      const coach = await addCoach({
        name: app.contactPerson,
        branch: club.name,
        phone: normalizeDemoPhone(app.phone),
        password: coachPassword,
        clubId: club.id,
      });
      if (!existingClub) seedClubOrgStructure(club.id, club.name, coach.id);
      const updated = await updateDemoApplicationAsync(app.id, {
        status: 'approved',
        clubId: club.id,
        coachId: coach.id,
        clubUsername: club.loginUsername,
        approvedAt: new Date().toISOString(),
      });
      if (updated) {
        setList((prev) => prev.map((a) => (a.id === app.id ? updated : a)));
        if (detail?.id === app.id) setDetail(updated);
      }
      setApprovedCreds({
        applicationNo: app.applicationNo,
        clubName: club.name,
        contactPerson: app.contactPerson,
        clubUsername: club.loginUsername || suggestClubUsername(club.name, clubs, club.id),
        clubPassword: existingClub
          ? (existingClub.loginPassword?.trim() || 'kulup')
          : clubPassword,
        coachLogin: formatDemoPhone(app.phone) || app.contactPerson,
        coachPassword,
        existingClub: !!existingClub,
      });
      showToast('Demo kulüp ve antrenör hesabı açıldı.', 'success');
    } catch (err) {
      console.error('[DemoApplications] approve failed:', err);
      showToast('Hesap açılırken hata oluştu. Tekrar deneyin.', 'error');
    } finally {
      setActionId(null);
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await confirmDialog({
      title: 'Başvuruyu sil',
      message: 'Bu demo başvurusunu silmek istediğinize emin misiniz?',
      confirmLabel: 'Sil',
      variant: 'danger',
    });
    if (!ok) return;
    await deleteDemoApplicationAsync(id);
    setList((prev) => prev.filter((a) => a.id !== id));
    if (detail?.id === id) setDetail(null);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div>
        <h1 className="text-2xl font-black text-white tracking-tight">Demo Başvuruları</h1>
        <p className="text-sm text-slate-400 mt-1">
          Ana siteden gelen kulüp / antrenör demo talepleri. Onaylayınca antrenör paneli açılır.
        </p>
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
            placeholder="Kulüp, yetkili, telefon veya başvuru no..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900/60 border border-slate-700/60 text-sm text-white placeholder:text-slate-500 outline-none focus:border-indigo-500/50"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-500 shrink-0" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as DemoApplicationStatus | 'all')}
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
          <p className="text-center py-16 text-slate-500 text-sm">Demo başvurusu yok.</p>
        ) : (
          <ResponsiveTable minWidth={640}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/50 text-left text-[10px] font-bold uppercase text-slate-500">
                  <th className="px-4 py-3">No</th>
                  <th className="px-4 py-3">Kulüp</th>
                  <th className="px-4 py-3">Yetkili</th>
                  <th className="px-4 py-3 hidden md:table-cell">Telefon</th>
                  <th className="px-4 py-3 hidden lg:table-cell">Tarih</th>
                  <th className="px-4 py-3">Durum</th>
                  <th className="px-4 py-3 text-right rt-col-actions">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((app) => (
                  <tr key={app.id} className="border-b border-slate-700/30 hover:bg-slate-800/50">
                    <td data-label="No" className="px-4 py-3 font-mono text-xs text-indigo-400">{app.applicationNo}</td>
                    <td data-label="Kulüp" className="px-4 py-3 font-bold text-white">{app.clubName}</td>
                    <td data-label="Yetkili" className="px-4 py-3 text-slate-200">{app.contactPerson}</td>
                    <td data-label="Telefon" className="px-4 py-3 max-md:!flex hidden md:table-cell text-slate-400 font-mono text-xs">
                      {formatDemoPhone(app.phone)}
                    </td>
                    <td data-label="Tarih" className="px-4 py-3 max-md:!flex hidden lg:table-cell text-slate-500 text-xs">
                      {new Date(app.createdAt).toLocaleDateString('tr-TR')}
                    </td>
                    <td data-label="Durum" className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border ${STATUS_CLS[app.status]}`}>
                        {STATUS_LABEL[app.status]}
                      </span>
                    </td>
                    <td data-label="İşlem" className="px-4 py-3 rt-col-actions">
                      <div className="rt-actions-row">
                        <button type="button" onClick={() => setDetail(app)} className="p-2 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white" title="Detay">
                          <Eye className="w-4 h-4" />
                        </button>
                        {app.status === 'pending' && (
                          <>
                            <button
                              type="button"
                              disabled={actionId === app.id}
                              onClick={() => void handleApprove(app)}
                              className="p-2 rounded-lg hover:bg-emerald-500/20 text-emerald-400"
                              title="Onayla — antrenör paneli aç"
                            >
                              {actionId === app.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                            </button>
                            <button type="button" onClick={() => void handleReject(app)} className="p-2 rounded-lg hover:bg-rose-500/20 text-rose-400" title="Reddet">
                              <XCircle className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        <button type="button" onClick={() => void handleDelete(app.id)} className="p-2 rounded-lg hover:bg-rose-500/20 text-slate-500 hover:text-rose-400" title="Sil">
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
        <div className="modal-overlay z-50" onClick={() => setDetail(null)}>
          <div className="modal-panel max-w-lg rounded-t-2xl sm:rounded-2xl bg-[#1e293b] border border-slate-600 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
              <div>
                <h2 className="text-lg font-black text-white">{detail.clubName}</h2>
                <p className="text-xs text-indigo-400 font-mono">{detail.applicationNo}</p>
              </div>
              <button type="button" onClick={() => setDetail(null)} className="p-2 rounded-lg hover:bg-slate-700 text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-3 text-sm">
              <p><span className="text-slate-500">Yetkili:</span> <span className="text-white">{detail.contactPerson}</span></p>
              <p><span className="text-slate-500">Telefon:</span> <span className="text-white font-mono">{formatDemoPhone(detail.phone)}</span></p>
              <p><span className="text-slate-500">Durum:</span> <span className="text-white">{STATUS_LABEL[detail.status]}</span></p>
              <p><span className="text-slate-500">Tarih:</span> <span className="text-white">{new Date(detail.createdAt).toLocaleString('tr-TR')}</span></p>
              {detail.clubUsername ? (
                <p><span className="text-slate-500">Kulüp kullanıcı adı:</span> <span className="text-white font-mono">{detail.clubUsername}</span></p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {approvedCreds ? (
        <div className="modal-overlay z-[60]" onClick={() => setApprovedCreds(null)}>
          <div className="modal-panel max-w-md rounded-t-2xl sm:rounded-2xl bg-[#1e293b] border border-emerald-500/30 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/80 bg-emerald-500/10">
              <div>
                <h3 className="text-base font-black text-white">Antrenör paneli açıldı</h3>
                <p className="text-xs text-slate-400 mt-0.5">{approvedCreds.clubName} · {approvedCreds.applicationNo}</p>
              </div>
              <button type="button" onClick={() => setApprovedCreds(null)} className="p-2 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-slate-300">
                {approvedCreds.contactPerson} artık antrenör paneline girebilir. Bilgileri bir kez gösterilir.
              </p>
              <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-4 space-y-3">
                <p className="text-[10px] font-bold uppercase text-indigo-300">Antrenör girişi</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase font-bold">Telefon / ad</span>
                    <p className="font-mono text-white mt-0.5">{approvedCreds.coachLogin}</p>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase font-bold">Şifre</span>
                    <p className="font-mono text-white mt-0.5">{approvedCreds.coachPassword}</p>
                  </div>
                </div>
                <a href={publicLoginHref('coach')} className="text-xs text-indigo-300 hover:text-indigo-200 underline">
                  Antrenör giriş sayfası
                </a>
              </div>
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 space-y-3">
                <p className="text-[10px] font-bold uppercase text-emerald-300">Kulüp girişi</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase font-bold">Kullanıcı adı</span>
                    <p className="font-mono text-white mt-0.5">{approvedCreds.clubUsername}</p>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase font-bold">Şifre</span>
                    <p className="font-mono text-white mt-0.5">{approvedCreds.clubPassword}</p>
                  </div>
                </div>
                {approvedCreds.existingClub ? (
                  <p className="text-[10px] text-amber-300">Bu kulüp zaten vardı; mevcut giriş bilgisi kullanıldı.</p>
                ) : null}
                <a href={publicLoginHref('club')} className="text-xs text-emerald-300 hover:text-emerald-200 underline">
                  Kulüp giriş sayfası
                </a>
              </div>
              <button
                type="button"
                onClick={() => {
                  const text = [
                    `${approvedCreds.clubName} demo hesabı`,
                    `Antrenör: ${approvedCreds.coachLogin} / ${approvedCreds.coachPassword}`,
                    `Kulüp: ${approvedCreds.clubUsername} / ${approvedCreds.clubPassword}`,
                  ].join('\n');
                  void navigator.clipboard?.writeText(text).then(() => {
                    setCredsCopied(true);
                    setTimeout(() => setCredsCopied(false), 2000);
                  });
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold"
              >
                <Copy className="w-3.5 h-3.5" />
                {credsCopied ? 'Kopyalandı' : 'Giriş bilgilerini kopyala'}
              </button>
              <button
                type="button"
                onClick={() => setApprovedCreds(null)}
                className="w-full py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-white text-sm font-bold"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default DemoApplicationsAdmin;
