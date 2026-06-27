-- Mevcut şube / branş / grup kayıtlarını temizler (sıfırdan başlamak için).
-- Supabase SQL Editor'de bir kez çalıştırın. Geri alınamaz.

DELETE FROM lessons WHERE id LIKE 'tg-%';
DELETE FROM training_groups;
DELETE FROM discipline_branches;
DELETE FROM branch_offices;
