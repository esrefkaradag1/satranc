import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { fetchHome, fetchNotifications, loginAccount, registerPushToken, type HomeSnapshot, type MobileRole, type PanelNotification, type StudentSession } from './src/api';
import StudentShell from './src/StudentShell';
import { ensureNotificationPermission, readExpoPushToken, showLocalNotification } from './src/push';

const ROLES: { id: MobileRole; label: string }[] = [
  { id: 'student', label: 'Öğrenci' },
  { id: 'parent', label: 'Veli' },
  { id: 'coach', label: 'Antrenör' },
  { id: 'club', label: 'Kulüp' },
  { id: 'admin', label: 'Yönetim' },
];

const ROLE_HINT: Record<MobileRole, string> = {
  student: 'Öğrenci no, kullanıcı adı veya telefon',
  parent: 'Öğrenci no, kullanıcı adı veya telefon',
  coach: 'E-posta, ad soyad veya telefon',
  club: 'Kulüp kullanıcı adı',
  admin: 'Yönetim hesabı için sadece şifre',
};
const SESSION_KEY = 'satrancedu.session';
const API_KEY = 'satrancedu.apiBase';
function devMachineApiBase() {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (fromEnv && !/127\.0\.0\.1|localhost/.test(fromEnv)) return fromEnv.replace(/\/+$/, '');
  const hostUri = Constants.expoConfig?.hostUri || Constants.expoGoConfig?.debuggerHost || '';
  const host = hostUri.split(':')[0];
  if (host && host !== 'localhost' && host !== '127.0.0.1') return `http://${host}:3000`;
  return fromEnv || 'http://127.0.0.1:3000';
}

const DEFAULT_API = devMachineApiBase();

type Saved = StudentSession & { apiBase: string };

