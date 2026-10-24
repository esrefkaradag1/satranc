import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import type { MobileRole } from './api';

type StudentTab =
  | 'summary'
  | 'schedule'
  | 'messages'
  | 'notifications'
  | 'analyses'
  | 'attendance'
  | 'private-lesson'
  | 'live-lesson'
  | 'study'
  | 'puzzles'
  | 'puzzle-practice'
  | 'gallery'
  | 'leaderboard'
  | 'tournaments'
  | 'ukd'
  | 'lichess'
  | 'chesscom'
  | 'profile'
  | 'payments';

const SLUG: Record<StudentTab, string> = {
  summary: 'ozet',
  schedule: 'program',
  messages: 'mesajlar',
  notifications: 'bildirimler',
  analyses: 'analizler',
  attendance: 'yoklama',
  'private-lesson': 'ozel-ders',
  'live-lesson': 'canli-ders',
  study: 'calisma',
  puzzles: 'bulmaca',
  'puzzle-practice': 'bulmaca-coz',
  gallery: 'galeri',
  leaderboard: 'lider-tablosu',
  tournaments: 'turnuvalar',
  ukd: 'ukd',
  lichess: 'lichess',
  chesscom: 'chesscom',
  profile: 'profil',
  payments: 'odemeler',
};

const LABEL: Record<StudentTab, string> = {
  summary: 'Özet',
  schedule: 'Ders Programı',
  messages: 'Mesajlar',
  notifications: 'Bildirimler',
  analyses: 'Performans Analizi',
  attendance: 'Devam',
  'private-lesson': 'Özel Ders',
  'live-lesson': 'Canlı Derse Katıl',
  study: 'Çalışma',
  puzzles: 'Ödevler',
  'puzzle-practice': 'Bulmaca Çöz',
  gallery: 'Medya & Galeri',
  leaderboard: 'Lider Tablosu',
  tournaments: 'Turnuvalar',
  ukd: 'UKD/FIDE',
  lichess: 'Lichess',
  chesscom: 'Chess.com',
  profile: 'Profil',
  payments: 'Aidat ve Ödemeler',
};

const MENU: Array<{ title: string; items: Array<{ id: StudentTab; icon: keyof typeof Ionicons.glyphMap }> }> = [
  {
    title: 'Genel',
    items: [
      { id: 'summary', icon: 'home-outline' },
      { id: 'schedule', icon: 'calendar-outline' },
      { id: 'messages', icon: 'chatbubbles-outline' },
      { id: 'notifications', icon: 'notifications-outline' },
      { id: 'analyses', icon: 'stats-chart-outline' },
    ],
  },
  { title: 'Yoklama', items: [{ id: 'attendance', icon: 'checkmark-done-outline' }] },
  { title: 'Özel Ders', items: [{ id: 'private-lesson', icon: 'school-outline' }] },
  {
    title: 'Eğitim',
    items: [
      { id: 'live-lesson', icon: 'videocam-outline' },
      { id: 'study', icon: 'book-outline' },
      { id: 'puzzles', icon: 'extension-puzzle-outline' },
      { id: 'puzzle-practice', icon: 'bulb-outline' },
      { id: 'analyses', icon: 'analytics-outline' },
      { id: 'gallery', icon: 'images-outline' },
    ],
  },
  {
    title: 'Performans',
    items: [
      { id: 'leaderboard', icon: 'trophy-outline' },
      { id: 'tournaments', icon: 'ribbon-outline' },
      { id: 'ukd', icon: 'medal-outline' },
      { id: 'lichess', icon: 'link-outline' },
      { id: 'chesscom', icon: 'globe-outline' },
    ],
  },
  {
    title: 'Hesap',
    items: [
      { id: 'profile', icon: 'person-outline' },
      { id: 'payments', icon: 'wallet-outline' },
    ],
  },
];

const DOCK: Array<{ id: StudentTab; label: string; icon: keyof typeof Ionicons.glyphMap; iconOn: keyof typeof Ionicons.glyphMap }> = [
  { id: 'summary', label: 'Özet', icon: 'home-outline', iconOn: 'home' },
  { id: 'schedule', label: 'Program', icon: 'calendar-outline', iconOn: 'calendar' },
  { id: 'study', label: 'Çalışma', icon: 'book-outline', iconOn: 'book' },
  { id: 'messages', label: 'Mesaj', icon: 'chatbubbles-outline', iconOn: 'chatbubbles' },
];

