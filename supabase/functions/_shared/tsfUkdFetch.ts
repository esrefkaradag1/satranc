const TSF_URL = 'https://ukd.tsf.org.tr/ukdsorgulama.php';

const TR_ASCII: Record<string, string> = {
  ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u',
  Ç: 'C', Ğ: 'G', İ: 'I', I: 'I', Ö: 'O', Ş: 'S', Ü: 'U',
};

export type TsfUkdSuccess = {
  ok: true;
  tck?: string;
  fideId?: string;
  ad?: string;
  soyad?: string;
  name?: string;
  ukd?: number;
  dogumYil?: string;
  il?: string;
};

export type TsfUkdResponse = TsfUkdSuccess | { error: string };

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

function toAsciiUpper(s: string): string {
  let out = s.trim();
  for (const [tr, en] of Object.entries(TR_ASCII)) {
    out = out.split(tr).join(en);
  }
  return out.toUpperCase();
}

function parseTableRow(trHtml: string): Record<string, string> | null {
  const cells: string[] = [];
  const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
  let m: RegExpExecArray | null;
  while ((m = tdRegex.exec(trHtml)) !== null) {
    cells.push(stripHtml(m[1]));
  }
  if (cells.length < 6) return null;
  const ukd = cells[5] || '';
  if (!/^\d{3,4}$/.test(ukd.replace(/\s/g, ''))) return null;
  return {
    tck: cells[0] || '',
    fideId: cells[1] || '',
    unvan: cells[2] || '',
    ad: cells[3] || '',
    soyad: cells[4] || '',
    ukd,
    hizliUhs: cells[6] || '',
    yildirimUys: cells[7] || '',
    dogumYil: cells[8] || '',
    il: cells[9] || '',
  };
}

function parseTsfHtml(html: string): Record<string, string> | null {
  const tableMatch = html.match(/ARAMA SONU[\s\S]*?<table[^>]*>([\s\S]*?)<\/table>/i);
  const tableBody = tableMatch ? tableMatch[1] : html;
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowRegex.exec(tableBody)) !== null) {
    const row = rowMatch[1];
    if (/<th/i.test(row) || /TCK</i.test(row)) continue;
    const parsed = parseTableRow(row);
    if (parsed?.ukd) return parsed;
  }
  return null;
}

export async function fetchUkdFromTsfServer(params: {
  tc?: string;
  soyad?: string;
}): Promise<TsfUkdResponse> {
  const tc = String(params.tc ?? '').replace(/\D/g, '');
  const soyadRaw = String(params.soyad ?? '').trim();

  if (!tc && !soyadRaw) return { error: 'tc veya soyad gerekli' };
  if (tc && tc.length !== 11) return { error: 'TC Kimlik No 11 haneli olmalıdır' };

  const form = new URLSearchParams();
  form.set('t', 'ukdbilgigoster');
  if (tc) form.set('tckimlikno', tc);
  else form.set('soyad', toAsciiUpper(soyadRaw));

  const res = await fetch(TSF_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'User-Agent': 'Mozilla/5.0 (compatible; NetChess-UKD/1.0)',
      Accept: 'text/html',
    },
    body: form.toString(),
  });

  if (!res.ok) return { error: 'TSF sunucusu yanıt vermedi' };

  const buf = await res.arrayBuffer();
  const html = new TextDecoder('iso-8859-9').decode(buf);
  const firstDataRow = parseTsfHtml(html);
  if (!firstDataRow) return { error: 'Kayıt bulunamadı' };

  const ukdNum = parseInt(firstDataRow.ukd.replace(/\D/g, ''), 10);
  const fideIdNum = firstDataRow.fideId ? firstDataRow.fideId.replace(/\D/g, '') : '';

  return {
    ok: true,
    tck: firstDataRow.tck,
    fideId: fideIdNum || undefined,
    ad: firstDataRow.ad || undefined,
    soyad: firstDataRow.soyad || undefined,
    name: [firstDataRow.ad, firstDataRow.soyad].filter(Boolean).join(' ').trim() || undefined,
    ukd: Number.isNaN(ukdNum) ? undefined : ukdNum,
    dogumYil: firstDataRow.dogumYil?.replace(/\D/g, '').slice(0, 4) || undefined,
    il: firstDataRow.il || undefined,
  };
}
