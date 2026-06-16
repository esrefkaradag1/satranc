# Vercel'e Yükleme

## 1. Vercel CLI ile (terminal)

```bash
# Vercel CLI yükle (bir kez)
npm i -g vercel

# Proje klasöründe
cd /Users/esrefkaradag/Downloads/chees-main

# Deploy (ilk seferde giriş yapmanız istenir)
vercel

# Canlı (production) adrese yüklemek için
vercel --prod
```

İlk çalıştırmada Vercel hesabınızla giriş yapın; proje adı ve ayarlar sorulur, varsayılanları onaylayabilirsiniz.

---

## 2. GitHub üzerinden (önerilen)

1. Projeyi GitHub’a push edin.
2. [vercel.com](https://vercel.com) → **Add New** → **Project**.
3. Repoyu seçin, **Import**.
4. **Root Directory** proje kökü olsun (değiştirmeyin).
5. **Build Command:** `npm run build`
6. **Output Directory:** `dist`
7. **Environment Variables** bölümüne gerekli değişkenleri ekleyin (aşağıya bakın).
8. **Deploy** ile yayına alın.

---

## Ortam değişkenleri (Vercel Dashboard → Project → Settings → Environment Variables)

Proje Supabase ve isteğe bağlı API anahtarları kullanıyorsa Vercel’de şunları tanımlayın:

| Ad | Açıklama | Gerekli |
|----|----------|--------|
| `VITE_SUPABASE_URL` | Supabase proje URL | Evet (Supabase kullanıyorsanız) |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key | Evet (Supabase kullanıyorsanız) |
| `VITE_SUPABASE_SERVICE_ROLE_KEY` | Supabase service role (gerekirse) | Hayır |
| `VITE_API_URL` | Backend API adresi (öğrenci/veli paneli) | Hayır |
| `VITE_OPENROUTER_API_KEY` | OpenRouter API key | Hayır (AI özellikleri için) |
| `VITE_OPENROUTER_MODEL` | Model adı | Hayır |

Not: `VITE_` ile başlayan değişkenler build sırasında koda gömülür; değiştirince yeniden deploy gerekir.

---

## Mevcut vercel.json

Projede `vercel.json` zaten var; build komutu, çıktı klasörü ve SPA yönlendirmeleri ayarlı. Ekstra bir şey yapmanız gerekmez.
