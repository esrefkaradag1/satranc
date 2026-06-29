import React, { useState, useMemo, useRef } from 'react';
import { Image as ImageIcon, Plus, Search, Heart, Share2, Camera, X, Trash2, Upload, ZoomIn } from 'lucide-react';
import { useApp } from '../AppContext';
import type { GalleryItem } from '../types';

const DEFAULT_FORM = { url: '', title: '', group: 'Alt Yapı A', date: new Date().toISOString().slice(0, 10), studentId: '' as string };

const Gallery: React.FC = () => {
  const { gallery, addGalleryItem, removeGalleryItem, scopedStudents: students, scopedGallery } = useApp();
  const [selectedGroup, setSelectedGroup] = useState('Hepsi');
  const [searchTerm, setSearchTerm] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [uploadError, setUploadError] = useState('');
  const [zoomedImg, setZoomedImg] = useState<GalleryItem | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const groups = useMemo(() => {
    const fromStudents = [...new Set(students.map(s => s.group).filter(Boolean))] as string[];
    return ['Hepsi', ...fromStudents.sort()];
  }, [students]);

  const filteredImages = useMemo(() => {
    let list = scopedGallery;
    if (selectedGroup !== 'Hepsi') list = list.filter(img => img.group === selectedGroup || img.group === 'Hepsi');
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      list = list.filter(img => img.title.toLowerCase().includes(q) || img.group.toLowerCase().includes(q));
    }
    return list;
  }, [scopedGallery, selectedGroup, searchTerm]);

  const MAX_FILE_SIZE_MB = 2;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setUploadError('Lütfen bir görsel dosyası seçin (JPG, PNG, WebP, GIF).');
      return;
    }
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      setUploadError(`Dosya en fazla ${MAX_FILE_SIZE_MB}MB olmalıdır.`);
      return;
    }
    setUploadError('');
    const reader = new FileReader();
    reader.onload = () => setForm(f => ({ ...f, url: reader.result as string }));
    reader.readAsDataURL(file);
  };

  const clearFile = () => {
    setForm(f => ({ ...f, url: '' }));
    setUploadError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.url.trim()) {
      setUploadError('Lütfen bir görsel yükleyin.');
      return;
    }
    const dateStr = form.date.split('-').reverse().join('.');
    addGalleryItem({ url: form.url, title: form.title, group: form.group, date: dateStr, studentId: form.studentId || undefined });
    const defaultGroup = groups.filter(g => g !== 'Hepsi')[0] || 'Alt Yapı A';
    setForm({ ...DEFAULT_FORM, group: defaultGroup });
    if (fileInputRef.current) fileInputRef.current.value = '';
    setUploadError('');
    setModalOpen(false);
  };

  const closeModal = () => {
    setModalOpen(false);
    setForm({ ...DEFAULT_FORM, group: groups.filter(g => g !== 'Hepsi')[0] || 'Alt Yapı A' });
    setUploadError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="space-y-4 sm:space-y-6 min-w-0 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 sm:gap-6">
        <div className="min-w-0">
          <h2 className="text-xl sm:text-3xl font-bold tracking-tight bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">Medya & Galeri</h2>
          <p className="text-slate-400 text-xs sm:text-sm mt-1">Akademi etkinliklerinden kareler ve eğitim materyalleri.</p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 sm:px-8 py-2.5 sm:py-3 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-500 transition-all shadow-lg shadow-indigo-500/20 active:scale-95 shrink-0"
        >
          <Plus className="w-4 h-4" /> Yeni Fotoğraf
        </button>
      </div>

      <div className="flex flex-col gap-3 sm:gap-4 bg-[#1e293b]/90 backdrop-blur-2xl p-3 sm:p-5 rounded-xl border border-white/5">
        <div className="flex gap-2 overflow-x-auto scrollbar-none pb-0.5 -mx-0.5 px-0.5">
          {groups.map(group => (
            <button
              key={group}
              onClick={() => setSelectedGroup(group)}
              className={`shrink-0 px-3 sm:px-5 py-2 sm:py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all border whitespace-nowrap ${
                selectedGroup === group
                  ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-500/20'
                  : 'bg-white/5 border-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-300'
              }`}
            >
              {group}
            </button>
          ))}
        </div>
        <div className="relative group w-full">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-400 transition-colors" />
          <input
            type="text"
            placeholder="Galeri ara..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 sm:py-3 bg-slate-900/50 border border-white/5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all placeholder:text-slate-500"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        {filteredImages.map((img) => (
          <div key={img.id} className="group bg-[#1e293b]/90 backdrop-blur-2xl rounded-lg border border-white/5 overflow-hidden hover:border-white/10 transition-all duration-500">
            <div
              className="relative aspect-[4/3] overflow-hidden cursor-zoom-in"
              role="button"
              tabIndex={0}
              onClick={() => setZoomedImg(img)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setZoomedImg(img); } }}
            >
              <img
                src={img.url}
                alt={img.title}
                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                referrerPolicy="no-referrer"
                onError={e => { (e.target as HTMLImageElement).src = 'https://picsum.photos/seed/chess/800/600'; }}
              />
              <div className="absolute top-6 right-6 flex items-center gap-2">
                <button type="button" onClick={e => { e.stopPropagation(); setZoomedImg(img); }} className="p-2.5 bg-black/50 hover:bg-indigo-600/80 rounded-lg text-white transition-all" title="Büyüt">
                  <ZoomIn className="w-5 h-5" />
                </button>
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 flex flex-col justify-end p-8">
                <div className="flex justify-between items-center text-white">
                  <div className="flex gap-4">
                    <button type="button" className="p-3 bg-white/10 backdrop-blur-md hover:bg-white/20 rounded-lg transition-all" onClick={e => e.stopPropagation()}><Heart className="w-5 h-5" /></button>
                    <button type="button" className="p-3 bg-white/10 backdrop-blur-md hover:bg-white/20 rounded-lg transition-all" onClick={e => e.stopPropagation()}><Share2 className="w-5 h-5" /></button>
                  </div>
                  <button type="button" onClick={e => { e.stopPropagation(); removeGalleryItem(img.id); }} className="p-3 bg-rose-500/20 hover:bg-rose-500/30 rounded-lg transition-all text-rose-400">
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
              <div className="absolute top-6 left-6">
                <span className="px-4 py-1.5 bg-slate-900/80 backdrop-blur-md text-indigo-400 border border-white/10 rounded-full text-[10px] font-black uppercase tracking-widest shadow-xl">
                  {img.group}
                </span>
              </div>
            </div>
            <div className="p-4 sm:p-6 bg-white/[0.02]">
              <h4 className="text-base sm:text-lg font-bold text-white tracking-tight truncate">{img.title}</h4>
              <div className="flex items-center gap-2 mt-2">
                <Camera className="w-3.5 h-3.5 text-slate-300" />
                <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">{img.date}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
      {filteredImages.length === 0 && (
        <div className="py-12 sm:py-20 text-center bg-[#1e293b]/90 backdrop-blur-2xl rounded-xl border border-white/5">
          <ImageIcon className="w-14 h-14 sm:w-20 sm:h-20 text-white mx-auto mb-4 sm:mb-6 opacity-20" />
          <p className="text-slate-400 font-bold sm:font-black uppercase tracking-wide sm:tracking-[0.2em] text-xs sm:text-sm px-4">{searchTerm || selectedGroup !== 'Hepsi' ? 'Görsel bulunamadı.' : 'Henüz fotoğraf eklenmedi.'}</p>
        </div>
      )}

      {/* Büyütme (lightbox) */}
      {zoomedImg && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm" onClick={() => setZoomedImg(null)}>
          <div className="relative max-w-5xl max-h-[90vh] w-full flex flex-col items-center" onClick={e => e.stopPropagation()}>
            <button type="button" onClick={() => setZoomedImg(null)} className="absolute -top-2 -right-2 z-10 p-2 rounded-full bg-slate-800 hover:bg-rose-500/80 text-white transition-colors shadow-xl">
              <X className="w-6 h-6" />
            </button>
            <img
              src={zoomedImg.url}
              alt={zoomedImg.title}
              className="max-w-full max-h-[80vh] w-auto h-auto object-contain rounded-lg shadow-2xl"
              referrerPolicy="no-referrer"
              onError={e => { (e.target as HTMLImageElement).src = 'https://picsum.photos/seed/chess/800/600'; }}
            />
            <div className="mt-4 text-center">
              <h4 className="text-lg font-bold text-white">{zoomedImg.title}</h4>
              <p className="text-sm text-slate-400 mt-1">{zoomedImg.date} · {zoomedImg.group}</p>
            </div>
          </div>
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={closeModal}>
          <div className="bg-[#1e293b] border border-white/10 rounded-lg shadow-2xl w-full max-w-md p-8" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-white">Yeni Fotoğraf Ekle</h3>
              <button type="button" onClick={closeModal} className="p-2 rounded-lg hover:bg-white/5 text-slate-400"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">Görsel Yükle</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
                {form.url ? (
                  <div className="relative rounded-lg overflow-hidden border border-white/10 bg-slate-900/50">
                    <img src={form.url} alt="Önizleme" className="w-full h-40 object-cover" />
                    <button type="button" onClick={clearFile} className="absolute top-2 right-2 p-2 bg-black/60 hover:bg-rose-500/80 rounded-lg text-white transition-colors">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full px-4 py-8 bg-slate-900/50 border border-dashed border-white/10 rounded-lg text-slate-400 hover:border-indigo-500/50 hover:bg-slate-800/50 hover:text-slate-300 transition-all flex flex-col items-center gap-2"
                  >
                    <Upload className="w-10 h-10" />
                    <span className="text-sm font-medium">Dosya seçmek için tıklayın</span>
                    <span className="text-[10px]">JPG, PNG, WebP, GIF</span>
                  </button>
                )}
                {uploadError && <p className="text-rose-400 text-xs mt-1.5">{uploadError}</p>}
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">Başlık</label>
                <input required value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className="w-full px-4 py-3 bg-slate-900/50 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Örn: Turnuva Hazırlığı" />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">Görünürlük (öğrenci seçilirse sadece o öğrenci ve velisi görür)</label>
                <select value={form.studentId} onChange={e => setForm(f => ({ ...f, studentId: e.target.value }))} className="w-full px-4 py-3 bg-slate-900/50 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="">Herkese açık</option>
                  {students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">Grup</label>
                <select value={form.group} onChange={e => setForm(f => ({ ...f, group: e.target.value }))} className="w-full px-4 py-3 bg-slate-900/50 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  {groups.filter(g => g !== 'Hepsi').map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">Tarih</label>
                <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="w-full px-4 py-3 bg-slate-900/50 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 [color-scheme:dark]" />
              </div>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={closeModal} className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-white font-bold rounded-lg transition-all">İptal</button>
                <button type="submit" className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg transition-all">Ekle</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Gallery;
