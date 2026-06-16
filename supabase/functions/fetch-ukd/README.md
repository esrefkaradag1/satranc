# fetch-ukd — TSF UKD verisi çekme

Bu Edge Function, TSF UKD Bilgi Sistemi sayfasına TC Kimlik No veya Soyad ile istek atıp sonuç tablosundan UKD, FIDE ID, ad, soyad, doğum yılı, il bilgisini parse eder.

## Manuel kurulum yönergeleri

**Adım adım kurulum:** Proje kökünde `docs/UKD_TSF_MANUEL_KURULUM.md` dosyasına bakın. Supabase CLI kurulumu, projeyi bağlama ve deploy adımları orada anlatılıyor.

## Deploy (kısa)

Supabase CLI kurulu ve proje bağlıysa:

```bash
supabase login
supabase link --project-ref <proje-ref>
supabase functions deploy fetch-ukd
```

Proje ref: Supabase Dashboard → Project Settings → General → Reference ID.

## Kullanım

Uygulama içinde öğrenci detay → UKD/FIDE sekmesinde **"UKD çek"** butonu, öğrencinin TC’si ile bu fonksiyonu çağırır. Sonuç gelirse UKD, FIDE ID, ad, doğum yılı otomatik güncellenir.

## Not

TSF sayfasındaki form alan adları değişirse (`tc`, `soyad`) `index.ts` içindeki `form.set(...)` değerleri güncellenmelidir.
