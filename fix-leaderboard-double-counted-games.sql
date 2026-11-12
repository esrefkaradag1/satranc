-- Lider tablosu: Lichess turnuva maçları iki kez sayıldığı için maç sayısı G/B/M toplamından
-- büyük görünüyordu (ör. 22 maç, 10/1/3). Kod düzeltildi; ancak dönem istatistikleri
-- "en yüksek değeri koru" ile birleştiği için kayıtlı şişkin sayılar kendiliğinden düşmez.
--
-- 1) ÖNİZLEME (yalnızca okur): bu ay ve bu hafta etkilenecek satırlar
SELECT s.name, p.period, p.games AS kayitli_mac, (p.wins + p.draws + p.losses) AS gbm_toplam,
       p.wins, p.draws, p.losses
FROM public.leaderboard_period_stats p
LEFT JOIN public.students s ON s.id::text = p.student_id
WHERE p.games > p.wins + p.draws + p.losses
  AND p.period_start_ms >= (extract(epoch FROM date_trunc('month', now() AT TIME ZONE 'Europe/Istanbul') AT TIME ZONE 'Europe/Istanbul') * 1000)::bigint - 7 * 86400000
ORDER BY p.games - (p.wins + p.draws + p.losses) DESC;

-- 2) DÜZELTME: maç sayısını sonuçlu maç sayısına indirir. Sonucu bilinmeyen gerçek maçlar
--    (puansız/Chess.com günlük sayıları) bir sonraki taramada düzeltilmiş kodla geri eklenir.
-- BEGIN;
-- UPDATE public.leaderboard_period_stats p
-- SET games = p.wins + p.draws + p.losses, updated_at = now()
-- WHERE p.games > p.wins + p.draws + p.losses
--   AND p.period_start_ms >= (extract(epoch FROM date_trunc('month', now() AT TIME ZONE 'Europe/Istanbul') AT TIME ZONE 'Europe/Istanbul') * 1000)::bigint - 7 * 86400000;
-- COMMIT;
