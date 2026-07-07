-- Kulüp genişletilmiş profil (iletişim, sosyal medya, tanıtım)
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS profile jsonb;
