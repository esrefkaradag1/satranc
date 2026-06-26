import React, { useState } from 'react';
import { Settings2, Search, Menu, ChevronUp, ChevronDown, Copy, FlipHorizontal, Plus, Trash2, Import } from 'lucide-react';
import type { StudyChapter, LeftTab } from '../../lib/studyTypes';
import { formatChapterListLabel, chapterListLabelMatches } from '../../lib/studyUtils';

type MemberItem = {
  id: string;
  name: string;
};

interface StudyChapterListProps {
  chapters: StudyChapter[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  onAdd: () => void;
  onEdit: (chapter: StudyChapter) => void;
  onDelete: (id: string) => void;
  onDuplicate: (index: number) => void;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
  onReorder: (from: number, to: number) => void;
  onBulkImport: (text: string) => number;
  members: MemberItem[];
  availableMembers: MemberItem[];
  onAddMember: (studentId: string) => void;
  onRemoveMember: (studentId: string) => void;
}

export const StudyChapterList: React.FC<StudyChapterListProps> = ({
  chapters,
  selectedIndex,
  onSelect,
  onAdd,
  onEdit,
  onDelete,
  onDuplicate,
  onMoveUp,
  onMoveDown,
  onReorder,
  onBulkImport,
  members,
  availableMembers,
  onAddMember,
  onRemoveMember,
}) => {
  const [leftTab, setLeftTab] = useState<LeftTab>('chapters');
  const [chapterSearch, setChapterSearch] = useState('');
  const [showChapterSearch, setShowChapterSearch] = useState(false);
  const [draggingChapterId, setDraggingChapterId] = useState<string | null>(null);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [bulkPgn, setBulkPgn] = useState('');

  const filteredChapters = chapters.filter(ch =>
    chapterListLabelMatches(ch, chapterSearch, chapters),
  );

  const handleBulkImport = () => {
    if (!bulkPgn.trim()) return;
    const count = onBulkImport(bulkPgn);
    if (count > 0) {
      setBulkPgn('');
      setShowBulkImport(false);
    }
  };

  return (
    <div className="w-72 shrink-0 flex flex-col min-h-0 rounded-2xl bg-[#15181c] border border-white/5 shadow-2xl overflow-hidden overscroll-none">
      {/* Side Tabs */}
      <div className="flex items-center bg-[#1b1e23] border-b border-white/5 shrink-0 px-2">
        {(['chapters', 'members'] as const).map(tab => (
          <button
            key={tab}
            type="button"
            onClick={() => setLeftTab(tab)}
            className={`relative px-4 py-3 text-[11px] font-bold uppercase tracking-wider transition-all ${
              leftTab === tab
                ? 'text-indigo-400'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {tab === 'chapters' ? `${chapters.length} Bölüm` : `${members.length} Üye`}
            {leftTab === tab && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]" />
            )}
          </button>
        ))}
        <div className="flex-1" />
        {leftTab === 'chapters' && (
          <div className="flex items-center">
            <button
              type="button"
              onClick={() => setShowBulkImport(!showBulkImport)}
              className={`p-2 transition-colors ${showBulkImport ? 'text-indigo-400' : 'text-slate-500 hover:text-slate-200'}`}
              title="Toplu PGN İçe Aktar"
            >
              <Import className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => { setShowChapterSearch(v => !v); setChapterSearch(''); }}
              className={`p-2 transition-colors ${showChapterSearch ? 'text-indigo-400' : 'text-slate-500 hover:text-slate-200'}`}
              title="Bölüm ara"
            >
              <Search className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {showBulkImport && (
        <div className="p-3 border-b border-white/5 bg-black/40 space-y-2">
           <textarea
             value={bulkPgn}
             onChange={e => setBulkPgn(e.target.value)}
             placeholder="PGN metnini buraya yapıştırın (çoklu oyun destekler)..."
             className="w-full h-24 bg-[#1b1e23] text-[10px] p-2 rounded border border-white/5 outline-none resize-none custom-scrollbar"
           />
           <button
             onClick={handleBulkImport}
             className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold rounded transition-colors"
           >
             BÖLÜMLERİ EKLE
           </button>
        </div>
      )}

      {showChapterSearch && (
        <div className="p-2 border-b border-white/5">
          <input
            autoFocus
            type="text"
            value={chapterSearch}
            onChange={e => setChapterSearch(e.target.value)}
            placeholder="Ara..."
            className="w-full bg-[#1b1e23] text-xs px-2 py-1.5 rounded outline-none border border-white/5"
          />
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-0.5 custom-scrollbar bg-black/20">
        {leftTab === 'chapters' ? (
          filteredChapters.map(ch => {
            const realIdx = chapters.findIndex(c => c.id === ch.id);
            const active = selectedIndex === realIdx;
            return (
              <div
                key={ch.id}
                className={`flex items-center group rounded px-2 hover:bg-white/5 transition-colors cursor-pointer ${active ? 'bg-indigo-500/10' : ''}`}
                draggable
                onClick={() => onSelect(realIdx)}
                onDragStart={() => setDraggingChapterId(ch.id)}
                onDragEnd={() => setDraggingChapterId(null)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  const from = chapters.findIndex(c => c.id === draggingChapterId);
                  const to = realIdx;
                  if (from >= 0 && to >= 0) onReorder(from, to);
                  setDraggingChapterId(null);
                }}
              >
                <span className={`w-6 text-[10px] font-bold text-slate-600 ${active ? 'text-indigo-500' : ''}`}>{realIdx + 1}</span>
                <div className="flex-1 min-w-0 py-2">
                  <span className={`text-[13px] font-medium truncate ${active ? 'text-indigo-200' : 'text-slate-300'}`}>
                    {formatChapterListLabel(ch, { allChapters: chapters })}
                  </span>
                </div>
                
                {/* Actions on hover */}
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onMoveUp(realIdx); }}
                    className="p-1 text-slate-500 hover:text-white"
                    title="Yukarı taşı"
                  >
                    <ChevronUp className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onMoveDown(realIdx); }}
                    className="p-1 text-slate-500 hover:text-white"
                    title="Aşağı taşı"
                  >
                    <ChevronDown className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onDuplicate(realIdx); }}
                    className="p-1 text-slate-500 hover:text-white"
                    title="Kopyala"
                  >
                    <Copy className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onDelete(ch.id); }}
                    className="p-1 text-slate-500 hover:text-rose-400"
                    title="Sil"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onEdit(ch); }}
                    className="p-1 text-slate-500 hover:text-teal-400 ml-1"
                    title="Düzenle"
                  >
                    <Settings2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {active && (
                  <div className="w-1 h-6 bg-indigo-500 rounded-full ml-2 shadow-[0_0_8px_rgba(99,102,241,0.5)]" />
                )}
              </div>
            );
          })
        ) : (
          <div className="space-y-3">
            {members.length === 0 ? (
              <div className="p-4 text-slate-500 text-xs text-center">Henüz üye eklenmedi.</div>
            ) : (
              members.map((m) => (
                <div key={m.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/5">
                  <div className="min-w-0">
                    <p className="text-xs text-slate-200 font-semibold truncate">{m.name}</p>
                    <p className="text-[10px] text-slate-500 truncate">#{m.id}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemoveMember(m.id)}
                    className="p-1.5 text-slate-500 hover:text-rose-400 transition-colors"
                    title="Üyeyi kaldır"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}

            <div className="pt-2 border-t border-white/5">
              <p className="px-1 pb-2 text-[10px] text-slate-500 uppercase tracking-widest font-bold">Öğrenci Ekle</p>
              {availableMembers.length === 0 ? (
                <div className="px-1 text-[11px] text-slate-500">Eklenebilecek öğrenci yok.</div>
              ) : (
                <div className="space-y-1">
                  {availableMembers.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => onAddMember(m.id)}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-black/30 border border-white/5 hover:border-indigo-500/40 hover:bg-indigo-500/5 transition-all text-left"
                    >
                      <span className="text-xs text-slate-200 font-medium truncate">{m.name}</span>
                      <Plus className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {leftTab === 'chapters' && (
        <div className="p-3 border-t border-white/5 bg-black/40">
           <button
             type="button"
             onClick={onAdd}
             className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-indigo-500/30 text-indigo-400/70 hover:text-indigo-400 hover:border-indigo-500/50 hover:bg-indigo-500/5 transition-all text-xs font-bold uppercase tracking-widest group"
           >
              <Plus className="w-3.5 h-3.5 transition-transform group-hover:scale-110" />
              Yeni Bölüm Ekle
           </button>
        </div>
      )}
    </div>
  );
};
