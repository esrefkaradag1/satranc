import React, { useMemo, useState } from 'react';
import { ShieldCheck, History, UserCheck, AlertTriangle, Search, Filter } from 'lucide-react';
import { useApp } from '../AppContext';
import { ResponsiveTable } from './ui/ResponsiveTable';

function formatLogTime(iso: string): { time: string; date: string } {
  try {
    const d = new Date(iso);
    const time = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    const date = d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return { time, date };
  } catch {
    return { time: '--:--', date: '--.--.----' };
  }
}

const STATUS_LABEL: Record<string, string> = {
  success: 'Başarılı',
  info: 'Bilgi',
  warning: 'Uyarı',
};

const Security: React.FC = () => {
  const { activityLogs, students } = useApp();
  const [searchTerm, setSearchTerm] = useState('');

  const filteredLogs = useMemo(() => {
    if (!searchTerm.trim()) return activityLogs;
    const q = searchTerm.toLowerCase();
    return activityLogs.filter(
      l =>
        l.user.toLowerCase().includes(q) ||
        l.action.toLowerCase().includes(q) ||
        l.target.toLowerCase().includes(q)
    );
  }, [activityLogs, searchTerm]);

  const warningCount = 0;

 return (
 <div className="space-y-4 sm:space-y-6 min-w-0 animate-in fade-in slide-in-from-bottom-4 duration-700">
 <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-6">
 <div className="min-w-0">
 <h2 className="text-xl sm:text-3xl font-bold tracking-tight bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">Sistem Güvenliği</h2>
 <p className="text-slate-400 text-xs sm:text-sm mt-1">Sistem aktivitelerini ve güvenlik durumunu izleyin.</p>
 </div>
 </div>

 <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-6">
 <SecurityStatCard 
 icon={<ShieldCheck />} 
 label="Sistem Durumu" 
 value="Güvenli" 
 sub="Tüm servisler aktif"
 color="emerald" 
 />
 <SecurityStatCard 
 icon={<UserCheck />} 
 label="Kayıtlı Öğrenci" 
 value={students.length.toString()} 
 sub="Sistemde kayıtlı"
 color="indigo" 
 />
 <SecurityStatCard 
 icon={<AlertTriangle />} 
 label="Sistem Uyarıları" 
 value={warningCount.toString()} 
 sub="Kritik olmayan uyarı"
 color="rose" 
 />
 </div>

 <div className="bg-[#1e293b]/90 backdrop-blur-2xl rounded-xl border border-white/5 overflow-hidden">
 <div className="p-4 sm:p-6 border-b border-white/5 flex flex-col gap-3 sm:gap-4 sm:flex-row sm:items-center sm:justify-between bg-white/[0.02]">
 <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2 sm:gap-3 tracking-tight shrink-0">
 <History className="w-5 h-5 text-indigo-400 shrink-0" />
 İşlem Geçmişi (Logs)
 </h3>
 <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto min-w-0">
 <div className="relative group flex-1 sm:flex-none min-w-0">
 <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-400 transition-colors" />
 <input 
 type="text" 
 placeholder="Loglarda ara..." 
 value={searchTerm}
 onChange={e => setSearchTerm(e.target.value)}
 className="w-full sm:w-72 pl-10 pr-4 py-2.5 sm:py-3 bg-slate-900/50 border border-white/5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all placeholder:text-slate-500"
 />
 </div>
 <button type="button" className="shrink-0 p-2.5 sm:p-3 bg-white/5 border border-white/10 rounded-lg text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/10 transition-all" aria-label="Filtrele">
 <Filter className="w-5 h-5" />
 </button>
 </div>
 </div>

 {/* Mobil: kart listesi */}
 <div className="md:hidden divide-y divide-white/5">
 {filteredLogs.length === 0 ? (
 <div className="px-4 py-12 text-center text-slate-500 text-sm">
 {activityLogs.length === 0 ? 'Henüz işlem kaydı yok.' : 'Arama sonucu bulunamadı.'}
 </div>
 ) : (
 filteredLogs.map((log) => {
   const { time, date } = formatLogTime(log.timestamp);
   return (
 <div key={log.id} className="px-4 py-4 hover:bg-white/[0.02] transition-colors">
 <div className="flex items-start justify-between gap-2 mb-2">
 <div className="flex items-center gap-2.5 min-w-0">
 <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-[10px] font-black text-slate-400 border border-white/5 shrink-0">
 {log.user.charAt(0)}
 </div>
 <span className="text-sm font-bold text-slate-200 truncate">{log.user}</span>
 </div>
 <span className={`shrink-0 inline-flex px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest border ${
 log.type === 'success' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
 log.type === 'warning' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' :
 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
 }`}>
 {STATUS_LABEL[log.type] ?? log.type}
 </span>
 </div>
 <p className="text-sm text-slate-300 font-medium mb-1.5">{log.action}</p>
 <p className="text-[10px] font-mono text-slate-500 bg-white/5 px-2 py-1 rounded border border-white/5 break-all mb-2">{log.target}</p>
 <p className="text-[10px] text-slate-500 font-bold">{time} · {date}</p>
 </div>
   );
 })
 )}
 </div>

 {/* Masaüstü: tablo */}
 <div className="hidden md:block">
 <ResponsiveTable minWidth={720} className="table-scroll">
 <table className="w-full text-left border-collapse">
 <thead>
 <tr className="text-slate-400 text-[10px] uppercase tracking-widest font-black border-b border-white/5">
 <th className="px-4 lg:px-8 py-4">Kullanıcı</th>
 <th className="px-4 lg:px-8 py-4">İşlem</th>
 <th className="px-4 lg:px-8 py-4">Hedef / Detay</th>
 <th className="px-4 lg:px-8 py-4">Zaman</th>
 <th className="px-4 lg:px-8 py-4 text-right">Durum</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-white/5">
 {filteredLogs.map((log) => {
   const { time, date } = formatLogTime(log.timestamp);
   return (
 <tr key={log.id} className="hover:bg-white/[0.02] transition-colors group">
 <td data-label="Kullanıcı" className="px-4 lg:px-8 py-4">
 <div className="flex items-center gap-3">
 <div className="w-9 h-9 rounded-lg bg-white/5 flex items-center justify-center text-[10px] font-black text-slate-400 border border-white/5 shrink-0">
 {log.user.charAt(0)}
 </div>
 <span className="text-sm font-bold text-slate-200 tracking-tight truncate max-w-[140px]">{log.user}</span>
 </div>
 </td>
 <td data-label="İşlem" className="px-4 lg:px-8 py-4 text-sm text-slate-400 font-medium">{log.action}</td>
 <td data-label="Hedef / Detay" className="px-4 lg:px-8 py-4">
 <span className="text-[10px] font-mono text-slate-400 bg-white/5 px-2 py-1 rounded-lg border border-white/5 break-all">
 {log.target}
 </span>
 </td>
 <td data-label="Zaman" className="px-4 lg:px-8 py-4 whitespace-nowrap">
 <div className="text-sm text-slate-300 font-bold">{time}</div>
 <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">{date}</div>
 </td>
 <td data-label="Durum" className="px-4 lg:px-8 py-4 text-right">
 <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${
 log.type === 'success' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
 log.type === 'warning' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' :
 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
 }`}>
 {STATUS_LABEL[log.type] ?? log.type}
 </span>
 </td>
 </tr>
   );
 })}
 {filteredLogs.length === 0 && (
 <tr>
 <td colSpan={5} className="px-8 py-16 text-center text-slate-500 text-sm">
 {activityLogs.length === 0 ? 'Henüz işlem kaydı yok. Finans, öğrenci, ödev veya galeri işlemleri yaptığınızda burada görünecektir.' : 'Arama sonucu bulunamadı.'}
 </td>
 </tr>
 )}
 </tbody>
 </table>
 </ResponsiveTable>
 </div>
 </div>
 </div>
 );
};

const SecurityStatCard = ({ icon, label, value, sub, color }: { icon: React.ReactElement; label: string; value: string; sub: string; color: string }) => {
 const colorClasses: Record<string, string> = {
 emerald: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
 rose: 'bg-rose-500/10 text-rose-500 border-rose-500/20',
 indigo: 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20',
 };

 return (
 <div className="bg-[#1e293b]/90 backdrop-blur-2xl p-4 sm:p-6 lg:p-8 rounded-xl border border-white/5 hover:border-white/10 transition-all">
 <div className="flex items-center gap-4 sm:gap-6">
 <div className={`w-12 h-12 sm:w-14 sm:h-14 lg:w-16 lg:h-16 rounded-lg flex items-center justify-center border shrink-0 ${colorClasses[color] ?? colorClasses.indigo}`}>
 {React.cloneElement(icon, { size: 28, strokeWidth: 2.5 })}
 </div>
 <div className="min-w-0">
 <h3 className="text-slate-400 text-[9px] sm:text-[10px] font-black uppercase tracking-[0.15em] sm:tracking-[0.2em] truncate">{label}</h3>
 <p className="text-xl sm:text-2xl font-black text-white mt-0.5 sm:mt-1 tracking-tight">{value}</p>
 <p className="text-[9px] sm:text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5 truncate">{sub}</p>
 </div>
 </div>
 </div>
 );
};

export default Security;
