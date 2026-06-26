import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import {
  formatSiteMessageDay,
  formatSiteMessageTime,
  isOutgoingSiteMessage,
  isSiteMessagesRemoteUnavailable,
  listSiteMessages,
  resetSiteMessagesRemoteProbe,
  sendSiteMessage,
  subscribeSiteMessages,
  type SiteConversationKind,
  type SiteMessage,
  type SiteMessageSenderRole,
} from '../lib/siteMessaging';

export type SiteMessagingChatProps = {
  conversationId: string;
  kind: SiteConversationKind;
  targetStudentId?: string;
  targetGroup?: string;
  senderRole: SiteMessageSenderRole;
  senderName: string;
  emptyHint?: string;
  className?: string;
};

const SiteMessagingChat: React.FC<SiteMessagingChatProps> = ({
  conversationId,
  kind,
  targetStudentId,
  targetGroup,
  senderRole,
  senderName,
  emptyHint = 'Henüz mesaj yok. İlk mesajı gönderin.',
  className = '',
}) => {
  const [messages, setMessages] = useState<SiteMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remoteUnavailable, setRemoteUnavailable] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const reload = useCallback(async () => {
    const list = await listSiteMessages(conversationId);
    setMessages(list);
    setLoading(false);
    setRemoteUnavailable(isSiteMessagesRemoteUnavailable());
  }, [conversationId]);

  useEffect(() => {
    setLoading(true);
    void reload();
    return subscribeSiteMessages(() => {
      void reload();
    });
  }, [reload]);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length, conversationId]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    const sent = await sendSiteMessage({
      conversationId,
      kind,
      targetStudentId,
      targetGroup,
      senderRole,
      senderName,
      text,
    });
    setSending(false);
    if (!sent) {
      setError('Mesaj gönderilemedi.');
      return;
    }
    if (!sent.synced) {
      setRemoteUnavailable(isSiteMessagesRemoteUnavailable());
      setError(
        isSiteMessagesRemoteUnavailable()
          ? 'Mesaj yalnızca bu cihazda görünür. Supabase\'de site_messages tablosu eksik — proje kökündeki supabase_site_messages.sql dosyasını SQL Editor\'de çalıştırın.'
          : 'Mesaj bu cihazda kaydedildi; sunucuya iletilemedi.',
      );
    }
    setInput('');
    await reload();
  };

  let lastDay = '';

  return (
    <div className={`flex flex-col min-h-0 flex-1 ${className}`}>
      {remoteUnavailable ? (
        <div className="mx-4 mt-3 p-3 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-100 text-xs leading-relaxed shrink-0">
          <p className="font-bold mb-1">Sunucu senkronu kapalı</p>
          <p>
            Supabase&apos;de <code className="text-amber-200">site_messages</code> tablosu yok. SQL Editor&apos;de{' '}
            <code className="text-amber-200">supabase_site_messages.sql</code> dosyasını çalıştırın, ardından sayfayı yenileyin.
          </p>
          <button
            type="button"
            onClick={() => {
              resetSiteMessagesRemoteProbe();
              void reload();
            }}
            className="mt-2 px-2.5 py-1 rounded-md bg-amber-500/20 hover:bg-amber-500/30 text-amber-50 font-semibold"
          >
            Tekrar dene
          </button>
        </div>
      ) : null}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 space-y-4 custom-scrollbar bg-slate-950/20">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-slate-500 text-sm gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Mesajlar yükleniyor…
          </div>
        ) : messages.length === 0 ? (
          <p className="text-center text-sm text-slate-500 py-12">{emptyHint}</p>
        ) : (
          messages.map((msg) => {
            const day = formatSiteMessageDay(msg.createdAt);
            const showDay = day !== lastDay;
            if (showDay) lastDay = day;
            const outgoing = isOutgoingSiteMessage(msg, senderRole);
            return (
              <React.Fragment key={msg.id}>
                {showDay ? (
                  <div className="flex justify-center">
                    <span className="px-3 py-1.5 bg-white/5 border border-white/5 rounded-full text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      {day}
                    </span>
                  </div>
                ) : null}
                <div className={`flex flex-col gap-1 max-w-[92%] sm:max-w-[75%] ${outgoing ? 'ml-auto items-end' : 'items-start'}`}>
                  {!outgoing ? (
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-1">
                      {msg.senderName}
                    </span>
                  ) : null}
                  <div
                    className={`p-3.5 sm:p-4 rounded-2xl shadow-lg ${
                      outgoing
                        ? 'bg-indigo-600 text-white rounded-tr-none shadow-indigo-600/10'
                        : 'bg-white/5 border border-white/5 text-slate-200 rounded-tl-none'
                    }`}
                  >
                    <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{msg.text}</p>
                    <span
                      className={`text-[9px] font-bold uppercase mt-2 block ${
                        outgoing ? 'text-indigo-200 text-right' : 'text-slate-500'
                      }`}
                    >
                      {formatSiteMessageTime(msg.createdAt)}
                    </span>
                  </div>
                </div>
              </React.Fragment>
            );
          })
        )}
      </div>

      <div className="p-3 sm:p-4 bg-white/[0.02] border-t border-white/5 flex items-center gap-2 sm:gap-3 shrink-0">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void handleSend();
            }
          }}
          placeholder="Mesajınızı yazın…"
          maxLength={2000}
          className="flex-1 min-w-0 bg-slate-900/50 border border-white/5 rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 placeholder:text-slate-500"
        />
        <button
          type="button"
          onClick={() => void handleSend()}
          disabled={sending || !input.trim()}
          className="p-3 sm:p-3.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 transition-all shadow-lg shadow-indigo-600/20 active:scale-95 shrink-0 disabled:opacity-50"
          aria-label="Gönder"
        >
          {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
        </button>
      </div>
      {error ? <p className="px-4 pb-2 text-xs text-rose-400">{error}</p> : null}
    </div>
  );
};

export default SiteMessagingChat;
