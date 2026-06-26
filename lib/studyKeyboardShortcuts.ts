export type StudyShortcutRow = {
  keys: string;
  label: string;
};

export type StudyShortcutSection = {
  title: string;
  rows: StudyShortcutRow[];
};

export const STUDY_KEYBOARD_SECTIONS: StudyShortcutSection[] = [
  {
    title: 'Gezinti',
    rows: [
      { keys: '← / → veya k / j', label: 'Önceki / sonraki hamle' },
      { keys: '↑ / ↓', label: 'Oyun sonu / başı' },
      { keys: 'Fare tekerleği', label: 'Hamleler arasında kaydır' },
    ],
  },
  {
    title: 'Analiz',
    rows: [
      { keys: 'f', label: 'Tahtayı çevir' },
      { keys: 'l', label: 'Motor analizini aç / kapa' },
      { keys: 'a', label: 'En iyi hamle oklarını aç / kapa' },
      { keys: 'v', label: 'Varyasyon (önizleme) oklarını aç / kapa' },
      { keys: 'x', label: 'Rakip tehditlerini göster / gizle' },
      { keys: 'Space', label: 'Motorun en iyi hamlesini oyna' },
      { keys: 'h', label: 'Tahta ayarları paneli' },
      { keys: '?', label: 'Klavye kısayolları yardımı' },
    ],
  },
  {
    title: 'Hamle listesi',
    rows: [
      { keys: 'Shift + I', label: 'Satır içi notasyon (tek satır PGN)' },
    ],
  },
  {
    title: 'Tahta',
    rows: [
      { keys: 'Shift + tık / sağ tık', label: 'Ok çiz' },
      { keys: 'Ctrl + sağ tık', label: 'Kare işareti' },
      { keys: 'Ctrl + Z', label: 'Son hamleyi geri al (antrenör)' },
    ],
  },
  {
    title: 'Notlar (antrenör)',
    rows: [
      { keys: '1 ! 2 ? 3 !! 4 ?? 5 !? 6 ?!', label: 'Seçili hamleye sembol' },
    ],
  },
];

export const STUDY_SETTINGS_SHORTCUTS: StudyShortcutRow[] = [
  { keys: 'f', label: 'Tahtayı çevir' },
  { keys: 'l', label: 'Motor' },
  { keys: 'a', label: 'En iyi hamle okları' },
  { keys: 'v', label: 'Varyasyon okları' },
  { keys: 'x', label: 'Tehditler' },
  { keys: 'Space', label: 'En iyi hamle' },
  { keys: 'Shift + I', label: 'Satır içi notasyon' },
  { keys: 'h', label: 'Ayarlar' },
  { keys: '?', label: 'Yardım' },
];