function tabFromUrl(url: string): StudentTab | null {
  const hash = url.split('#')[1]?.replace(/^\//, '') ?? '';
  const slug = hash.split('?')[0]?.split('/')[0] ?? '';
  const found = (Object.keys(SLUG) as StudentTab[]).find((id) => SLUG[id] === slug);
  return found ?? null;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toLocaleUpperCase('tr') ?? '').join('') || 'S';
}

type Props = {
  apiBase: string;
  role: MobileRole;
  studentId: string;
  name: string;
  onLogout: () => void;
};

export default function StudentShell({ apiBase, role, studentId, name, onLogout }: Props) {
  const webRef = useRef<WebView>(null);
  const tabRef = useRef<StudentTab>('summary');
  const [tab, setTab] = useState<StudentTab>('summary');
  const [menuOpen, setMenuOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState('');
  const base = apiBase.trim().replace(/\/+$/, '');
  const authJson = JSON.stringify({ role, studentId, user: { id: studentId } });
  const beforeLoad = `try{localStorage.setItem('netchess_auth', ${JSON.stringify(authJson)});}catch(e){}true;`;

  const openTab = (id: StudentTab) => {
    tabRef.current = id;
    setTab(id);
    setMenuOpen(false);
    webRef.current?.injectJavaScript(`window.location.hash=${JSON.stringify(`#/${SLUG[id]}`)};true;`);
  };

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <View style={styles.avatar}><Text style={styles.avatarText}>{initials(name)}</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={1}>{name}</Text>
          <Text style={styles.page}>{LABEL[tab]}</Text>
        </View>
        <Pressable hitSlop={10} onPress={() => webRef.current?.reload()} style={styles.iconBtn}>
          <Ionicons name="refresh" size={20} color="#C7D2FE" />
        </Pressable>
        <Pressable hitSlop={10} onPress={onLogout} style={styles.iconBtn}>
          <Ionicons name="log-out-outline" size={22} color="#C7D2FE" />
        </Pressable>
      </View>

      <View style={styles.stage}>
        {failed ? (
          <View style={styles.fail}>
            <Text style={styles.failTitle}>Sayfa açılamadı</Text>
            <Text style={styles.failBody}>{failed}</Text>
            <Pressable style={styles.retry} onPress={() => { setFailed(''); setReady(false); webRef.current?.reload(); }}>
              <Text style={styles.retryText}>Yeniden dene</Text>
            </Pressable>
          </View>
        ) : (
          <WebView
            ref={webRef}
            source={{ uri: `${base}/?embed=app#/${SLUG.summary}` }}
            injectedJavaScriptBeforeContentLoaded={beforeLoad}
            onLoadEnd={() => {
              setReady(true);
              webRef.current?.injectJavaScript(`window.location.hash=${JSON.stringify(`#/${SLUG[tabRef.current]}`)};true;`);
            }}
            onError={(event) => setFailed(event.nativeEvent.description || 'Sunucuya ulaşılamadı')}
            onHttpError={(event) => {
              if (event.nativeEvent.statusCode >= 400) setFailed(`Sunucu ${event.nativeEvent.statusCode} döndü`);
            }}
            onNavigationStateChange={(nav) => {
              const next = tabFromUrl(nav.url);
              if (!next || next === tabRef.current) return;
              tabRef.current = next;
              setTab(next);
            }}
            style={styles.web}
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            allowsFullscreenVideo
            javaScriptEnabled
            domStorageEnabled
            sharedCookiesEnabled
            setSupportMultipleWindows={false}
            originWhitelist={['*']}
            mediaCapturePermissionGrantType="grant"
          />
        )}
        {!ready && !failed ? (
          <View style={styles.loading}>
            <ActivityIndicator color="#A5B4FC" />
            <Text style={styles.loadingText}>Panel hazırlanıyor</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.dock}>
        {DOCK.map((item) => {
          const on = tab === item.id && !menuOpen;
          return (
            <Pressable key={item.id} style={styles.dockItem} onPress={() => openTab(item.id)}>
              <Ionicons name={on ? item.iconOn : item.icon} size={22} color={on ? '#A5B4FC' : '#64748B'} />
              <Text style={[styles.dockLabel, on && styles.dockLabelOn]}>{item.label}</Text>
            </Pressable>
          );
        })}
        <Pressable style={styles.dockItem} onPress={() => setMenuOpen(true)}>
          <Ionicons name={menuOpen ? 'grid' : 'grid-outline'} size={22} color={menuOpen ? '#A5B4FC' : '#64748B'} />
          <Text style={[styles.dockLabel, menuOpen && styles.dockLabelOn]}>Menü</Text>
        </Pressable>
      </View>

      <Modal visible={menuOpen} animationType="slide" transparent onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setMenuOpen(false)} />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitle}>Menü</Text>
            <Pressable hitSlop={10} onPress={() => setMenuOpen(false)}>
              <Ionicons name="close" size={22} color="#94A3B8" />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ paddingBottom: 28 }}>
            {MENU.map((section) => (
              <View key={section.title} style={styles.section}>
                <Text style={styles.sectionTitle}>{section.title}</Text>
                {section.items.map((item) => {
                  const on = tab === item.id;
                  return (
                    <Pressable key={`${section.title}-${item.id}-${item.icon}`} style={[styles.row, on && styles.rowOn]} onPress={() => openTab(item.id)}>
                      <View style={[styles.rowIcon, on && styles.rowIconOn]}>
                        <Ionicons name={item.icon} size={18} color={on ? '#E0E7FF' : '#A5B4FC'} />
                      </View>
                      <Text style={[styles.rowLabel, on && styles.rowLabelOn]}>{LABEL[item.id]}</Text>
                      <Ionicons name="chevron-forward" size={16} color="#475569" />
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#070B14' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: '#312E81',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#E0E7FF', fontWeight: '800' },
  name: { color: '#F8FAFC', fontSize: 16, fontWeight: '800' },
  page: { color: '#A5B4FC', fontSize: 12, marginTop: 1, fontWeight: '600' },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: '#12182A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stage: { flex: 1, backgroundColor: '#020617' },
  web: { flex: 1, backgroundColor: '#020617' },
  loading: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#070B14',
    gap: 10,
  },
  loadingText: { color: '#94A3B8' },
  fail: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 8 },
  failTitle: { color: '#F8FAFC', fontSize: 18, fontWeight: '800' },
  failBody: { color: '#94A3B8', textAlign: 'center', lineHeight: 20 },
  retry: { marginTop: 8, backgroundColor: '#4F46E5', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12 },
  retryText: { color: '#FFFFFF', fontWeight: '800' },
  dock: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    backgroundColor: '#0E1424',
    paddingTop: 8,
    paddingBottom: 6,
  },
  dockItem: { flex: 1, alignItems: 'center', gap: 3, minHeight: 48, justifyContent: 'center' },
  dockLabel: { color: '#64748B', fontSize: 11, fontWeight: '700' },
  dockLabelOn: { color: '#A5B4FC' },
  backdrop: { flex: 1, backgroundColor: 'rgba(2,6,23,0.55)' },
  sheet: {
    maxHeight: '78%',
    backgroundColor: '#0E1424',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  sheetHandle: { alignSelf: 'center', width: 42, height: 4, borderRadius: 4, backgroundColor: '#334155', marginBottom: 8 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  sheetTitle: { color: '#F8FAFC', fontSize: 20, fontWeight: '800' },
  section: { marginBottom: 12 },
  sectionTitle: { color: '#64748B', fontSize: 12, fontWeight: '800', letterSpacing: 0.4, marginBottom: 6, marginLeft: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#12182A',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
  },
  rowOn: { borderColor: '#4F46E5', backgroundColor: '#1E1B4B' },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: '#1E1B4B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowIconOn: { backgroundColor: '#4338CA' },
  rowLabel: { flex: 1, color: '#E2E8F0', fontSize: 15, fontWeight: '700' },
  rowLabelOn: { color: '#FFFFFF' },
});
