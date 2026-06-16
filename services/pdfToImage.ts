/**
 * PDF.js: Statik import ile Vite 504 (Outdated Optimize Dep) hatası önlenir.
 * Worker Vite'ın ?url suffix'i ile ayrı yüklenir.
 */
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
// @ts-expect-error - Vite ?url ile worker dosyasının URL'sini döndürür
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = workerUrl;

/**
 * PDF dosyasının ilk sayfasını görsel (data URL) olarak döndürür.
 */
export async function pdfFirstPageToDataUrl(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await getDocument({ data: arrayBuffer }).promise;
  const page = await pdf.getPage(1);
  const scale = 2;
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context not available');
  await page.render({
    canvasContext: ctx,
    canvas,
    viewport,
  }).promise;
  return canvas.toDataURL('image/jpeg', 0.85);
}

/**
 * PDF dosyasındaki sayfa sayısını döndürür.
 */
export async function pdfGetNumPages(file: File): Promise<number> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await getDocument({ data: arrayBuffer }).promise;
  return pdf.numPages;
}

/**
 * PDF dosyasının belirtilen sayfa numarasını (1 tabanlı) görsel olarak döndürür.
 */
export async function pdfPageToDataUrl(file: File, pageNum: number): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await getDocument({ data: arrayBuffer }).promise;
  const page = await pdf.getPage(pageNum);
  const scale = 2;
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context not available');
  await page.render({
    canvasContext: ctx,
    canvas,
    viewport,
  }).promise;
  return canvas.toDataURL('image/jpeg', 0.85);
}

/**
 * PDF dosyasının tüm sayfalarını görsel (data URL) dizisi olarak döndürür.
 */
export async function pdfAllPagesToDataUrls(file: File): Promise<string[]> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await getDocument({ data: arrayBuffer }).promise;
  const numPages = pdf.numPages;
  const urls: string[] = [];
  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    const scale = 2;
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context not available');
    await page.render({
      canvasContext: ctx,
      canvas,
      viewport,
    }).promise;
    urls.push(canvas.toDataURL('image/jpeg', 0.85));
  }
  return urls;
}
