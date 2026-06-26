import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { MessageCircle, User, Users, Search, MoreVertical, ArrowLeft, GraduationCap } from 'lucide-react';
import { useApp } from '../AppContext';
import SiteMessagingChat from './SiteMessagingChat';
import {
  groupConversationId,
  listAllSiteMessages,
  parentConversationId,
  studentConversationId,
  subscribeSiteMessages,
  type SiteMessage,
} from '../lib/siteMessaging';

type MobilePanel = 'list' | 'chat';

type ContactSelection =
  | { kind: 'group'; id: string; name: string; sub: string; groupName: string }
  | { kind: 'parent'; id: string; name: string; sub: string; studentId: string }
  | { kind: 'student'; id: string; name: string; sub: string; studentId: string };

function resolveSenderRole(authRole: string | undefined): 'admin' | 'coach' | 'parent' {
  if (authRole === 'coach') return 'coach';
  if (authRole === 'admin') return 'admin';
  return 'admin';
}

const Messages: React.FC = () => {
  const { scopedStudents: students, auth } = useApp();
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>('list');
  const [searchTerm, setSearchTerm] = useState('');
  const [selected, setSelected] = useState<ContactSelection | null>(null);
  const [allMessages, setAllMessages] = useState<SiteMessage[]>([]);

  const senderRole = resolveSenderRole(auth?.role);
  const senderName =
    auth?.role === 'coach' ? auth.coachName || 'Antrenör' : auth?.role === 'admin' ? 'Antrenör' : 'Antrenör';

  const reloadMessages = useCallback(async () => {
    const list = await listAllSiteMessages();
    setAllMessages(list);
  }, []);

  useEffect(() => {
    void reloadMessages();
    return subscribeSiteMessages(() => {
      void reloadMessages();
    });
  }, [reloadMessages]);

  const lastMessageByConversation = useMemo(() => {
    const map = new Map<string, SiteMessage>();
    for (const m of allMessages) {
      map.set(m.conversationId, m);
    }
    return map;
  }, [allMessages]);

  const groupsWithCount = useMemo(() => {
    const map: Record<string, number> = {};
    students.forEach((s) => {
      if (s.group) map[s.group] = (map[s.group] || 0) + 1;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [students]);

  const filteredGroups = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return groupsWithCount;
    return groupsWithCount.filter(([group]) => group.toLowerCase().includes(q));
  }, [groupsWithCount, searchTerm]);

  const filteredParents = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const list = students.filter((s) => s.parentName || s.parentPhone);
    if (!q) return list;
    return list.filter(
      (s) =>
        (s.parentName || '').toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        (s.parentPhone || '').includes(q),
    );
  }, [students, searchTerm]);

  const filteredStudents = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const list = students.filter((s) => s.status !== 'inactive');
    if (!q) return list;
    return list.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.group || '').toLowerCase().includes(q) ||
        (s.parentName || '').toLowerCase().includes(q),
    );
  }, [students, searchTerm]);

  const defaultContact = useMemo((): ContactSelection | null => {
    if (filteredStudents[0]) {
      const s = filteredStudents[0];
      return {
        kind: 'student',
        id: studentConversationId(s.id),
        studentId: s.id,
        name: s.name,
        sub: s.group ? `${s.group} · öğrenci` : 'Öğrenci',
      };
    }
    if (filteredParents[0]) {
      const s = filteredParents[0];
      return {
        kind: 'parent',
        id: parentConversationId(s.id),
        studentId: s.id,
        name: s.parentName || 'Veli',
        sub: `${s.name} velisi`,
      };
    }
    if (groupsWithCount[0]) {
      const [group, count] = groupsWithCount[0];
      return {
        kind: 'group',
        id: groupConversationId(group),
        groupName: group,
        name: `${group} Grubu`,
        sub: `${count} katılımcı`,
      };
    }
    return null;
  }, [filteredParents, filteredStudents, groupsWithCount]);

  const activeContact = selected ?? defaultContact;

  const selectContact = (contact: ContactSelection) => {
    setSelected(contact);
    setMobilePanel('chat');
  };

  const previewForConversation = (conversationId: string) =>
    lastMessageByConversation.get(conversationId)?.text ?? 'Henüz mesaj yok';

  return (
    <div className="flex flex-col min-h-0 flex-1 max-h-[calc(100dvh-5.5rem)] sm:max-h-[calc(100dvh-8rem)] lg:max-h-[calc(100vh-12rem)] animate-in fade-in slide-in-from-bottom-4 duration-700 min-w-0">
      <div className="flex flex-1 min-h-0 gap-0 lg:gap-6 pb-14 lg:pb-0">
        <div
          className={`${mobilePanel === 'list' ? 'flex' : 'hidden'} lg:flex w-full lg:w-80 shrink-0 flex-col min-h-0 bg-[#1e293b]/90 backdrop-blur-2xl rounded-none sm:rounded-xl lg:rounded-lg border-0 sm:border border-white/5 overflow-hidden`}
        >
          <div className="p-3 sm:p-4 lg:p-6 border-b border-white/5 shrink-0">
            <div className="flex items-center gap-2 mb-3 lg:hidden">
              <MessageCircle className="w-5 h-5 text-indigo-400 shrink-0" />
              <h2 className="text-sm font-bold text-white">Site İçi Mesajlaşma</h2>
            </div>
            <div className="relative group">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-400 transition-colors" />
              <input
                type="text"
                placeholder="Kişi veya grup ara…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 sm:py-3 bg-slate-900/50 border border-white/5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all placeholder:text-slate-500"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0">
            <div className="p-2 sm:p-4 space-y-1">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2 px-2 sm:px-4">
                Gruplar
              </h4>
              {filteredGroups.map(([group, count]) => {
                const convId = groupConversationId(group);
                return (
                  <ContactItem
                    key={group}
                    name={`${group} Grubu`}
                    sub={`${count} katılımcı`}
                    preview={previewForConversation(convId)}
                    icon={<Users className="w-4 h-4" />}
                    active={activeContact?.id === convId}
                    onClick={() =>
                      selectContact({
                        kind: 'group',
                        id: convId,
                        groupName: group,
                        name: `${group} Grubu`,
                        sub: `${count} katılımcı`,
                      })
                    }
                  />
                );
              })}
              {filteredGroups.length === 0 && <p className="text-xs text-slate-500 px-4 py-2">Grup bulunamadı.</p>}

              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mt-4 mb-2 px-2 sm:px-4">
                Öğrenciler
              </h4>
              {filteredStudents.map((s) => {
                const convId = studentConversationId(s.id);
                return (
                  <ContactItem
                    key={`student-${s.id}`}
                    name={s.name}
                    sub={s.group ? `${s.group} · öğrenci` : 'Öğrenci'}
                    preview={previewForConversation(convId)}
                    icon={<GraduationCap className="w-4 h-4" />}
                    active={activeContact?.id === convId}
                    onClick={() =>
                      selectContact({
                        kind: 'student',
                        id: convId,
                        studentId: s.id,
                        name: s.name,
                        sub: s.group ? `${s.group} · öğrenci` : 'Öğrenci',
                      })
                    }
                  />
                );
              })}
              {filteredStudents.length === 0 && <p className="text-xs text-slate-500 px-4 py-2">Öğrenci bulunamadı.</p>}

              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mt-4 mb-2 px-2 sm:px-4">
                Veliler
              </h4>
              {filteredParents.map((s) => {
                const convId = parentConversationId(s.id);
                return (
                  <ContactItem
                    key={s.id}
                    name={s.parentName || 'Veli'}
                    sub={`${s.name} velisi`}
                    preview={previewForConversation(convId)}
                    active={activeContact?.id === convId}
                    onClick={() =>
                      selectContact({
                        kind: 'parent',
                        id: convId,
                        studentId: s.id,
                        name: s.parentName || 'Veli',
                        sub: `${s.name} velisi`,
                      })
                    }
                  />
                );
              })}
              {filteredParents.length === 0 && <p className="text-xs text-slate-500 px-4 py-2">Veli bulunamadı.</p>}
            </div>
          </div>
        </div>

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
                    {activeContact.kind === 'group' ? (
                      <Users className="w-5 h-5 sm:w-6 sm:h-6" />
                    ) : activeContact.kind === 'student' ? (
                      <GraduationCap className="w-5 h-5 sm:w-6 sm:h-6" />
                    ) : (
                      <User className="w-5 h-5 sm:w-6 sm:h-6" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-white tracking-tight text-sm sm:text-base truncate">
                      {activeContact.name}
                    </h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                      <p className="text-[10px] text-emerald-400 font-black uppercase tracking-widest truncate">
                        {activeContact.sub} · Site içi
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    className="p-2 sm:p-3 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-all"
                    aria-label="Menü"
                  >
                    <MoreVertical className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <SiteMessagingChat
                key={activeContact.id}
                conversationId={activeContact.id}
                kind={activeContact.kind}
                targetStudentId={
                  activeContact.kind === 'parent' || activeContact.kind === 'student'
                    ? activeContact.studentId
                    : undefined
                }
                targetGroup={activeContact.kind === 'group' ? activeContact.groupName : undefined}
                senderRole={senderRole}
                senderName={senderName}
                emptyHint={
                  activeContact.kind === 'group'
                    ? 'Gruba duyuru veya mesaj gönderin. Veliler grup sohbetini panelinden görür.'
                    : activeContact.kind === 'student'
                      ? 'Öğrenciye site içi mesaj gönderin. Yanıt öğrenci panelinden gelir.'
                      : 'Veliye site içi mesaj gönderin. Yanıt veli panelinden gelir.'
                }
              />
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <MessageCircle className="w-12 h-12 text-slate-600 mb-4" />
              <p className="text-slate-400 text-sm font-medium">Sohbet başlatmak için bir grup, öğrenci veya veli seçin.</p>
            </div>
          )}
        </div>
      </div>

      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 flex border-t border-white/10 bg-slate-900/95 backdrop-blur-xl pb-[env(safe-area-inset-bottom)]"
        aria-label="Mesajlaşma panelleri"
      >
        {(
          [
            { id: 'list' as const, label: 'Kişiler', Icon: Users },
            { id: 'chat' as const, label: 'Sohbet', Icon: MessageCircle },
          ] as const
        ).map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setMobilePanel(id)}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[52px] py-2 text-[10px] font-bold uppercase tracking-wide transition-colors ${
              mobilePanel === id ? 'text-indigo-300 bg-indigo-500/15' : 'text-slate-500'
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
  preview,
  icon,
  active,
  onClick,
}: {
  name: string;
  sub: string;
  preview?: string;
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
      <h5 className={`text-sm font-bold truncate tracking-tight ${active ? 'text-white' : 'text-slate-200'}`}>
        {name}
      </h5>
      <p
        className={`text-[10px] font-black uppercase tracking-widest truncate mt-0.5 ${
          active ? 'text-indigo-100' : 'text-slate-500'
        }`}
      >
        {sub}
      </p>
      {preview ? (
        <p className={`text-[11px] truncate mt-1 ${active ? 'text-indigo-100/90' : 'text-slate-500'}`}>{preview}</p>
      ) : null}
    </div>
  </button>
);

export default Messages;
