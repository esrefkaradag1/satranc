import React, { useState, useMemo } from 'react';
import { Box, Package, Archive, Plus, Search, Filter, MoreHorizontal, X, Trash2 } from 'lucide-react';
import { useApp } from '../AppContext';
import { ResponsiveTable } from './ui/ResponsiveTable';
import type { InventoryItem } from '../types';

const Inventory: React.FC = () => {
  const { inventory, addInventoryItem, updateInventoryItem, deleteInventoryItem } = useApp();
  const [searchTerm, setSearchTerm] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ name: '', category: 'Malzeme', stock: 0, unit: 'Adet', minStock: 10 });

  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return inventory;
    const q = searchTerm.toLowerCase();
    return inventory.filter(i => i.name.toLowerCase().includes(q) || i.category.toLowerCase().includes(q));
  }, [inventory, searchTerm]);

  const criticalCount = useMemo(() => inventory.filter(i => i.status === 'Kritik').length, [inventory]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const min = form.minStock ?? 10;
    let status: InventoryItem['status'] = 'Yeterli';
    if (form.stock <= min * 0.5) status = 'Kritik';
    else if (form.stock <= min) status = 'Azalıyor';
    addInventoryItem({ ...form, minStock: min, status });
    setForm({ name: '', category: 'Malzeme', stock: 0, unit: 'Adet', minStock: 10 });
    setModalOpen(false);
  };

  return (
    <div className="space-y-4 md:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 md:gap-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">Depo & Envanter</h2>
          <p className="text-slate-400 text-sm mt-1">Malzeme ve stok durumunu buradan takip edebilirsiniz.</p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 px-8 py-3 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-500 transition-all shadow-lg shadow-indigo-600/20 active:scale-95"
        >
          <Plus className="w-4 h-4" /> Yeni Malzeme Ekle
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-8">
        <InventoryStatCard icon={<Package />} label="Toplam Ürün" value={inventory.length.toString()} color="indigo" />
        <InventoryStatCard icon={<Archive />} label="Kritik Stok" value={criticalCount.toString()} color="rose" />
        <InventoryStatCard icon={<Box />} label="Kategoriler" value={[...new Set(inventory.map(i => i.category))].length.toString()} color="emerald" />
      </div>

      <div className="bg-[#1e293b]/90 backdrop-blur-2xl rounded-lg border border-white/5 overflow-hidden bg-white/[0.02]">
        <div className="p-4 sm:p-6 md:p-8 border-b border-white/5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white/[0.02]">
          <h3 className="text-lg font-bold text-white flex items-center gap-3 tracking-tight">
            <Box className="w-5 h-5 text-indigo-400" /> Stok Listesi
          </h3>
          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className="relative flex-1 md:w-64">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Malzeme ara..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-11 pr-4 py-2.5 bg-slate-900/50 border border-white/5 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
              />
            </div>
            <button className="p-2.5 bg-white/5 border border-white/5 rounded-lg text-slate-400 hover:text-white transition-all">
              <Filter className="w-5 h-5" />
            </button>
          </div>
        </div>

        <ResponsiveTable minWidth={600}>
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="text-slate-400 text-[10px] uppercase tracking-widest font-black border-b border-white/5">
                <th className="px-8 py-5">Malzeme Adı</th>
                <th className="px-8 py-5">Kategori</th>
                <th className="px-8 py-5 text-center">Stok Adedi</th>
                <th className="px-8 py-5">Birim</th>
                <th className="px-8 py-5">Durum</th>
                <th className="px-8 py-5 text-right">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.map((item) => (
                <tr key={item.id} className="hover:bg-white/[0.02] transition-colors group">
                  <td data-label="Malzeme Adı" className="px-8 py-5">
                    <span className="text-sm font-bold text-slate-200 tracking-tight">{item.name}</span>
                  </td>
                  <td data-label="Kategori" className="px-8 py-5">
                    <span className="px-3 py-1 bg-white/5 border border-white/5 rounded-lg text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      {item.category}
                    </span>
                  </td>
                  <td data-label="Stok Adedi" className="px-8 py-5 text-center">
                    <span className={`text-sm font-black ${item.stock < (item.minStock || 15) ? 'text-rose-400' : 'text-indigo-400'}`}>
                      {item.stock}
                    </span>
                  </td>
                  <td data-label="Birim" className="px-8 py-5">
                    <span className="text-xs font-bold text-slate-400">{item.unit}</span>
                  </td>
                  <td data-label="Durum" className="px-8 py-5">
                    <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${
                      item.status === 'Yeterli' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                      item.status === 'Kritik' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' :
                      'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    }`}>
                      {item.status}
                    </span>
                  </td>
                  <td data-label="İşlem" className="px-8 py-5 text-right">
                    <button
                      onClick={() => deleteInventoryItem(item.id)}
                      className="p-2 text-slate-400 hover:text-rose-400 transition-colors"
                      title="Sil"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-8 py-16 text-center text-slate-500 text-sm">
                    {searchTerm ? 'Arama sonucu bulunamadı.' : 'Henüz malzeme eklenmedi.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </ResponsiveTable>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={() => setModalOpen(false)}>
          <div className="bg-[#1e293b] border border-white/10 rounded-lg shadow-2xl w-full max-w-md p-8" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-white">Yeni Malzeme Ekle</h3>
              <button onClick={() => setModalOpen(false)} className="p-2 rounded-lg hover:bg-white/5 text-slate-400"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">Malzeme Adı</label>
                <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full px-4 py-3 bg-slate-900/50 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Örn: Satranç Takımı" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">Kategori</label>
                  <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className="w-full px-4 py-3 bg-slate-900/50 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    <option>Malzeme</option>
                    <option>Elektronik</option>
                    <option>Kitap</option>
                    <option>Ödül</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">Birim</label>
                  <select value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} className="w-full px-4 py-3 bg-slate-900/50 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    <option>Adet</option>
                    <option>Kutu</option>
                    <option>Takım</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">Stok Adedi</label>
                  <input type="number" min={0} value={form.stock || ''} onChange={e => setForm(f => ({ ...f, stock: parseInt(e.target.value, 10) || 0 }))} className="w-full px-4 py-3 bg-slate-900/50 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">Min. Stok Uyarı</label>
                  <input type="number" min={0} value={form.minStock || ''} onChange={e => setForm(f => ({ ...f, minStock: parseInt(e.target.value, 10) || 0 }))} className="w-full px-4 py-3 bg-slate-900/50 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              </div>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setModalOpen(false)} className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-white font-bold rounded-lg transition-all">İptal</button>
                <button type="submit" className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg transition-all">Kaydet</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

const InventoryStatCard = ({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) => {
  const colorClasses: Record<string, string> = {
    indigo: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
    rose: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
    emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  };
  return (
    <div className="bg-[#1e293b]/90 backdrop-blur-2xl p-4 sm:p-6 md:p-8 rounded-lg border border-white/5 hover:scale-[1.02] transition-all group">
      <div className={`w-12 h-12 sm:w-14 sm:h-14 rounded-lg flex items-center justify-center border mb-4 sm:mb-6 transition-transform group-hover:scale-110 ${colorClasses[color] || colorClasses.indigo}`}>
        {React.cloneElement(icon as React.ReactElement<{ size?: number; strokeWidth?: number }>, { size: 28, strokeWidth: 2.5 })}
      </div>
      <h3 className="text-slate-400 text-[10px] font-black uppercase tracking-[0.2em]">{label}</h3>
      <p className="text-3xl font-black text-white mt-2 tracking-tighter">{value}</p>
    </div>
  );
};

export default Inventory;