function formatWhen(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function App() {
  const [booting, setBooting] = useState(true);
  const [apiBase, setApiBase] = useState(DEFAULT_API);
  const [loginId, setLoginId] = useState('');
  const [pin, setPin] = useState('');
  const [role, setRole] = useState<MobileRole>('student');
  const [session, setSession] = useState<Saved | null>(null);
  const [home, setHome] = useState<HomeSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pushNote, setPushNote] = useState('');
  const [items, setItems] = useState<PanelNotification[]>([]);
  const seenIds = useRef<Set<string>>(new Set());
  const primed = useRef(false);

  useEffect(() => {
    void (async () => {
      const [savedApi, raw] = await Promise.all([
        AsyncStorage.getItem(API_KEY),
        AsyncStorage.getItem(SESSION_KEY),
      ]);
      if (savedApi && !/127\.0\.0\.1|localhost/.test(savedApi)) setApiBase(savedApi);
      else setApiBase(devMachineApiBase());
      if (raw) {
        try { setSession(JSON.parse(raw) as Saved); } catch { /* ignore */ }
      }
      setBooting(false);
    })();
  }, []);

  const refresh = useCallback(async (current: Saved, announce: boolean) => {
    if (!current.studentId) {
      setItems([]);
      return;
    }
    const list = await fetchNotifications(current.apiBase, current.studentId);
    if (announce && primed.current) {
      const fresh = list.filter((n) => !n.read && !seenIds.current.has(n.id));
      if (fresh[0]) {
        await showLocalNotification(fresh[0].title, fresh[0].body);
      }
    }
    seenIds.current = new Set(list.map((n) => n.id));
    primed.current = true;
    setItems(list);
  }, []);

  useEffect(() => {
    if (!session?.studentId) return;
    let stop = false;
    const run = async () => {
      try {
        await refresh(session, true);
        if (!stop) setError('');
      } catch (err) {
        if (!stop) setError(err instanceof Error ? err.message : 'Bildirimler alınamadı');
      }
    };
    void run();
    const timer = setInterval(() => { void run(); }, 20000);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void run();
    });
    return () => {
      stop = true;
      clearInterval(timer);
      sub.remove();
    };
  }, [session, refresh]);

  useEffect(() => {
    if (!session) return;
    let stop = false;
    void fetchHome(session.apiBase, session)
      .then((snap) => { if (!stop) setHome(snap); })
      .catch((err) => { if (!stop) setError(err instanceof Error ? err.message : 'Kayıtlar alınamadı'); });
    return () => { stop = true; };
  }, [session]);

  useEffect(() => {
    const studentId = session?.studentId;
    if (!session || !studentId) return;
    void (async () => {
      const ok = await ensureNotificationPermission();
      if (!ok) {
        setPushNote('Bildirim izni kapalı. Ayarlardan açınca ders uyarıları telefona düşer.');
        return;
      }
      try {
        const token = await readExpoPushToken();
        if (!token) {
          setPushNote('Uygulama açıkken yeni bildirimler telefona düşer. Arka plan push için Expo proje kimliği gerekir.');
          return;
        }
        await registerPushToken(session.apiBase, studentId, token, Platform.OS);
        setPushNote('Telefon kaydı tamam. Ders, yoklama ve antrenman uyarıları bu cihaza gelir.');
      } catch (err) {
        setPushNote(err instanceof Error ? err.message : 'Push kaydı başarısız');
      }
    })();
  }, [session]);

  const onLogin = async () => {
    setBusy(true);
    setError('');
    try {
      const next = await loginAccount(apiBase, role, loginId, pin);
      const saved: Saved = { ...next, apiBase: apiBase.trim() };
      await AsyncStorage.multiSet([
        [SESSION_KEY, JSON.stringify(saved)],
        [API_KEY, saved.apiBase],
      ]);
      primed.current = false;
      seenIds.current = new Set();
      setHome(null);
      setSession(saved);
      setPin('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Giriş başarısız');
    } finally {
      setBusy(false);
    }
  };

  const onLogout = async () => {
    await AsyncStorage.removeItem(SESSION_KEY);
    setSession(null);
    setHome(null);
    setItems([]);
    setPushNote('');
    primed.current = false;
  };

  if (booting) {
    return (
      <SafeAreaView style={styles.screen}>
        <ActivityIndicator color="#5eead4" />
      </SafeAreaView>
    );
  }

  if (!session) {
    return (
      <SafeAreaView style={styles.screen}>
        <StatusBar style="light" />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.loginWrap}>
          <Text style={styles.brand}>SatrançEdu</Text>
          <Text style={styles.lead}>Webdeki hesaplarla giriş. Öğrenci, veli, antrenör, kulüp ve yönetim aynı veritabanını kullanır.</Text>
          <View style={styles.roles}>
            {ROLES.map((item) => (
              <Pressable key={item.id} onPress={() => setRole(item.id)} style={[styles.role, role === item.id && styles.roleOn]}>
                <Text style={[styles.roleText, role === item.id && styles.roleTextOn]}>{item.label}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.label}>Sunucu</Text>
          <TextInput
            value={apiBase}
            onChangeText={setApiBase}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
            placeholder="http://192.168.1.20:3000"
            placeholderTextColor="#64748b"
          />
          {role !== 'admin' ? (
            <>
              <Text style={styles.label}>{ROLE_HINT[role]}</Text>
              <TextInput
                value={loginId}
                onChangeText={setLoginId}
                autoCapitalize="none"
                style={styles.input}
                placeholder={role === 'coach' ? 'antrenor@kulup.com' : role === 'club' ? 'kulup-adi' : 'Örn. 1042'}
                placeholderTextColor="#64748b"
              />
            </>
          ) : null}
          <Text style={styles.label}>{role === 'admin' ? 'Yönetim şifresi' : 'Webdeki şifre / PIN'}</Text>
          <TextInput
            value={pin}
            onChangeText={setPin}
            secureTextEntry
            style={styles.input}
            placeholder="••••"
            placeholderTextColor="#64748b"
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable style={styles.primary} onPress={() => { void onLogin(); }} disabled={busy}>
            {busy ? <ActivityIndicator color="#042f2e" /> : <Text style={styles.primaryText}>Giriş yap</Text>}
          </Pressable>
          <Text style={styles.hint}>Telefonda deniyorsan sunucu adresi bilgisayarın yerel IP’si olmalı. Simülatörde 127.0.0.1:3000 yeter.</Text>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  const unread = items.filter((n) => !n.read).length;

  if ((session.role === 'student' || session.role === 'parent') && session.studentId) {
    return (
      <StudentShell
        apiBase={session.apiBase}
        role={session.role}
        studentId={session.studentId}
        name={session.name}
        onLogout={() => { void onLogout(); }}
      />
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.brandSmall}>SatrançEdu</Text>
          <Text style={styles.name}>{session.name}</Text>
          <Text style={styles.meta}>{ROLES.find((r) => r.id === session.role)?.label || session.role}{session.group ? ` · ${session.group}` : ''}</Text>
        </View>
        <Pressable onPress={() => { void onLogout(); }}>
          <Text style={styles.link}>Çıkış</Text>
        </Pressable>
      </View>
      <View style={styles.banner}>
        <Text style={styles.bannerTitle}>
          {session.studentId
            ? (unread > 0 ? `${unread} okunmamış bildirim` : 'Bildirim kutusu')
            : 'Aynı veritabanı'}
        </Text>
        <Text style={styles.bannerBody}>
          {home?.lines?.filter(Boolean).join(' · ') || 'Kayıtlar web ile aynı Supabase veritabanından geliyor.'}
          {session.studentId ? ` ${pushNote}` : ''}
        </Text>
      </View>
      <View style={styles.row}>
        <Pressable
          style={styles.secondary}
          onPress={() => { void showLocalNotification('SatrançEdu', 'Bu telefon bildirim gösterebiliyor.'); }}
        >
          <Text style={styles.secondaryText}>Bildirimi dene</Text>
        </Pressable>
          <Pressable
            style={styles.secondary}
            onPress={() => {
              void fetchHome(session.apiBase, session).then(setHome).catch(() => undefined);
              if (!session.studentId) return;
              void refresh(session, false).catch((err) => {
                setError(err instanceof Error ? err.message : 'Yenilenemedi');
              });
            }}
          >
          <Text style={styles.secondaryText}>Yenile</Text>
        </Pressable>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={home?.people?.length ? (
          <View style={{ gap: 8, marginBottom: 12 }}>
            {home.people.map((person) => (
              <View key={person.id} style={styles.card}>
                <Text style={styles.cardTitle}>{person.name}</Text>
                <Text style={styles.cardTime}>{[person.group, person.branch].filter(Boolean).join(' · ') || 'Öğrenci kaydı'}</Text>
              </View>
            ))}
          </View>
        ) : null}
        ListEmptyComponent={session.studentId ? <Text style={styles.empty}>Henüz bildirim yok.</Text> : null}
        renderItem={({ item }) => (
          <View style={[styles.card, !item.read && styles.cardUnread]}>
            <Text style={styles.cardTitle}>{item.title}</Text>
            <Text style={styles.cardBody}>{item.body}</Text>
            <Text style={styles.cardTime}>{formatWhen(item.createdAt)}</Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#070B14' },
  loginWrap: { flex: 1, padding: 24, justifyContent: 'center' },
  brand: { color: '#E0E7FF', fontSize: 34, fontWeight: '800' },
  brandSmall: { color: '#A5B4FC', fontSize: 12, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  lead: { color: '#94A3B8', marginTop: 8, marginBottom: 18, lineHeight: 20 },
  roles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  role: { borderRadius: 999, borderWidth: 1, borderColor: '#312E81', paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#12182A' },
  roleOn: { backgroundColor: '#4F46E5', borderColor: '#4F46E5' },
  roleText: { color: '#C7D2FE', fontWeight: '700', fontSize: 13 },
  roleTextOn: { color: '#FFFFFF' },
  label: { color: '#94a3b8', fontSize: 12, fontWeight: '700', marginBottom: 6, marginTop: 10 },
  input: {
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#1f2937',
    borderRadius: 16,
    color: '#f8fafc',
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
  },
  primary: {
    marginTop: 18,
    backgroundColor: '#4F46E5',
    borderRadius: 16,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { color: '#FFFFFF', fontWeight: '800', fontSize: 16 },
  hint: { color: '#64748b', marginTop: 14, fontSize: 12, lineHeight: 18 },
  error: { color: '#fda4af', marginTop: 12, marginHorizontal: 20 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 12, gap: 12 },
  name: { color: '#f8fafc', fontSize: 22, fontWeight: '800' },
  meta: { color: '#94a3b8', marginTop: 2 },
  link: { color: '#5eead4', fontWeight: '700' },
  banner: { margin: 20, marginBottom: 8, padding: 14, borderRadius: 16, backgroundColor: '#132033', borderWidth: 1, borderColor: '#1e3a4c' },
  bannerTitle: { color: '#f8fafc', fontWeight: '800' },
  bannerBody: { color: '#94a3b8', marginTop: 4, lineHeight: 18 },
  row: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, marginBottom: 8 },
  secondary: { flex: 1, borderRadius: 12, borderWidth: 1, borderColor: '#334155', paddingVertical: 10, alignItems: 'center' },
  secondaryText: { color: '#e2e8f0', fontWeight: '700' },
  list: { padding: 20, paddingTop: 8, gap: 10 },
  emptyWrap: { flexGrow: 1, justifyContent: 'center', padding: 28 },
  empty: { color: '#64748b', textAlign: 'center', lineHeight: 20 },
  card: { backgroundColor: '#111827', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#1f2937' },
  cardUnread: { borderColor: '#0f766e' },
  cardTitle: { color: '#f8fafc', fontWeight: '800' },
  cardBody: { color: '#cbd5e1', marginTop: 4, lineHeight: 20 },
  cardTime: { color: '#64748b', marginTop: 8, fontSize: 12 },
});
