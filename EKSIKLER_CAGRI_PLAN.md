# Çağrı Çankaya — eksikler.mp4 Geri Bildirim Planı

**Kaynak:** `eksikler.mp4` (~31 dk, 5 Haziran 2026)  
**Transkript:** `.tmp-eksikler/transcript.txt` — **962 segment, ~31 dk (0–1878 sn), dil: tr** — Whisper `small` ile tamamlandı.

**Referans ekranlar:** netspor bulmaca sonuçları, Chess.com classroom, Lichess opening wiki, Chessvision.ai

---

## Özet

Çağrı hocanın geri bildirimi 5 ana alana ayrılıyor: **öğrenci kayıt/finans**, **bulmaca yönetimi**, **çalışma editörü**, **ödev sonuçları** ve **genel UX**. Bu belge öncelik sırası, durum ve ilgili dosyaları listeler.

---

## P0 — Acil (bu oturumda ele alınan)

| # | Konu | İstek | Durum | Dosyalar |
|---|------|-------|-------|----------|
| 1 | Veli imzası | Antrenör ekleme formunda imza olmasın; sadece veli başvuru linkinde imzalasın | ✅ Uygulandı | `StudentAdd.tsx`, `applicationStorage.ts` |
| 2 | Aidat takvimi | Kayıt ayından önceki aylar "ÖDENMEDİ" + fiyat göstermesin | ✅ Uygulandı | `StudentDetail.tsx`, `trainingGroupUtils.ts` |
| 3 | WhatsApp | Anne/baba numaraları otomatik; ayrı modal yok; isteğe bağlı 3. numara (+) | ✅ Uygulandı | `StudentAdd.tsx` |
| 4 | Varsayılan ekran | Dashboard çok kaba; antrenör girişinde öğrenci listesi açılsın | ✅ Uygulandı | `App.tsx` |
| 5 | Bulmaca editör | Üst "Analiz" sekmesi kaldırılsın; editörde oynatma kaldırılsın | ✅ Uygulandı | `ChessBoard.tsx` |
| 6 | Lichess çekme | "mat" teması, puan aralığı; takılma / yanlış filtre | ✅ İyileştirildi | `lichessService.ts` |
| 7 | Toplu PGN | Dosya seçici geri gelsin; panel z-index; ikinci dosya eklenebilsin | ✅ Uygulandı | `StudyPage.tsx` |
| 8 | OpenRouter 402 | Kredi yoksa Türkçe anlaşılır mesaj | ✅ Uygulandı | `openRouterService.ts` |

---

## P1 — Çalışma modülü (kısmen tamamlandı)

| # | Konu | İstek | Durum | Not |
|---|------|-------|-------|-----|
| 9 | Ana devam yolu | Hamle tıklanınca ana hat güncellensin | ✅ Önceki oturum | `StudyPage.tsx`, `StudyMoveTree.tsx` |
| 10 | Bölüm numarası | Liste ile seçili bölüm senkron | ✅ Önceki oturum | `StudyPage.tsx` |
| 11 | FEN import | PGN/FEN sonrası hamleler görünsün | ✅ Uygulandı | `parsePgnBlockToMoves`, `bulkImportPgn` |
| 12 | Yan panel genişliği | FEN / "beyaz oynar" alanı kesilmesin | ✅ İyileştirildi | `xl:w-72`, tahta genişletildi |
| 13 | Kare işaretleme | Lichess gibi sağ tık daire/kare (Ctrl+sağ tık kare) | ✅ Uygulandı | `StudyPage.tsx` |
| 14 | Chessvision PDF | Çift tıkla diyagram → tahtaya aktar | ✅ Kısmen | Görsele çift tık → FEN yükle; PDF sayfa seçimi mevcut |
| 15 | Öğrenci hamle kaydı | Motor/ana hat düzeldikten sonra uçtan uca test | ⏳ Test | `StudentStudyView.tsx` |

---

## P1 — Ödev & analiz

| # | Konu | İstek | Durum | Not |
|---|------|-------|-------|-----|
| 16 | Ödev grup görünümü | 12 öğrenciye ödev → her biri için doğru/yanlış özeti (netspor gibi) | ✅ Uygulandı | `HomeworkGroupResultsTable.tsx` |
| 17 | Öğrenci detayı | Tıklayınca soru bazlı düşünme süresi, ipucu kullanımı | ✅ Kısmen | Detay modalında soru tablosu + düşünme süresi |
| 18 | Analiz sekmesi ayrımı | Lichess AI analizi ≠ ödev bulmaca sonuçları | ✅ Uygulandı | `Analysis.tsx` bilgi bandı → Ödev Takibi |
| 19 | İlerleme kartları | Hepsi "BAŞLAMADI" görünmesin | ✅ Uygulandı | `applyDailyDisplayToStat` puzzle denemelerini korur |

