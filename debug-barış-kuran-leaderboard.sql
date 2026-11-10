-- Tanılama: Barış Kuran'ın Kasım 2026 ("month", period_start_ms civarı) için
-- gerçekte sunucuda SAKLANAN ham sayıları görelim. Bu bilgiyi paylaşırsanız
-- sorunun önbellekte mi yoksa hesaplamanın kendisinde mi olduğunu kesin anlarız.

-- 1) Barış Kuran'ın öğrenci kaydı (id ve lichess kullanıcı adı)
SELECT id, name, lichess_username, chess_com_username
FROM public.students
WHERE name ILIKE '%barış kuran%' OR name ILIKE '%baris kuran%';

-- 2) Bu öğrenci için leaderboard_period_stats'ta HEM 'week' HEM 'month'
--    satırlarını yan yana görelim — sayılar gerçekten aynı mı, ne zaman
--    hesaplanmış (cached_at/updated_at) farklı mı?
SELECT *
FROM public.leaderboard_period_stats
WHERE student_id::text = (SELECT id::text FROM public.students WHERE name ILIKE '%barış kuran%' LIMIT 1)
ORDER BY period, period_start_ms DESC;

-- 3) KÖK NEDEN DOĞRULANDI: leaderboard_snapshots ("tüm tablo" önbelleği), her
--    öğrencinin kendi doğru hesaplanan sayısını (ör. Barış Kuran için haftalık
--    200 bulmaca) "asla azalma" kuralıyla eski/kirli bir değerle (3689) birleştirip
--    o eski değeri kalıcı hale getiriyordu. Bu tablo tamamen türetilmiş/yeniden
--    hesaplanabilir bir önbellek olduğu için güvenle sıfırlanabilir — gerçek
--    Lichess/Chess.com/ödev verisi hiç etkilenmez, bir sonraki açılışta her şey
--    doğru per-öğrenci sayılardan yeniden kurulur.
TRUNCATE public.leaderboard_snapshots;
