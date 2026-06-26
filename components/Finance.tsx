
import React, { useState } from'react';
import { Wallet, TrendingUp, TrendingDown, Landmark, Search, Plus, Filter, Download, X } from'lucide-react';
import { useApp } from'../AppContext';
import { Transaction } from'../types';
import { DATE_INPUT_MAX, DATE_INPUT_MIN, normalizeDateInputYear } from '../lib/dateInputUtils';
import { ResponsiveTable } from './ui/ResponsiveTable';

const Finance: React.FC = () => {
 const { scopedTransactions: transactions, addTransaction, scopedStudents: students } = useApp();
 const [isModalOpen, setIsModalOpen] = useState(false);
 const [searchTerm, setSearchTerm] = useState('');

 // Form state
 const [formData, setFormData] = useState({
 studentId: '',
 amount: 0,
 date: new Date().toISOString().split('T')[0],
 type: 'income'as'income' | 'expense',
 category: 'Aidat',
 description: ''
 });

 const totalIncome = transactions
 .filter(t => t.type === 'income')
 .reduce((acc, t) => acc + t.amount, 0);

 const totalExpense = transactions
 .filter(t => t.type === 'expense')
 .reduce((acc, t) => acc + t.amount, 0);

 const balance = totalIncome - totalExpense;

 const filteredTransactions = transactions.filter(t => 
 t.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
 t.category.toLowerCase().includes(searchTerm.toLowerCase())
 );

 const handleSubmit = (e: React.FormEvent) => {
 e.preventDefault();
 addTransaction({
 ...formData,
 paymentType: 'Nakit',
 });
 setIsModalOpen(false);
 setFormData({
 studentId: '',
 amount: 0,
 date: new Date().toISOString().split('T')[0],
 type: 'income',
 category: 'Aidat',
 description: ''
 });
 };

 return (
 <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
 <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
 <div>
 <h2 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">Finans Yönetimi</h2>
 <p className="text-slate-400 text-sm mt-1">Gelir ve gider takibini buradan yapabilirsiniz.</p>
 </div>
 <div className="flex gap-3 w-full md:w-auto">
 <button className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-white/5 border border-white/10 rounded-lg text-sm font-bold text-slate-300 hover:bg-white/10 transition-all active:scale-95">
 <Download className="w-4 h-4" /> Dışa Aktar
 </button>
 <button 
 onClick={() => setIsModalOpen(true)}
 className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-500 transition-all shadow-lg shadow-indigo-500/20 active:scale-95"
 >
 <Plus className="w-4 h-4" /> Yeni İşlem
 </button>
 </div>
 </div>

 <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
 <FinanceStatCard 
 icon={<TrendingUp />} 
 label="Toplam Gelir" 
 value={`₺${totalIncome.toLocaleString()}`} 
 color="green" 
 />
 <FinanceStatCard 
 icon={<TrendingDown />} 
 label="Toplam Gider" 
 value={`₺${totalExpense.toLocaleString()}`} 
 color="rose" 
 />
 <FinanceStatCard 
 icon={<Landmark />} 
 label="Kasa Bakiyesi" 
 value={`₺${balance.toLocaleString()}`} 
 color="indigo" 
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
 onChange={e => setSearchTerm(e.target.value)}
 />
 </div>
 <button className="p-3 bg-white/5 border border-white/10 rounded-lg text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/10 transition-all">
 <Filter className="w-5 h-5" />
 </button>
 </div>
 </div>

 <ResponsiveTable minWidth={640} className="table-scroll -mx-4 sm:mx-0 px-4 sm:px-0">
 <table className="w-full text-left border-collapse">
 <thead>
 <tr className="text-slate-400 text-[10px] uppercase tracking-widest font-black border-b border-white/5">
 <th className="px-8 py-5">İşlem / Kategori</th>
 <th className="px-8 py-5">Tutar</th>
 <th className="px-8 py-5">Tarih</th>
 <th className="px-8 py-5">Tür</th>
 <th className="px-8 py-5">Açıklama</th>
 <th className="px-8 py-5 text-right">Durum</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-white/5">
 {filteredTransactions.map((transaction) => {
 const isIncome = transaction.type === 'income';
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
 <p className="text-[10px] text-slate-400 font-medium uppercase tracking-widest mt-0.5">#{transaction.id}</p>
 </div>
 </div>
 </td>
 <td data-label="Tutar" className="px-6 sm:px-8 py-4 sm:py-5">
 <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-sm sm:text-base font-black tabular-nums ${
 isIncome
 ? 'bg-emerald-500/40 text-emerald-100 border border-emerald-300/50'
 : 'bg-rose-500/40 text-rose-100 border border-rose-300/50'
 }`}>
 {isIncome ? '+' : '−'} ₺{transaction.amount.toLocaleString('tr-TR')}
 </span>
 </td>
 <td data-label="Tarih" className="px-6 sm:px-8 py-4 sm:py-5 text-sm text-slate-300 font-semibold">{transaction.date}</td>
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
 <td data-label="Durum" className="px-6 sm:px-8 py-4 sm:py-5 text-right">
 <span className={`inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest px-2.5 py-1.5 rounded-lg border ${
 isIncome
 ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40'
 : 'bg-slate-500/20 text-slate-300 border-slate-400/35'
 }`}>
 <span className={`w-2 h-2 rounded-full ${isIncome ? 'bg-emerald-400' : 'bg-slate-400'}`} />
 {isIncome ? 'Tahsil edildi' : 'Ödendi'}
 </span>
 </td>
 </tr>
 );
 })}
 {filteredTransactions.length === 0 && (
 <tr>
 <td colSpan={6} className="px-8 py-20 text-center">
 <Wallet className="w-12 h-12 text-slate-200 mx-auto mb-4 opacity-20" />
 <p className="text-slate-400 font-medium">Henüz bir işlem bulunmamaktadır.</p>
 </td>
 </tr>
 )}
 </tbody>
 </table>
 </ResponsiveTable>
 </div>

 {/* Modal */}
 {isModalOpen && (
 <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
 <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"onClick={() => setIsModalOpen(false)}></div>
 <div className="relative w-full max-w-lg bg-[#1e293b]/90 backdrop-blur-2xl border border-white/10 rounded-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
 <div className="p-8">
 <div className="flex justify-between items-center mb-8">
 <div>
 <h3 className="text-2xl font-bold text-white">Yeni İşlem Ekle</h3>
 <p className="text-slate-400 text-sm mt-1">Gelir veya gider kaydı oluşturun.</p>
 </div>
 <button 
 onClick={() => setIsModalOpen(false)}
 className="p-2 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white transition-colors"
 >
 <X className="w-6 h-6" />
 </button>
 </div>

 <form onSubmit={handleSubmit} className="space-y-6">
 <div className="grid grid-cols-2 gap-4">
 <div className="space-y-2">
 <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">İşlem Türü</label>
 <div className="flex gap-2">
 <button
 type="button"
 onClick={() => setFormData({...formData, type: 'income'})}
 className={`flex-1 py-3 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-all ${
 formData.type === 'income' 
 ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
 : 'bg-slate-900/50 border-white/5 text-slate-400'
 }`}
 >
 Gelir
 </button>
 <button
 type="button"
 onClick={() => setFormData({...formData, type: 'expense'})}
 className={`flex-1 py-3 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-all ${
 formData.type === 'expense' 
 ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' 
 : 'bg-slate-900/50 border-white/5 text-slate-400'
 }`}
 >
 Gider
 </button>
 </div>
 </div>
 <div className="space-y-2">
 <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Tarih</label>
 <input 
 required
 type="date"
 min={DATE_INPUT_MIN}
 max={DATE_INPUT_MAX}
 className="w-full px-5 py-3 bg-slate-900/50 border border-white/5 rounded-lg text-white focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all [color-scheme:dark]"
 value={formData.date}
 onChange={e => setFormData({...formData, date: normalizeDateInputYear(e.target.value)})}
 />
 </div>
 </div>

 <div className="space-y-2">
 <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Tutar (₺)</label>
 <input 
 required
 type="number"
 className="w-full px-5 py-4 bg-slate-900/50 border border-white/5 rounded-lg text-white text-2xl font-black focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all"
 placeholder="0.00"
 value={formData.amount || ''}
 onChange={e => setFormData({...formData, amount: parseFloat(e.target.value) || 0})}
 />
 </div>

 <div className="space-y-2">
 <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Kategori</label>
 <input 
 required
 type="text"
 className="w-full px-5 py-4 bg-slate-900/50 border border-white/5 rounded-lg text-white focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all"
 placeholder="Örn: Aidat, Kira, Malzeme"
 value={formData.category}
 onChange={e => setFormData({...formData, category: e.target.value})}
 />
 </div>

 <div className="space-y-2">
 <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Açıklama</label>
 <textarea 
 className="w-full px-5 py-4 bg-slate-900/50 border border-white/5 rounded-lg text-white focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all resize-none h-24"
 placeholder="İşlem detaylarını yazın..."
 value={formData.description}
 onChange={e => setFormData({...formData, description: e.target.value})}
 ></textarea>
 </div>

 <div className="pt-4 flex gap-3">
 <button 
 type="button"
 onClick={() => setIsModalOpen(false)}
 className="flex-1 py-4 bg-white/5 hover:bg-white/10 text-white font-bold rounded-lg transition-all"
 >
 İptal
 </button>
 <button 
 type="submit"
 className="flex-1 py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg transition-all shadow-lg shadow-indigo-500/20"
 >
 Kaydet
 </button>
 </div>
 </form>
 </div>
 </div>
 </div>
 )}
 </div>
 );
};

const FinanceStatCard = ({ icon, label, value, color }: any) => {
 const colorClasses: { [key: string]: string } = {
 green: 'bg-emerald-500/25 text-emerald-300 border-emerald-400/45 shadow-emerald-500/15',
 rose: 'bg-rose-500/25 text-rose-300 border-rose-400/45 shadow-rose-500/15',
 indigo: 'bg-indigo-500/25 text-indigo-300 border-indigo-400/45 shadow-indigo-500/15',
 };

 return (
 <div className="bg-[#1e293b]/90 backdrop-blur-2xl p-8 rounded-lg border border-white/5 hover:scale-[1.02] transition-all group">
 <div className={`w-14 h-14 rounded-lg flex items-center justify-center border mb-6 transition-transform group-hover:scale-110 ${colorClasses[color]}`}>
 {React.cloneElement(icon, { size: 28, strokeWidth: 2.5 })}
 </div>
 <h3 className="text-slate-400 text-[10px] font-black uppercase tracking-[0.2em]">{label}</h3>
 <p className="text-3xl font-black text-white mt-2 tracking-tighter">{value}</p>
 </div>
 );
};

export default Finance;
