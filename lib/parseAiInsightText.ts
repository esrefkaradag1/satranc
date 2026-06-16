export interface InsightItem {
  title: string;
  body: string;
  percent: number | null;
}

/** `**kalın**` işaretlerini temizler */
export function stripMarkdownBold(text: string): string {
  return text.replace(/\*\*([^*]+)\*\*/g, '$1').trim();
}

export function extractPercent(text: string): number | null {
  const m =
    text.match(/%\s*(\d{1,3})/) ||
    text.match(/(\d{1,3})\s*%/) ||
    text.match(/(?:success|başarı|oran|rate|distribution)[^\d]*(\d{1,3})/i);
  if (!m) return null;
  const n = Number.parseInt(m[1], 10);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
}

export function parseInsightItems(raw: string): InsightItem[] {
  const text = raw.replace(/\r\n/g, '\n').trim();
  if (!text) return [];

  const chunks = text.split(/\n(?=\d+[\.\)]\s)/).filter(Boolean);
  const items: InsightItem[] = [];

  for (const chunk of chunks) {
    const line = chunk.trim();
    const numbered = line.match(/^\d+[\.\)]\s*(.*)$/s);
    if (!numbered) continue;
    const rest = numbered[1].trim();
    const boldTitle = rest.match(/^\*\*([^*]+)\*\*:?\s*([\s\S]*)$/);
    const plainTitle = rest.match(/^([^:\n]{3,80}):\s*([\s\S]*)$/);

    let title = '';
    let body = rest;
    if (boldTitle) {
      title = stripMarkdownBold(boldTitle[1]);
      body = boldTitle[2].trim();
    } else if (plainTitle && !plainTitle[1].includes('.')) {
      title = plainTitle[1].trim();
      body = plainTitle[2].trim();
    } else {
      const firstSentence = rest.split(/(?<=[.!?])\s+/)[0] ?? rest;
      title = stripMarkdownBold(firstSentence).slice(0, 72);
      body = rest;
    }

    items.push({
      title: title || 'Madde',
      body: stripMarkdownBold(body),
      percent: extractPercent(rest),
    });
  }

  if (items.length > 0) return items;

  const bullets = text.split(/\n(?=[•\-*]\s)/).filter((l) => /^[•\-*]\s/.test(l.trim()));
  for (const b of bullets) {
    const body = b.replace(/^[•\-*]\s*/, '').trim();
    const bold = body.match(/^\*\*([^*]+)\*\*:?\s*(.*)$/s);
    items.push({
      title: bold ? stripMarkdownBold(bold[1]) : body.slice(0, 60),
      body: bold ? stripMarkdownBold(bold[2]) : body,
      percent: extractPercent(body),
    });
  }

  if (items.length > 0) return items;

  return [
    {
      title: 'Özet',
      body: stripMarkdownBold(text),
      percent: extractPercent(text),
    },
  ];
}
