/**
 * TSF UKD verisi: Supabase Edge Function (fetch-ukd) ile TSF sayfasından çekilir.
 * Edge Function deploy edilmemişse veya TSF yanıt vermezse null döner.
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

/**
 * TC Kimlik No veya soyad ile TSF UKD sorgulama sayfasından veri çeker.
 * Supabase Edge Function 'fetch-ukd' kullanır (deploy gerekir).
 */
export async function fetchUkdFromTsf(params: { tc?: string; soyad?: string }): Promise<UkdFetchResponse | null> {
  const tc = params.tc?.replace(/\D/g, '') || '';
  const soyad = (params.soyad ?? '').trim();
  if (!tc && !soyad) return null;

  try {
    const { data, error } = await supabase.functions.invoke<UkdFetchResponse>('fetch-ukd', {
      body: { tc: tc || undefined, soyad: soyad || undefined },
    });

    if (error) {
      console.warn('[UKD] Edge Function error:', error);
      return {
        error: `UKD servisine erişilemedi: ${error.message || 'fetch-ukd fonksiyonu çalışmıyor/deploy edilmemiş olabilir.'}`,
      };
    }
    if (!data) {
      return { error: 'UKD servisinden boş yanıt geldi.' };
    }
    return data;
  } catch (e) {
    console.warn('[UKD] fetchUkdFromTsf failed:', e);
    return {
      error: `UKD çağrısı başarısız: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}
