import React, { useMemo, useState } from 'react';
import { MessageCircle, User, Users } from 'lucide-react';
import SiteMessagingChat from './SiteMessagingChat';
import { groupConversationId, parentConversationId, studentConversationId } from '../lib/siteMessaging';

type StudentMessagesPanelProps = {
  studentId: string;
  studentName: string;
  parentName?: string;
  groupName?: string;
  viewAs: 'parent' | 'student';
};

type ThreadTab = 'coach' | 'group';

const StudentMessagesPanel: React.FC<StudentMessagesPanelProps> = ({
  studentId,
  studentName,
  parentName,
  groupName,
  viewAs,
}) => {
  const [thread, setThread] = useState<ThreadTab>('coach');
  const coachConvId = viewAs === 'student' ? studentConversationId(studentId) : parentConversationId(studentId);
  const coachKind = viewAs === 'student' ? 'student' as const : 'parent' as const;
  const groupConvId = groupName ? groupConversationId(groupName) : null;

  const senderRole = viewAs === 'parent' ? 'parent' : 'student';
  const senderName = viewAs === 'parent' ? parentName || 'Veli' : studentName;

  const header = useMemo(() => {
    if (thread === 'group' && groupName) {
      return { title: `${groupName} Grubu`, sub: 'Grup sohbeti', icon: <Users className="w-5 h-5" /> };
    }
    return { title: 'Antrenör', sub: `${studentName} · özel mesaj`, icon: <User className="w-5 h-5" /> };
  }, [thread, groupName, studentName]);

  return (
    <div className="flex flex-col min-h-[calc(100dvh-10rem)] max-h-[calc(100dvh-8rem)] rounded-2xl border border-white/10 bg-[#1e293b]/90 overflow-hidden">
      <div className="p-4 sm:p-5 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-11 h-11 rounded-xl bg-indigo-500/15 border border-indigo-500/25 flex items-center justify-center text-indigo-300">
            <MessageCircle className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Mesajlar</h2>
            <p className="text-xs text-slate-400">Antrenör ile site içi anlık iletişim</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setThread('coach')}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wide border transition-colors ${
              thread === 'coach'
                ? 'bg-indigo-600 border-indigo-500 text-white'
                : 'bg-slate-800/60 border-white/10 text-slate-300 hover:border-indigo-500/30'
            }`}
          >
            Antrenör
          </button>
          {groupConvId && groupName ? (
            <button
              type="button"
              onClick={() => setThread('group')}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wide border transition-colors ${
                thread === 'group'
                  ? 'bg-indigo-600 border-indigo-500 text-white'
                  : 'bg-slate-800/60 border-white/10 text-slate-300 hover:border-indigo-500/30'
              }`}
            >
              Grup
            </button>
          ) : null}
        </div>
      </div>

      <div className="px-4 py-3 border-b border-white/5 flex items-center gap-3 shrink-0 bg-slate-900/30">
        <div className="w-10 h-10 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-300 shrink-0">
          {header.icon}
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-white truncate">{header.title}</p>
          <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest truncate">{header.sub}</p>
        </div>
      </div>

      {thread === 'group' && groupConvId && groupName ? (
        <SiteMessagingChat
          conversationId={groupConvId}
          kind="group"
          targetGroup={groupName}
          senderRole={senderRole}
          senderName={senderName}
          emptyHint="Grup mesajları burada görünür."
          className="min-h-[24rem]"
        />
      ) : (
        <SiteMessagingChat
          conversationId={coachConvId}
          kind={coachKind}
          targetStudentId={studentId}
          senderRole={senderRole}
          senderName={senderName}
          emptyHint="Antrenöre mesaj yazın; yanıt burada görünür."
          className="min-h-[24rem]"
        />
      )}
    </div>
  );
};

export default StudentMessagesPanel;
