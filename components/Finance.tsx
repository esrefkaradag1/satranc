
import React, { useCallback, useMemo, useState } from 'react';
import { Wallet, TrendingUp, TrendingDown, Landmark, Search, Plus, Filter, Download, X, Edit2, Trash2, Lock } from 'lucide-react';
import { useApp } from '../AppContext';
import type { Transaction } from '../types';
import { DATE_INPUT_MAX, DATE_INPUT_MIN, normalizeDateInputYear } from '../lib/dateInputUtils';
import { ResponsiveTable } from './ui/ResponsiveTable';
import { isPackageSaleCategory } from '../lib/salePaymentUtils';
import { countsTowardGeneralCash, isDuesPaymentTransaction, isPersonalCashTransaction } from '../lib/transactionUtils';
import { formatTransactionDateTR } from '../lib/duesCalendarUtils';
import SalePaymentCell from './SalePaymentCell';

const CATEGORY_PRESETS = ['Aidat', 'Özel Ders', 'Paket', 'Kira', 'Malzeme', 'Diğer'] as const;

const Finance: React.FC = () => {
  const {
    scopedTransactions: transactions,
    addTransaction,
    updateTransaction,
    removeTransaction,
    scopedStudents: students,
    confirmDialog,
    auth,
    adminViewClub,
    setAdminViewClubId,
    clubs,
  } = useApp();

  if (auth?.role === 'admin' && !adminViewClub) {
    return (
      <div className="max-w-xl mx-auto mt-10 sm:mt-16 bento-card p-6 sm:p-8 text-center space-y-4">
        <div className="w-12 h-12 mx-auto rounded-2xl bg-rose-500/15 border border-rose-500/25 flex items-center justify-center">
          <Lock className="w-5 h-5 text-rose-400" />
        </div>
        <h2 className="text-lg font-bold text-white">Kulüp seçin</h2>
        <p className="text-sm text-slate-400 leading-relaxed">
          Süper yönetici kasasında tüm kulüplerin toplamı birleştirilmez. Üst menüden bir kulüp seçin veya anasayfadaki kulüp kartına tıklayın.
        </p>
        <div className="flex flex-wrap justify-center gap-2 pt-1">
          {clubs.slice(0, 8).map((club) => (
            <button
              key={club.id}
              type="button"
              onClick={() => setAdminViewClubId(club.id)}
              className="px-3 py-1.5 rounded-lg border border-white/10 bg-slate-900/60 text-xs font-bold text-slate-200 hover:border-indigo-500/40 hover:text-white transition-colors"
            >
              {club.name}
            </button>
          ))}
        </div>
        <a href="#/anasayfa" className="inline-block text-xs font-bold text-indigo-400 hover:text-indigo-300">
          Anasayfaya dön
        </a>
      </div>
    );
  }

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTxnAmount, setEditTxnAmount] = useState('');
  const [editTxnTotalAmount, setEditTxnTotalAmount] = useState('');
  const [editTxnDate, setEditTxnDate] = useState('');
  const [editTxnPaymentType, setEditTxnPaymentType] = useState<'Nakit' | 'Havale/EFT' | 'Kredi Kartı'>('Nakit');
  const [editTxnProcessedBy, setEditTxnProcessedBy] = useState('');
  const [editTxnDescription, setEditTxnDescription] = useState('');
  const [editTxnCategory, setEditTxnCategory] = useState('Aidat');
  const [editTxnStudentId, setEditTxnStudentId] = useState('');
  const [editTxnPersonalCash, setEditTxnPersonalCash] = useState(false);
  const [editTxnIncludeInGeneral, setEditTxnIncludeInGeneral] = useState(false);

  const [formData, setFormData] = useState({
    studentId: '',
    amount: 0,
    totalAmount: 0,
    date: new Date().toISOString().split('T')[0],
    type: 'income' as 'income' | 'expense',
    category: 'Aidat',
    description: '',
    paymentType: 'Nakit' as 'Nakit' | 'Havale/EFT' | 'Kredi Kartı',
    processedBy: '',
    personalCash: false,
    includeInGeneralCash: false,
  });

  const studentNameById = useMemo(() => {
    const map = new Map<string, string>();
    students.forEach((s) => map.set(String(s.id), s.name));
    return map;
  }, [students]);

  const needsStudentLink = (category: string) => {
    const c = category.trim();
    return c === 'Aidat' || isPackageSaleCategory(c);
  };

  const generalTransactions = useMemo(
    () => transactions.filter((t) => countsTowardGeneralCash(t)),
    [transactions],
  );
  const personalTransactions = useMemo(
    () => transactions.filter((t) => isPersonalCashTransaction(t)),
    [transactions],
  );

  const totalIncome = generalTransactions
    .filter((t) => t.type === 'income')
    .reduce((acc, t) => acc + t.amount, 0);

  const totalExpense = generalTransactions
    .filter((t) => t.type === 'expense')
    .reduce((acc, t) => acc + t.amount, 0);

  const balance = totalIncome - totalExpense;

  const personalIncome = personalTransactions
    .filter((t) => t.type === 'income')
    .reduce((acc, t) => acc + t.amount, 0);
  const personalExpense = personalTransactions
    .filter((t) => t.type === 'expense')
    .reduce((acc, t) => acc + t.amount, 0);
  const personalBalance = personalIncome - personalExpense;

  const filteredTransactions = transactions.filter((t) => {
    const q = searchTerm.toLowerCase();
    const studentName = t.studentId ? (studentNameById.get(String(t.studentId)) ?? '') : '';
    return (
      (t.description || '').toLowerCase().includes(q)
      || (t.category || '').toLowerCase().includes(q)
      || studentName.toLowerCase().includes(q)
      || (isPersonalCashTransaction(t) && 'kişisel kasa'.includes(q))
    );
  });

  const resetForm = () => {
    setFormData({
      studentId: '',
      amount: 0,
      totalAmount: 0,
      date: new Date().toISOString().split('T')[0],
      type: 'income',
      category: 'Aidat',
      description: '',
      paymentType: 'Nakit',
      processedBy: '',
      personalCash: false,
      includeInGeneralCash: false,
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.type === 'income' && needsStudentLink(formData.category) && !formData.studentId) {
      return;
    }
    const payload: Omit<Transaction, 'id'> = {
      date: normalizeDateInputYear(formData.date),
      type: formData.type,
      category: formData.category.trim() || 'Diğer',
      description: formData.description.trim(),
      paymentType: formData.paymentType,
      amount: formData.amount,
      processedBy: formData.processedBy.trim() || undefined,
      studentId: formData.studentId || undefined,
      personalCash: formData.personalCash || undefined,
      includeInGeneralCash: formData.personalCash ? formData.includeInGeneralCash : undefined,
      collectedAt: normalizeDateInputYear(formData.date),
    };
    if (formData.type === 'income' && isPackageSaleCategory(formData.category) && formData.totalAmount > 0) {
      payload.totalAmount = formData.totalAmount;
    }
    addTransaction(payload);
    setIsModalOpen(false);
    resetForm();
  };

  const openEdit = useCallback((t: Transaction) => {
    setEditingId(t.id);
    setEditTxnAmount(String(t.amount ?? ''));
    setEditTxnTotalAmount(t.totalAmount != null ? String(t.totalAmount) : '');
    setEditTxnDate(t.date || '');
    setEditTxnPaymentType(t.paymentType || 'Nakit');
    setEditTxnProcessedBy(t.processedBy || '');
    setEditTxnDescription(t.description || '');
    setEditTxnCategory(t.category || '');
    setEditTxnStudentId(t.studentId ? String(t.studentId) : '');
    setEditTxnPersonalCash(!!t.personalCash);
    setEditTxnIncludeInGeneral(!!t.includeInGeneralCash);
  }, []);

  const saveEdit = () => {
    if (!editingId) return;
    const amount = Number(editTxnAmount.replace(/\s/g, '').replace(',', '.'));
    if (Number.isNaN(amount) || amount < 0) return;
    const totalRaw = editTxnTotalAmount.trim() ? Number(editTxnTotalAmount.replace(/\s/g, '').replace(',', '.')) : NaN;
    const showSaleTotal = isPackageSaleCategory(editTxnCategory);
    updateTransaction(editingId, {
      description: editTxnDescription.trim(),
      date: editTxnDate ? normalizeDateInputYear(editTxnDate) : undefined,
      collectedAt: editTxnDate ? normalizeDateInputYear(editTxnDate) : undefined,
      category: editTxnCategory.trim() || undefined,
      amount,
      totalAmount: showSaleTotal && !Number.isNaN(totalRaw) && totalRaw > 0 ? totalRaw : undefined,
      paymentType: editTxnPaymentType,
      processedBy: editTxnProcessedBy.trim() || undefined,
      studentId: editTxnStudentId || undefined,
      personalCash: editTxnPersonalCash,
      includeInGeneralCash: editTxnPersonalCash ? editTxnIncludeInGeneral : false,
    });
    setEditingId(null);
  };

  const handleDelete = async (t: Transaction) => {
    const ok = await confirmDialog({
      title: 'İşlemi sil',
      message: `"${t.category}" · ₺${Number(t.amount).toLocaleString('tr-TR')} kaydını silmek istediğinize emin misiniz?${
        isDuesPaymentTransaction(t) ? ' Aidat takviminden de kaldırılır.' : ''
      }`,
      confirmLabel: 'Sil',
      variant: 'danger',
    });
    if (ok) removeTransaction(t.id);
  };

  const editingTxn = editingId ? transactions.find((t) => t.id === editingId) : null;
  const editShowSaleTotal = editingTxn ? isPackageSaleCategory(editingTxn.category) : isPackageSaleCategory(editTxnCategory);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">Finans Yönetimi</h2>
          <p className="text-slate-400 text-sm mt-1">
            Gelir ve gider takibini buradan yapabilirsiniz. Aidat tahsilatları yalnızca &quot;Aidat&quot; kategorisinde öğrenci aidat takvimine yansır.
            Kişisel kasa işlemleri varsayılan olarak genel toplamlara dahil edilmez.
          </p>
        </div>
        <div className="flex gap-3 w-full md:w-auto">
          <button type="button" className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-white/5 border border-white/10 rounded-lg text-sm font-bold text-slate-300 hover:bg-white/10 transition-all active:scale-95">
            <Download className="w-4 h-4" /> Dışa Aktar
          </button>
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-500 transition-all shadow-lg shadow-indigo-500/20 active:scale-95"
          >
            <Plus className="w-4 h-4" /> Yeni İşlem
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 xl:gap-8">
        <FinanceStatCard icon={<TrendingUp />} label="Toplam Gelir" value={`₺${totalIncome.toLocaleString('tr-TR')}`} color="green" />
        <FinanceStatCard icon={<TrendingDown />} label="Toplam Gider" value={`₺${totalExpense.toLocaleString('tr-TR')}`} color="rose" />
        <FinanceStatCard icon={<Landmark />} label="Kasa Bakiyesi" value={`₺${balance.toLocaleString('tr-TR')}`} color="indigo" />
        <FinanceStatCard
          icon={<Lock />}
          label="Kişisel Kasa"
          value={`₺${personalBalance.toLocaleString('tr-TR')}`}
          color="amber"
          subtitle={personalTransactions.length > 0 ? `${personalTransactions.length} işlem` : 'Kişisel işlem yok'}
        />
      </div>

      <div className="bg-[#1e293b]/90 backdrop-blur-2xl rounded-lg border border-white/5 overflow-hidden">
        <div className="p-8 border-b border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white/[0.02]">
          <h3 className="text-lg font-bold text-white tracking-tight">Son İşlemler</h3>
          <div className="flex items-center gap-3">
            <div className="relative group">
              <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-400 transition-colors" />
              <input
                type="text"
                placeholder="İşlem veya kategori ara..."
                className="pl-12 pr-4 py-3 bg-slate-900/50 border border-white/5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 w-full md:w-72 transition-all placeholder:text-slate-300"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <button type="button" className="p-3 bg-white/5 border border-white/10 rounded-lg text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/10 transition-all">
              <Filter className="w-5 h-5" />
            </button>
          </div>
        </div>

        <ResponsiveTable minWidth={760} className="table-scroll -mx-4 sm:mx-0 px-4 sm:px-0">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="text-slate-400 text-[10px] uppercase tracking-widest font-black border-b border-white/5">
                <th className="px-6 sm:px-8 py-5">İşlem / Kategori</th>
                <th className="px-6 sm:px-8 py-5">Öğrenci</th>
                <th className="px-6 sm:px-8 py-5">Tutar</th>
                <th className="px-6 sm:px-8 py-5">Tarih</th>
                <th className="px-6 sm:px-8 py-5">Tür</th>
                <th className="px-6 sm:px-8 py-5">Açıklama</th>
                <th className="px-6 sm:px-8 py-5">Durum</th>
                <th className="px-6 sm:px-8 py-5 text-right rt-col-actions">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredTransactions.map((transaction) => {
                const isIncome = transaction.type === 'income';
                const studentName = transaction.studentId
                  ? studentNameById.get(String(transaction.studentId))
                  : null;
                const isPersonal = isPersonalCashTransaction(transaction);
                return (
                  <tr
                    key={transaction.id}
                    className={`transition-colors group border-l-[3px] ${
                      isIncome
                        ? 'border-l-emerald-400 bg-emerald-500/[0.18] hover:bg-emerald-500/[0.25]'
                        : 'border-l-rose-400 bg-rose-500/[0.18] hover:bg-rose-500/[0.25]'
                    }`}
                  >
                    <td data-label="İşlem / Kategori" className="px-6 sm:px-8 py-4 sm:py-5">
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-base font-black border shadow-sm ${
                          isIncome
                            ? 'bg-emerald-500/45 text-emerald-100 border-emerald-300/60 shadow-emerald-500/30'
                            : 'bg-rose-500/45 text-rose-100 border-rose-300/60 shadow-rose-500/30'
                        }`}>
                          {isIncome ? '+' : '−'}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-white tracking-tight">{transaction.category}</p>
                          <p className="text-[10px] text-slate-400 font-medium uppercase tracking-widest mt-0.5">
                            {isDuesPaymentTransaction(transaction) ? 'Aidat takvimi' : isPackageSaleCategory(transaction.category) ? 'Satış' : 'Genel'}
                            {isPersonal ? (
                              <span className="ml-2 inline-flex items-center gap-1 text-amber-300 normal-case tracking-normal">
                                <Lock className="w-3 h-3" />
                                Kişisel
                                {transaction.includeInGeneralCash ? ' · genele yansır' : ''}
                              </span>
                            ) : null}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td data-label="Öğrenci" className="px-6 sm:px-8 py-4 sm:py-5 text-sm text-slate-300">
                      {studentName || '—'}
                    </td>
                    <td data-label="Tutar" className="px-6 sm:px-8 py-4 sm:py-5">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-sm sm:text-base font-black tabular-nums ${
                        isIncome
                          ? 'bg-emerald-500/40 text-emerald-100 border border-emerald-300/50'
                          : 'bg-rose-500/40 text-rose-100 border border-rose-300/50'
                      }`}>
                        {isIncome ? '+' : '−'} ₺{transaction.amount.toLocaleString('tr-TR')}
                      </span>
                      {isPackageSaleCategory(transaction.category) ? (
                        <div className="mt-1.5"><SalePaymentCell transaction={transaction} /></div>
                      ) : null}
                    </td>
                    <td data-label="Tarih" className="px-6 sm:px-8 py-4 sm:py-5 text-sm text-slate-300 font-semibold">{formatTransactionDateTR(transaction)}</td>
                    <td data-label="Tür" className="px-6 sm:px-8 py-4 sm:py-5">
                      <span className={`text-[10px] px-3 py-1.5 rounded-lg font-black uppercase tracking-widest border ${
                        isIncome
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/45'
                          : 'bg-rose-500/20 text-rose-300 border-rose-400/45'
                      }`}>
                        {isIncome ? 'Gelir' : 'Gider'}
                      </span>
                    </td>
                    <td data-label="Açıklama" className="px-6 sm:px-8 py-4 sm:py-5 text-sm text-slate-300 font-medium max-w-xs truncate">{transaction.description || '—'}</td>
                    <td data-label="Durum" className="px-6 sm:px-8 py-4 sm:py-5">
                      <span className={`inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest px-2.5 py-1.5 rounded-lg border ${
                        isIncome
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40'
                          : 'bg-slate-500/20 text-slate-300 border-slate-400/35'
                      }`}>
                        <span className={`w-2 h-2 rounded-full ${isIncome ? 'bg-emerald-400' : 'bg-slate-400'}`} />
                        {isIncome ? 'Tahsil edildi' : 'Ödendi'}
                      </span>
                    </td>
                    <td data-label="İşlem" className="px-6 sm:px-8 py-4 sm:py-5 text-right rt-col-actions">
                      <div className="rt-actions-row">
                        <button type="button" onClick={() => openEdit(transaction)} className="p-1.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-amber-500/10" title="Düzenle">
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button type="button" onClick={() => void handleDelete(transaction)} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10" title="Sil">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredTransactions.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-8 py-20 text-center">
                    <Wallet className="w-12 h-12 text-slate-200 mx-auto mb-4 opacity-20" />
                    <p className="text-slate-400 font-medium">Henüz bir işlem bulunmamaktadır.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </ResponsiveTable>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setIsModalOpen(false)} aria-hidden />
          <div className="relative w-full max-w-lg bg-[#1e293b]/90 backdrop-blur-2xl border border-white/10 rounded-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 max-h-[90vh] overflow-y-auto">
            <div className="p-8">
              <div className="flex justify-between items-center mb-8">
                <div>
                  <h3 className="text-2xl font-bold text-white">Yeni İşlem Ekle</h3>
                  <p className="text-slate-400 text-sm mt-1">Aidat tahsilatı için kategori &quot;Aidat&quot; ve öğrenci seçimi zorunludur.</p>
                </div>
                <button type="button" onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white transition-colors">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">İşlem Türü</label>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setFormData({ ...formData, type: 'income' })} className={`flex-1 py-3 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-all ${formData.type === 'income' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-slate-900/50 border-white/5 text-slate-400'}`}>Gelir</button>
                      <button type="button" onClick={() => setFormData({ ...formData, type: 'expense' })} className={`flex-1 py-3 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-all ${formData.type === 'expense' ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' : 'bg-slate-900/50 border-white/5 text-slate-400'}`}>Gider</button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Tarih</label>
                    <input required type="date" min={DATE_INPUT_MIN} max={DATE_INPUT_MAX} className="w-full px-5 py-3 bg-slate-900/50 border border-white/5 rounded-lg text-white focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all [color-scheme:dark]" value={formData.date} onChange={(e) => setFormData({ ...formData, date: normalizeDateInputYear(e.target.value) })} />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Kategori</label>
                  <select value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value })} className="w-full px-5 py-3 bg-slate-900/50 border border-white/5 rounded-lg text-white focus:ring-2 focus:ring-indigo-500/50 outline-none">
                    {CATEGORY_PRESETS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 space-y-3">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.personalCash}
                      onChange={(e) => setFormData({
                        ...formData,
                        personalCash: e.target.checked,
                        includeInGeneralCash: e.target.checked ? formData.includeInGeneralCash : false,
                      })}
                      className="mt-1 rounded border-slate-500 bg-slate-900 text-amber-500 focus:ring-amber-500/40"
                    />
                    <span>
                      <span className="text-sm font-bold text-amber-100 flex items-center gap-1.5">
                        <Lock className="w-4 h-4" /> Kişisel kasa
                      </span>
                      <span className="block text-xs text-slate-400 mt-0.5">
                        İşlem kişisel kasaya yazılır; genel gelir/gider/kasa bakiyesine dahil edilmez.
                      </span>
                    </span>
                  </label>
                  {formData.personalCash ? (
                    <label className="flex items-start gap-3 cursor-pointer pl-7">
                      <input
                        type="checkbox"
                        checked={formData.includeInGeneralCash}
                        onChange={(e) => setFormData({ ...formData, includeInGeneralCash: e.target.checked })}
                        className="mt-1 rounded border-slate-500 bg-slate-900 text-indigo-500 focus:ring-indigo-500/40"
                      />
                      <span>
                        <span className="text-sm font-bold text-white">Genele yansıt</span>
                        <span className="block text-xs text-slate-400 mt-0.5">
                          İşaretlenirse bu tutar genel kasa toplamlarına da eklenir.
                        </span>
                      </span>
                    </label>
                  ) : null}
                </div>

                {formData.type === 'income' && needsStudentLink(formData.category) && (
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Öğrenci *</label>
                    <select required value={formData.studentId} onChange={(e) => setFormData({ ...formData, studentId: e.target.value })} className="w-full px-5 py-3 bg-slate-900/50 border border-white/5 rounded-lg text-white focus:ring-2 focus:ring-indigo-500/50 outline-none">
                      <option value="">Seçin</option>
                      {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                )}

                {formData.type === 'income' && isPackageSaleCategory(formData.category) && (
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Toplam Tutar (₺)</label>
                    <input type="number" min="0" step="0.01" className="w-full px-5 py-3 bg-slate-900/50 border border-white/5 rounded-lg text-white focus:ring-2 focus:ring-indigo-500/50 outline-none" value={formData.totalAmount || ''} onChange={(e) => setFormData({ ...formData, totalAmount: parseFloat(e.target.value) || 0 })} />
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">{isPackageSaleCategory(formData.category) ? 'Alınan Tutar (₺)' : 'Tutar (₺)'}</label>
                  <input required type="number" className="w-full px-5 py-4 bg-slate-900/50 border border-white/5 rounded-lg text-white text-2xl font-black focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all" placeholder="0.00" value={formData.amount || ''} onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })} />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Ödeme tipi</label>
                  <select value={formData.paymentType} onChange={(e) => setFormData({ ...formData, paymentType: e.target.value as typeof formData.paymentType })} className="w-full px-5 py-3 bg-slate-900/50 border border-white/5 rounded-lg text-white focus:ring-2 focus:ring-indigo-500/50 outline-none">
                    <option value="Nakit">Nakit</option>
                    <option value="Havale/EFT">Havale/EFT</option>
                    <option value="Kredi Kartı">Kredi Kartı</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Açıklama</label>
                  <textarea className="w-full px-5 py-4 bg-slate-900/50 border border-white/5 rounded-lg text-white focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all resize-none h-24" placeholder="İşlem detaylarını yazın..." value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} />
                </div>

                <div className="pt-4 flex gap-3">
                  <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-4 bg-white/5 hover:bg-white/10 text-white font-bold rounded-lg transition-all">İptal</button>
                  <button type="submit" className="flex-1 py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg transition-all shadow-lg shadow-indigo-500/20">Kaydet</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {editingId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={() => setEditingId(null)}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" aria-hidden />
          <div className="relative w-full max-w-md bg-[#1e293b] border border-slate-700/60 rounded-xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-slate-700/60 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white flex items-center gap-2"><Edit2 className="w-5 h-5 text-amber-500" /> İşlem Düzenle</h3>
              <button type="button" onClick={() => setEditingId(null)} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Kategori</label>
                <select value={editTxnCategory} onChange={(e) => setEditTxnCategory(e.target.value)} className="w-full px-4 py-2.5 rounded-lg bg-slate-800 border border-slate-600 text-white text-sm">
                  {CATEGORY_PRESETS.map((c) => <option key={c} value={c}>{c}</option>)}
                  {!CATEGORY_PRESETS.includes(editTxnCategory as typeof CATEGORY_PRESETS[number]) && editTxnCategory ? <option value={editTxnCategory}>{editTxnCategory}</option> : null}
                </select>
              </div>
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer text-sm text-amber-100 font-bold">
                  <input
                    type="checkbox"
                    checked={editTxnPersonalCash}
                    onChange={(e) => {
                      setEditTxnPersonalCash(e.target.checked);
                      if (!e.target.checked) setEditTxnIncludeInGeneral(false);
                    }}
                    className="rounded border-slate-500 bg-slate-900 text-amber-500 focus:ring-amber-500/40"
                  />
                  Kişisel kasa
                </label>
                {editTxnPersonalCash ? (
                  <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-200 pl-6">
                    <input
                      type="checkbox"
                      checked={editTxnIncludeInGeneral}
                      onChange={(e) => setEditTxnIncludeInGeneral(e.target.checked)}
                      className="rounded border-slate-500 bg-slate-900 text-indigo-500 focus:ring-indigo-500/40"
                    />
                    Genele yansıt
                  </label>
                ) : null}
              </div>
              {needsStudentLink(editTxnCategory) && (
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Öğrenci</label>
                  <select value={editTxnStudentId} onChange={(e) => setEditTxnStudentId(e.target.value)} className="w-full px-4 py-2.5 rounded-lg bg-slate-800 border border-slate-600 text-white text-sm">
                    <option value="">Seçin</option>
                    {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Açıklama</label>
                <input type="text" value={editTxnDescription} onChange={(e) => setEditTxnDescription(e.target.value)} className="w-full px-4 py-2.5 rounded-lg bg-slate-800 border border-slate-600 text-white text-sm" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Tarih</label>
                <input type="date" min={DATE_INPUT_MIN} max={DATE_INPUT_MAX} value={editTxnDate} onChange={(e) => setEditTxnDate(normalizeDateInputYear(e.target.value))} className="w-full px-4 py-2.5 rounded-lg bg-slate-800 border border-slate-600 text-white text-sm [color-scheme:dark]" />
              </div>
              {editShowSaleTotal && (
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Toplam Tutar (₺)</label>
                  <input type="number" min="0" step="0.01" value={editTxnTotalAmount} onChange={(e) => setEditTxnTotalAmount(e.target.value)} className="w-full px-4 py-2.5 rounded-lg bg-slate-800 border border-slate-600 text-white text-sm" />
                </div>
              )}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">{editShowSaleTotal ? 'Alınan Tutar (₺)' : 'Tutar (₺)'}</label>
                <input type="number" min="0" step="0.01" value={editTxnAmount} onChange={(e) => setEditTxnAmount(e.target.value)} className="w-full px-4 py-2.5 rounded-lg bg-slate-800 border border-slate-600 text-white text-sm" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Ödeme tipi</label>
                <select value={editTxnPaymentType} onChange={(e) => setEditTxnPaymentType(e.target.value as typeof editTxnPaymentType)} className="w-full px-4 py-2.5 rounded-lg bg-slate-800 border border-slate-600 text-white text-sm">
                  <option value="Nakit">Nakit</option>
                  <option value="Havale/EFT">Havale/EFT</option>
                  <option value="Kredi Kartı">Kredi Kartı</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Tahsil eden</label>
                <input type="text" value={editTxnProcessedBy} onChange={(e) => setEditTxnProcessedBy(e.target.value)} className="w-full px-4 py-2.5 rounded-lg bg-slate-800 border border-slate-600 text-white text-sm" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setEditingId(null)} className="flex-1 py-2.5 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-800 font-bold text-sm">İptal</button>
                <button type="button" onClick={saveEdit} className="flex-1 py-2.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold text-sm">Kaydet</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const FinanceStatCard = ({
  icon,
  label,
  value,
  color,
  subtitle,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
  subtitle?: string;
}) => {
  const colorClasses: Record<string, string> = {
    green: 'bg-emerald-500/25 text-emerald-300 border-emerald-400/45 shadow-emerald-500/15',
    rose: 'bg-rose-500/25 text-rose-300 border-rose-400/45 shadow-rose-500/15',
    indigo: 'bg-indigo-500/25 text-indigo-300 border-indigo-400/45 shadow-indigo-500/15',
    amber: 'bg-amber-500/25 text-amber-300 border-amber-400/45 shadow-amber-500/15',
  };

  return (
    <div className="bg-[#1e293b]/90 backdrop-blur-2xl p-8 rounded-lg border border-white/5 hover:scale-[1.02] transition-all group">
      <div className={`w-14 h-14 rounded-lg flex items-center justify-center border mb-6 transition-transform group-hover:scale-110 ${colorClasses[color]}`}>
        {React.cloneElement(icon as React.ReactElement<{ size?: number; strokeWidth?: number }>, { size: 28, strokeWidth: 2.5 })}
      </div>
      <h3 className="text-slate-400 text-[10px] font-black uppercase tracking-[0.2em]">{label}</h3>
      <p className="text-3xl font-black text-white mt-2 tracking-tighter">{value}</p>
      {subtitle ? <p className="text-xs text-slate-500 mt-1">{subtitle}</p> : null}
    </div>
  );
};

export default Finance;
