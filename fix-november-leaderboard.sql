-- Kasım 2026 lider tablosu verisini sıfırla: düzeltme öncesi bug, geçen ayın
-- (Ekim) birikmiş sayılarını Kasım'ın KENDİ anahtarının altına yazmıştı.
-- Bu silme işlemi sadece önbelleklenmiş/özetlenmiş satırları temizler;
-- gerçek Lichess/Chess.com/ödev verisi hiç etkilenmez — bir sonraki açılışta
-- her öğrenci için sıfırdan, sadece Kasım'ı kapsayan doğru sayılar yeniden hesaplanır.
--
-- Aralık, saat dilimi farkına karşı toleranslı: 31 Ekim 00:00 UTC — 2 Kasım 00:00 UTC
-- arasını kapsar (Kasım ayının gerçek başlangıcı hangi saat diliminde hesaplanmış
-- olursa olsun bu aralığa düşer), ama Ekim/Aralık'ın kendi dönemlerine dokunmaz.

DELETE FROM public.leaderboard_snapshots
WHERE period = 'month' AND period_start_ms BETWEEN 1793404800000 AND 1793577600000;

DELETE FROM public.leaderboard_period_stats
WHERE period = 'month' AND period_start_ms BETWEEN 1793404800000 AND 1793577600000;
