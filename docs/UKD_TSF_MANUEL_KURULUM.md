# UKD TSF Veri Çekme — Manuel Kurulum Yönergeleri

Bu rehber, TSF UKD sayfasından öğrenci verisini (UKD, FIDE ID, ad, doğum yılı vb.) otomatik çekmek için **Supabase Edge Function**’ı manuel nasıl ekleyeceğinizi anlatır.

---

## Supabase Dashboard'dan eklerken (panelden)

- **Fonksiyon adı:** Tam olarak **`fetch-ukd`** yazın. (Örn. "bright-endpoint" yazarsanız uygulama bulamaz.)
- **Kod:** Projedeki `supabase/functions/fetch-ukd/index.ts` dosyasının **tamamını** kopyalayıp Supabase'deki `index.ts` editörüne yapıştırın.
- **Deploy:** "Deploy function" ile yayına alın.

Fonksiyonun döndürdüğü alanlar (uygulama bunları kullanır): `ok`, `tck`, `fideId`, `ad`, `soyad`, `name`, `ukd`, `dogumYil`, `il`. Veritabanına ayrıca bir tablo eklemeniz gerekmez; bu veriler doğrudan öğrenci kaydında güncellenir.

---

## 1. Gereksinimler

- **Supabase projesi** (zaten kullanıyorsunuz)
- **Supabase CLI** (bilgisayarınızda yüklü olmalı)
- **Node.js 18+** (Supabase CLI için)

---

## 2. Supabase CLI Kurulumu

Terminalde:

```bash
npm install -g supabase
```

veya (Mac/Linux):

```bash
brew install supabase/tap/supabase
```

Kurulumu kontrol edin:

```bash
supabase --version
```

---

## 3. Projeyi Supabase’e Bağlama

1. [Supabase Dashboard](https://supabase.com/dashboard) → projenize girin.
2. **Project Settings** → **General** → **Reference ID** değerini kopyalayın (örn. `oidybhpheekdhaclozta`).
3. Proje klasörünüzde (chees-main içinde) terminalde:

```bash
cd /path/to/chees-main
supabase login
```

Tarayıcı açılır; Supabase hesabınızla giriş yapın.

4. Projeyi bağlayın:

```bash
supabase link --project-ref BURAYA_PROJE_REF_YAPIŞTIR
```

Örnek:

```bash
supabase link --project-ref oidybhpheekdhaclozta
```

---

## 4. Edge Function’ı Deploy Etme

Aynı klasörde:

```bash
supabase functions deploy fetch-ukd
```

Sorulursa bölge seçin (örn. `eu-central-1` veya size en yakın olanı).

Başarılı olursa şuna benzer bir çıktı görürsünüz:

```
Deploying function fetch-ukd...
Function fetch-ukd deployed successfully.
```

---

## 5. Uygulama Tarafında Kontrol

- `.env` dosyanızda şunlar tanımlı olmalı (zaten kullanıyorsunuz):
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
- Ekstra bir ayar gerekmez; uygulama Edge Function’ı bu URL ile otomatik çağırır.

---

## 6. Kullanım

1. Uygulamada **Öğrenciler** → bir öğrenci seçin → **UKD/FIDE** sekmesine gidin.
2. Öğrencide **TC Kimlik No** kayıtlı olmalı (yoksa önce **Düzenle** ile ekleyin).
3. **"UKD çek"** butonuna tıklayın.
4. TSF’den veri gelirse UKD, FIDE ID, ad, doğum yılı otomatik güncellenir.
5. Veri gelmezse veya hata alırsanız **"TSF verilerini elle aktar"** ile TSF sayfasından kopyalayıp yapıştırabilirsiniz.

---

## 7. Sorun Giderme

| Sorun | Olası neden | Çözüm |
|--------|--------------|--------|
| "UKD çek" tıklanınca hiçbir şey olmuyor | Edge Function deploy edilmemiş veya link yanlış | `supabase link` ve `supabase functions deploy fetch-ukd` tekrar çalıştırın. |
| TC var ama "Kayıt bulunamadı" | TSF’de bu TC’ye kayıtlı oyuncu yok | TSF’de [UKD Sorgulama](https://ukd.tsf.org.tr/ukdsorgulama.php) ile TC’yi kontrol edin; yoksa elle aktarın. |
| 400 / 500 hatası | TSF form alan adı değişmiş veya sayfa değişti | `supabase/functions/fetch-ukd/index.ts` içinde form parametrelerini (`tc`, `soyad`) TSF sayfasının HTML’ine göre güncelleyin. |

---

## 8. Dosya Konumları

- **Edge Function kodu:** `supabase/functions/fetch-ukd/index.ts`
- **Frontend çağrısı:** `services/ukdService.ts` → `fetchUkdFromTsf()`
- **Buton ve güncelleme:** `components/StudentDetail.tsx` (UKD/FIDE sekmesi)

Form alanlarını değiştirmek için sadece `supabase/functions/fetch-ukd/index.ts` içindeki `form.set('tc', ...)` / `form.set('soyad', ...)` satırlarını düzenlemeniz yeterlidir.