---

## P1 — Canlı ders (videonun 2. yarısı)

| # | Konu | İstek | Durum |
|---|------|-------|-------|
| 20 | Oda yönetimi | Yeni oda açılınca eskisi kapanmalı / tek aktif oda | ✅ Uygulandı | `LiveLesson.tsx` |
| 21 | Grup daveti | Katılımcı seçiminde grup bazlı davet (tek tek değil) | ✅ Uygulandı | `LiveLesson.tsx` |
| 22 | UI ince tasarım | Canlı ders ekranı çok kaba; daha ince/kibar görünüm | ✅ Kısmen | Küçük PV satırları, kompakt hamle ağacı |
| 23 | Ana devam yolu | Canlı derste hamle silme / ana hat düzenleme | ✅ Uygulandı | `StudyMoveTree` sağ tık sil + varyasyon ana hat |
| 24 | Analiz önizleme | Küçük; sağa kaydırınca tahtadan taşıyor — Lichess gibi sabit kalmalı | ✅ Uygulandı | Sabit inline önizleme |
| 25 | Devam yolu boyutu | Değerlendirme / devam yolu satırları çok büyük; Chess.com referansı | ✅ Uygulandı | `text-[9px]`, `max-h-[6rem]` PV paneli |

## P1 — Yoklama & ödev programı (videonun 2. yarısı)

| # | Konu | İstek | Durum |
|---|------|-------|-------|
| 26 | Yoklama görselleri | Sağ panelde öğrenci fotoğrafları; yoklama alırken hızlı erişim | ✅ Uygulandı | `Attendance.tsx` |
| 27 | Haftalık ödev programı | Gün gün program (Pzt 5 maç, Çar 5 bulmaca vb.); yapıldı/bekleniyor renkleri | ✅ Uygulandı | `WeeklyScheduleGrid` yeşil/kırmızı/amber |
| 28 | Kalıcı ödev | Yeni ödev gelene kadar aktif kalsın; kaldırınca güncellensin | ✅ Mevcut | `AppContext` supersede + «Kalıcı ödev» etiketi |
| 29 | Kişiye özel program | Gruba aynı ödev; tek öğrencinin günlerini özelleştirme (ör. salı boş) | ✅ Uygulandı | `weeklySchedule` + öğrenci sekmeleri |

---

## P2 — Diğer / referans

| # | Konu | Not |
|---|------|-----|
| 30 | Dashboard tasarımı | Daha kompakt KPI; antrenör için varsayılan değil |
| 31 | Canlı ders motoru | İlk hamleye dönünce çökme — önceki oturumda düzeltildi, prod test |
| 32 | Öğrenci çalışmasına üye ekle | Hoca eklenebilsin — önceki oturumda eklendi |
| 33 | Chess.com classroom davet | Referans UX |
| 34 | Lichess opening wiki | Referans UX |

---

## Uygulama sırası (önerilen)

```
Hafta 1 (P0)     → Kayıt, aidat, WhatsApp, bulmaca editör, Lichess API, PGN dosya
Hafta 2 (P1-çalışma) → Layout, kare işaretleme, PDF/Chessvision POC
Hafta 3 (P1-ödev)    → Grup özet paneli, homework_attempts bağlantısı
Hafta 4 (test)       → Prod doğrulama, Çağrı ile canlı walkthrough
```

---

## Ortam / deploy

- **Prod:** https://chees-main.vercel.app  
- **SQL:** Yalnızca `NETCHESS_SUPABASE.sql`  
- **OpenRouter:** `VITE_OPENROUTER_API_KEY` — görsel FEN için kredi gerekli (402)

---

## Test kontrol listesi (Çağrı ile)

- [ ] Yeni öğrenci ekle → imza alanı yok → kayıt sonrası WhatsApp otomatik (anne/baba)
- [ ] Haziran kayıtlı öğrenci → Ocak–Mayıs aidat kutusu boş / "Kayıt öncesi"
- [ ] Bulmaca → Lichess 600–1400 + mat → 10 bulmaca geliyor
- [ ] Bulmaca editör → sadece Tahta / Bulmaca / Çalışma sekmeleri (Analiz yok)
- [ ] Çalışma → Toplu PGN → `.pgn` dosyası seç → bölümler ekleniyor
- [ ] Çalışma → ana devam yolu tıklama senkron
- [ ] Ödev → gruba gönder → öğrenci bazlı doğru/yanlış özeti görünür

---

*Son güncelleme: 5 Haziran 2026*
