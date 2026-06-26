// Supabase Edge Function: TSF UKD sorgulama sayfasından TC veya Soyad ile veri çeker.
// Deploy: supabase functions deploy fetch-ukd

import { fetchUkdFromTsfServer } from '../_shared/tsfUkdFetch.ts';

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
    const result = await fetchUkdFromTsfServer(body);

    if ('error' in result) {
      const status = result.error === 'tc veya soyad gerekli' || result.error.includes('11 haneli')
        ? 400
        : result.error === 'Kayıt bulunamadı'
          ? 200
          : 502;
      return new Response(JSON.stringify(result), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: String(e) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
