/**
 * TSF UKD verisi: önce /api/fetch-ukd (Vercel), yoksa Supabase Edge Function.
 */

import { supabase } from './supabase';

export interface UkdFetchResult {
  ok: true;
  tck?: string;
  fideId?: string;
  ad?: string;
  soyad?: string;
  name?: string;
  ukd?: number;
  dogumYil?: string;
  il?: string;
}

export type UkdFetchResponse = UkdFetchResult | { error: string; raw?: string };

function buildQuery(params: { tc?: string; soyad?: string }): { tc?: string; soyad?: string } {
  const tc = params.tc?.replace(/\D/g, '') || '';
  if (tc) return { tc };
  const soyad = (params.soyad ?? '').trim();
  return soyad ? { soyad } : {};
}

async function invokeApiRoute(body: { tc?: string; soyad?: string }): Promise<UkdFetchResponse | null> {
  try {
    const res = await fetch('/api/fetch-ukd', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.status === 404) return null;
    return (await res.json()) as UkdFetchResponse;
  } catch {
    return null;
  }
}

async function invokeEdgeFunction(body: { tc?: string; soyad?: string }): Promise<UkdFetchResponse | null> {
  const { data, error } = await supabase.functions.invoke<UkdFetchResponse>('fetch-ukd', { body });
  if (error) {
    return {
      error: `UKD servisine erişilemedi: ${error.message || 'fetch-ukd fonksiyonu çalışmıyor/deploy edilmemiş olabilir.'}`,
    };
  }
  return data ?? { error: 'UKD servisinden boş yanıt geldi.' };
}

/**
 * TC Kimlik No veya soyad ile TSF UKD sorgulama sayfasından veri çeker.
 * TC varsa yalnızca TC ile sorgular (soyad TSF tarafında AND filtresi oluşturur).
 */
export async function fetchUkdFromTsf(params: { tc?: string; soyad?: string }): Promise<UkdFetchResponse | null> {
  const query = buildQuery(params);
  if (!query.tc && !query.soyad) return null;

  try {
    const fromApi = await invokeApiRoute(query);
    if (fromApi) return fromApi;

    return await invokeEdgeFunction(query);
  } catch (e) {
    console.warn('[UKD] fetchUkdFromTsf failed:', e);
    return {
      error: `UKD çağrısı başarısız: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}
