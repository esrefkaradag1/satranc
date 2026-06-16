import React, { useMemo, useState } from 'react';
import { MessageCircle, Send, Phone, User, Users, Search, MoreVertical, Plus, Paperclip, Smile, ArrowLeft } from 'lucide-react';
import { useApp } from '../AppContext';

type MobilePanel = 'list' | 'chat';

type ContactSelection =
  | { kind: 'group'; id: string; name: string; sub: string }
  | { kind: 'parent'; id: string; name: string; sub: string };

const Messages: React.FC = () => {
  const { students } = useApp();
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>('list');
  const [searchTerm, setSearchTerm] = useState('');
  const [selected, setSelected] = useState<ContactSelection | null>(null);

  const groupsWithCount = useMemo(() => {
    const map: Record<string, number> = {};
    students.forEach(s => { if (s.group) map[s.group] = (map[s.group] || 0) + 1; });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [students]);

  const filteredGroups = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return groupsWithCount;
    return groupsWithCount.filter(([group]) => group.toLowerCase().includes(q));
  }, [groupsWithCount, searchTerm]);

  const filteredParents = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const list = students.slice(0, 50);
    if (!q) return list;
    return list.filter(
      s =>
        (s.parentName || '').toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        (s.parentPhone || '').includes(q)
    );
  }, [students, searchTerm]);

  const activeContact = selected ?? (groupsWithCount[0]
    ? {
        kind: 'group' as const,
        id: groupsWithCount[0][0],
        name: `${groupsWithCount[0][0]} Grubu`,
        sub: `${groupsWithCount[0][1]} Katılımcı`,
      }
    : students[0]
      ? {
          kind: 'parent' as const,
          id: students[0].id,
          name: students[0].parentName || 'Veli',
          sub: `${students[0].name} velisi`,
        }
      : null);

  const selectContact = (contact: ContactSelection) => {
    setSelected(contact);
    setMobilePanel('chat');
  };

  const isGroupActive = (group: string) =>
    activeContact?.kind === 'group' && activeContact.id === group;

  const isParentActive = (id: string) =>
    activeContact?.kind === 'parent' && activeContact.id === id;

  return (
    <div className="flex flex-col min-h-0 flex-1 max-h-[calc(100dvh-5.5rem)] sm:max-h-[calc(100dvh-8rem)] lg:max-h-[calc(100vh-12rem)] animate-in fade-in slide-in-from-bottom-4 duration-700 min-w-0">
      <div className="flex flex-1 min-h-0 gap-0 lg:gap-6 pb-14 lg:pb-0">
        {/* Kişi / grup listesi */}
        <div
          className={`${mobilePanel === 'list' ? 'flex' : 'hidden'} lg:flex w-full lg:w-80 shrink-0 flex-col min-h-0 bg-[#1e293b]/90 backdrop-blur-2xl rounded-none sm:rounded-xl lg:rounded-lg border-0 sm:border border-white/5 overflow-hidden`}
        >
          <div className="p-3 sm:p-4 lg:p-6 border-b border-white/5 shrink-0">
            <div className="flex items-center gap-2 mb-3 lg:hidden">
              <MessageCircle className="w-5 h-5 text-emerald-400 shrink-0" />
              <h2 className="text-sm font-bold text-white">WhatsApp İşlemleri</h2>
            </div>
            <div className="relative group">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-400 transition-colors" />
              <input
                type="text"
                placeholder="Kişi veya grup ara..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 sm:py-3 bg-slate-900/50 border border-white/5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all placeholder:text-slate-500"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0">
            <div className="p-2 sm:p-4 space-y-1">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2 px-2 sm:px-4">Gruplar</h4>
              {filteredGroups.map(([group, count]) => (
                <ContactItem
                  key={group}
                  name={`${group} Grubu`}
                  sub={`${count} Katılımcı`}
                  icon={<Users className="w-4 h-4" />}
                  active={isGroupActive(group)}
                  onClick={() => selectContact({ kind: 'group', id: group, name: `${group} Grubu`, sub: `${count} Katılımcı` })}
                />
              ))}
              {filteredGroups.length === 0 && <p className="text-xs text-slate-500 px-4 py-2">Grup bulunamadı.</p>}

              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mt-4 mb-2 px-2 sm:px-4">Veliler</h4>
              {filteredParents.map(s => (
                <ContactItem
                  key={s.id}
                  name={s.parentName || 'Veli'}
                  sub={`${s.name} velisi`}
                  active={isParentActive(s.id)}
                  onClick={() => selectContact({ kind: 'parent', id: s.id, name: s.parentName || 'Veli', sub: `${s.name} velisi` })}
                />
              ))}
              {filteredParents.length === 0 && <p className="text-xs text-slate-500 px-4 py-2">Öğrenci bulunamadı.</p>}
            </div>
          </div>
        </div>

        {/* Sohbet alanı */}
        <div
          className={`${mobilePanel === 'chat' ? 'flex' : 'hidden'} lg:flex flex-1 min-w-0 min-h-0 flex-col bg-[#1e293b]/90 backdrop-blur-2xl rounded-none sm:rounded-xl lg:rounded-lg border-0 sm:border border-white/5 overflow-hidden`}
        >
          {activeContact ? (
            <>
              <div className="p-3 sm:p-4 lg:p-6 border-b border-white/5 flex items-center justify-between gap-2 shrink-0">
                <div className="flex items-center gap-2 sm:gap-4 min-w-0">
                  <button
                    type="button"
                    onClick={() => setMobilePanel('list')}
                    className="lg:hidden shrink-0 p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all"
                    aria-label="Listeye dön"
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                  <div className="w-10 h-10 sm:w-12 sm:h-12 bg-indigo-500/10 rounded-lg flex items-center justify-center text-indigo-400 border border-indigo-500/20 shrink-0">
                    {activeContact.kind === 'group' ? <Users className="w-5 h-5 sm:w-6 sm:h-6" /> : <User className="w-5 h-5 sm:w-6 sm:h-6" />}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-white tracking-tight text-sm sm:text-base truncate">{activeContact.name}</h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                      <p className="text-[10px] text-emerald-400 font-black uppercase tracking-widest truncate">{activeContact.sub}</p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button type="button" className="p-2 sm:p-3 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-all" aria-label="Ara">
                    <Phone className="w-5 h-5" />
                  </button>
                  <button type="button" className="p-2 sm:p-3 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-all" aria-label="Menü">
                    <MoreVertical className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="flex-1 p-4 sm:p-6 lg:p-8 space-y-5 sm:space-y-8 overflow-y-auto bg-slate-950/20 custom-scrollbar min-h-0">
                <div className="flex justify-center">
                  <span className="px-3 sm:px-4 py-1.5 bg-white/5 border border-white/5 rounded-full text-[10px] font-black text-slate-400 uppercase tracking-widest">Bugün</span>
                </div>

                <div className="flex flex-col items-start gap-2 max-w-[92%] sm:max-w-[70%] animate-in slide-in-from-left-4 duration-500">
                  <div className="flex items-center gap-2 px-2">
                    <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Sistem Duyurusu</span>
                  </div>
                  <div className="bg-white/5 border border-white/5 p-4 sm:p-5 rounded-2xl sm:rounded-3xl rounded-tl-none shadow-xl">
                    <p className="text-sm text-slate-300 leading-relaxed font-medium">
                      📢 <b>Duyuru:</b> Yarınki dersimiz saat 14:00&apos;te başlayacaktır. Lütfen hazırlıklı gelin.
                    </p>
                    <span className="text-[9px] text-slate-300 font-bold uppercase mt-3 block">10:45</span>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-2 ml-auto max-w-[92%] sm:max-w-[70%] animate-in slide-in-from-right-4 duration-500">
                  <div className="bg-indigo-600 p-4 sm:p-5 rounded-2xl sm:rounded-3xl rounded-tr-none shadow-xl shadow-indigo-600/10">
                    <p className="text-sm text-white leading-relaxed font-medium">
                      Tamam hocam, teşekkürler. Çocuklar heyecanla bekliyor.
                    </p>
                    <span className="text-[9px] text-indigo-200 font-bold uppercase mt-3 block text-right">11:02</span>
                  </div>
                </div>
              </div>

              <div className="p-3 sm:p-4 lg:p-6 bg-white/[0.02] border-t border-white/5 flex items-center gap-2 sm:gap-4 shrink-0 pb-[env(safe-area-inset-bottom)] lg:pb-3">
                <button type="button" className="hidden sm:flex p-2.5 sm:p-3 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-all shrink-0">
                  <Plus className="w-5 h-5 sm:w-6 sm:h-6" />
                </button>
                <div className="flex-1 relative min-w-0">
                  <input
                    type="text"
                    placeholder="Mesajınızı yazın..."
                    className="w-full bg-slate-900/50 border border-white/5 rounded-lg pl-4 sm:pl-6 pr-16 sm:pr-20 py-3 sm:py-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all placeholder:text-slate-500"
                  />
                  <div className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 flex items-center gap-0.5 sm:gap-2">
                    <button type="button" className="p-1.5 sm:p-2 text-slate-400 hover:text-slate-300 transition-colors">
                      <Paperclip className="w-4 h-4 sm:w-5 sm:h-5" />
                    </button>
                    <button type="button" className="p-1.5 sm:p-2 text-slate-400 hover:text-slate-300 transition-colors">
                      <Smile className="w-4 h-4 sm:w-5 sm:h-5" />
                    </button>
                  </div>
                </div>
                <button type="button" className="p-3 sm:p-4 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 transition-all shadow-lg shadow-indigo-600/20 active:scale-95 shrink-0">
                  <Send className="w-5 h-5 sm:w-6 sm:h-6" />
                </button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <MessageCircle className="w-12 h-12 text-slate-600 mb-4" />
              <p className="text-slate-400 text-sm font-medium">Sohbet başlatmak için bir grup veya veli seçin.</p>
            </div>
          )}
        </div>
      </div>

      {/* Mobil alt geçiş */}
      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 flex border-t border-white/10 bg-slate-900/95 backdrop-blur-xl pb-[env(safe-area-inset-bottom)]"
        aria-label="WhatsApp panelleri"
      >
        {([
          { id: 'list' as const, label: 'Kişiler', Icon: Users },
          { id: 'chat' as const, label: 'Sohbet', Icon: MessageCircle },
        ]).map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setMobilePanel(id)}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[52px] py-2 text-[10px] font-bold uppercase tracking-wide transition-colors ${
              mobilePanel === id ? 'text-emerald-300 bg-emerald-500/15' : 'text-slate-500'
            }`}
          >
            <Icon className="w-5 h-5" />
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
};

const ContactItem = ({
  name,
  sub,
  icon,
  active,
  onClick,
}: {
  name: string;
  sub: string;
  icon?: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`w-full flex items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-lg transition-all group min-h-[56px] ${
      active ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'hover:bg-white/5 text-slate-400'
    }`}
  >
    <div
      className={`w-10 h-10 sm:w-12 sm:h-12 rounded-lg flex items-center justify-center transition-all shrink-0 ${
        active ? 'bg-white/20 text-white' : 'bg-white/5 text-slate-400 group-hover:scale-105 group-hover:text-indigo-400'
      }`}
    >
      {icon || <User className="w-5 h-5 sm:w-6 sm:h-6" />}
    </div>
    <div className="flex-1 text-left overflow-hidden min-w-0">
      <h5 className={`text-sm font-bold truncate tracking-tight ${active ? 'text-white' : 'text-slate-200'}`}>{name}</h5>
      <p className={`text-[10px] font-black uppercase tracking-widest truncate mt-0.5 ${active ? 'text-indigo-100' : 'text-slate-500'}`}>{sub}</p>
    </div>
  </button>
);

export default Messages;
