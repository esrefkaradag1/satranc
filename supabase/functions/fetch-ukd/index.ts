// Supabase Edge Function: TSF UKD sorgulama sayfasından TC veya Soyad ile veri çeker.
// Deploy: supabase functions deploy fetch-ukd

const TSF_URL = 'https://ukd.tsf.org.tr/ukdsorgulama.php';

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

function parseTableRow(trHtml: string): Record<string, string> | null {
  const cells: string[] = [];
  const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
  let m;
  while ((m = tdRegex.exec(trHtml)) !== null) {
    cells.push(stripHtml(m[1]));
  }
  // Beklenen sıra: TCK, FIDE ID, Unvan, Ad, Soyad, UKD, Hızlı UHS, Yıldırım UYS, D.Yıl, İl, (ayrıntılar butonu)
  if (cells.length < 9) return null;
  return {
    tck: cells[0] || '',
    fideId: cells[1] || '',
    unvan: cells[2] || '',
    ad: cells[3] || '',
    soyad: cells[4] || '',
    ukd: cells[5] || '',
    hizliUhs: cells[6] || '',
    yildirimUys: cells[7] || '',
    dogumYil: cells[8] || '',
    il: cells[9] || '',
  };
}

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({})) as { tc?: string; soyad?: string };
    const tc = String(body.tc ?? '').replace(/\D/g, '');
    const soyad = String(body.soyad ?? '').trim();

    if (!tc && !soyad) {
      return new Response(
        JSON.stringify({ error: 'tc veya soyad gerekli' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const form = new URLSearchParams();
    // TSF form alanı çoğu zaman "tck" (bazı sürümlerde "tc" de görülebiliyor)
    if (tc) {
      form.set('tck', tc);
      form.set('tc', tc);
    }
    if (soyad) form.set('soyad', soyad);

    const res = await fetch(TSF_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (compatible; TSF-UKD-Fetch/1.0)',
        Accept: 'text/html',
      },
      body: form.toString(),
    });

    if (!res.ok) {
      return new Response(
        JSON.stringify({ error: 'TSF sunucusu yanıt vermedi' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const html = await res.text();
    // Bazı TSF sayfalarında başlık/case farklı olabiliyor; önce "arama sonuçları" bloğunu dene,
    // olmazsa tüm HTML içinde satır tara.
    const tableMatch = html.match(/ARAMA SONUÇLARI[\s\S]*?<table[^>]*>([\s\S]*?)<\/table>/i);
    const tableBody = tableMatch ? tableMatch[1] : html;
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch;
    let firstDataRow: Record<string, string> | null = null;
    let rowCount = 0;
    while ((rowMatch = rowRegex.exec(tableBody)) !== null) {
      const row = rowMatch[1];
      if (/<th/.test(row)) continue;
      const parsed = parseTableRow(row);
      // "ayrıntılar" butonu çoğu satırda bulunduğu için bunu eleme kriteri yapmıyoruz.
      if (parsed && parsed.ukd) {
        firstDataRow = parsed;
        rowCount++;
        break;
      }
    }

    if (!firstDataRow) {
      return new Response(
        JSON.stringify({ error: 'Kayıt bulunamadı' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const ukdNum = parseInt(firstDataRow.ukd.replace(/\D/g, ''), 10);
    const fideIdNum = firstDataRow.fideId ? firstDataRow.fideId.replace(/\D/g, '') : '';

    const out = {
      ok: true,
      tck: firstDataRow.tck,
      fideId: fideIdNum || undefined,
      ad: firstDataRow.ad || undefined,
      soyad: firstDataRow.soyad || undefined,
      name: [firstDataRow.ad, firstDataRow.soyad].filter(Boolean).join(' ').trim() || undefined,
      ukd: Number.isNaN(ukdNum) ? undefined : ukdNum,
      dogumYil: firstDataRow.dogumYil || undefined,
      il: firstDataRow.il || undefined,
    };

    return new Response(JSON.stringify(out), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: String(e) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
