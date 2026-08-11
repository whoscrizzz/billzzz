import type { Frequency, SubscriptionInput } from '../types/subscription';

export interface ParsedImportRow {
  name: string;
  amount: number;
  currency: string;
  due_date: string | null;
  frequency: Frequency;
  category: string | undefined;
  confidence: 'high' | 'medium' | 'low';
  raw: string;
}

const AMOUNT_RE = /(?:^|\s)\$?\s*([\d][\d,]*(?:\.\d{1,2})?)\s*(MXN|USD)?(?:\s|$)/i;
const DATE_RE = /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/;
const TIME_RE = /\b\d{1,2}:\d{2}\s*(?:a\.?\s*m\.?|p\.?\s*m\.?)?/gi;

const FREQ_RULES: { re: RegExp; frequency: Frequency }[] = [
  { re: /cada\s+a[nñ]o|anual|yearly/i, frequency: 'yearly' },
  { re: /cada\s+semana|semanal|weekly/i, frequency: 'weekly' },
  { re: /cada\s+mes|mensual|monthly/i, frequency: 'monthly' },
];

function parseIsoDate(day: number, month: number, year: number): string | null {
  const y = year < 100 ? 2000 + year : year;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function inferCategory(name: string, frequency: Frequency): string | undefined {
  const n = name.toLowerCase();
  if (/spotify|netflix|rappi|uber|icloud|cloudflare|microsoft|saas|software/i.test(n)) {
    return frequency === 'yearly' ? 'Servicios' : 'Suscripciones';
  }
  if (/stori|kueski|didi|cr[eé]dito|pr[eé]stamo|loan/i.test(n)) return 'Préstamos';
  if (/colegiatura|uvm|escuela|universidad/i.test(n)) return 'Educación';
  if (/mam[aá]|pap[aá]|personal/i.test(n)) return 'Personal';
  return undefined;
}

function parseFrequency(text: string): Frequency | null {
  for (const rule of FREQ_RULES) {
    if (rule.re.test(text)) return rule.frequency;
  }
  return null;
}

function extractAmount(text: string): { amount: number; currency: string; rest: string } | null {
  const m = AMOUNT_RE.exec(text);
  if (!m) return null;
  const amount = parseFloat(m[1].replace(/,/g, ''));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const currency = m[2]?.toUpperCase() === 'USD' ? 'USD' : 'MXN';
  // El separador es obligatorio: AMOUNT_RE consume los espacios que delimitan
  // el monto, así que concatenar los extremos pegaba el nombre a lo que seguía
  // ("Spotify $79 28/06/26" → "Spotify28/06/26") y el \b de DATE_RE ya no podía
  // casar la fecha. Sin fecha, la frecuencia degradaba a 'once' en silencio.
  const rest = `${text.slice(0, m.index)} ${text.slice(m.index! + m[0].length)}`;
  return { amount, currency, rest: rest.trim() };
}

function extractDate(text: string): { due_date: string; rest: string } | null {
  const m = DATE_RE.exec(text);
  if (!m) return null;
  const due = parseIsoDate(Number(m[1]), Number(m[2]), Number(m[3]));
  if (!due) return null;
  const rest = (text.slice(0, m.index) + text.slice(m.index! + m[0].length)).trim();
  return { due_date: due, rest };
}

function cleanName(text: string): string {
  return text
    .replace(TIME_RE, '')
    .replace(DATE_RE, '')
    .replace(/cada\s+\w+/gi, '')
    .replace(/\$[\d,.]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseBlock(block: string): ParsedImportRow | null {
  const raw = block.trim();
  if (!raw || raw.length < 2) return null;

  const lines = raw
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const joined = lines.join(' ');

  const amountFrom = extractAmount(joined);
  if (!amountFrom) {
    // Name-only line with date (colegiatura sin monto)
    const dateOnly = extractDate(joined);
    const name = cleanName(dateOnly?.rest ?? joined);
    if (!name) return null;
    return {
      name,
      amount: 0,
      currency: 'MXN',
      due_date: dateOnly?.due_date ?? null,
      frequency: 'once',
      category: inferCategory(name, 'once'),
      confidence: 'low',
      raw,
    };
  }

  let work = amountFrom.rest || lines[0] || '';
  if (!amountFrom.rest && lines.length > 1) {
    work = lines.filter((l) => !AMOUNT_RE.test(l)).join(' ');
  }

  const freq = parseFrequency(joined) ?? 'once';
  const datePart = extractDate(work);
  const name = cleanName(datePart?.rest ?? work) || cleanName(lines[0] ?? '') || 'Sin nombre';

  let confidence: ParsedImportRow['confidence'] = 'medium';
  if (amountFrom.amount > 0 && datePart?.due_date && freq !== 'once') confidence = 'high';
  else if (!datePart?.due_date) confidence = 'low';

  return {
    name,
    amount: amountFrom.amount,
    currency: amountFrom.currency,
    due_date: datePart?.due_date ?? null,
    frequency: datePart?.due_date ? freq : 'once',
    category: inferCategory(name, freq),
    confidence,
    raw,
  };
}

/** Parse texto pegado desde Recordatorios (macOS/iOS) o CSV simple. */
export function parseRemindersImport(text: string): ParsedImportRow[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  if (trimmed.includes(',') && trimmed.split('\n')[0]?.toLowerCase().includes('nombre')) {
    return parseCsv(trimmed);
  }

  const blocks = trimmed.split(/\n{2,}/);
  const rows: ParsedImportRow[] = [];

  if (blocks.length === 1) {
    const whole = parseBlock(trimmed);
    if (whole) {
      rows.push(whole);
    } else {
      for (const line of trimmed.split(/\n/)) {
        const row = parseBlock(line);
        if (row) rows.push(row);
      }
    }
  } else {
    for (const block of blocks) {
      const row = parseBlock(block);
      if (row) rows.push(row);
    }
  }

  const seen = new Set<string>();
  return rows.filter((r) => {
    const key = `${r.name}|${r.amount}|${r.due_date}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function parseCsv(text: string): ParsedImportRow[] {
  const lines = text.trim().split(/\n/);
  const header = lines[0].toLowerCase();
  const cols = header.split(',').map((c) => c.trim());
  const nameIdx = cols.findIndex((c) => c.includes('nombre') || c === 'name');
  const amountIdx = cols.findIndex((c) => c.includes('monto') || c === 'amount');
  const dateIdx = cols.findIndex((c) => c.includes('fecha') || c === 'date');
  const freqIdx = cols.findIndex((c) => c.includes('frecuencia') || c === 'frequency');
  const catIdx = cols.findIndex((c) => c.includes('categor') || c === 'category');

  const rows: ParsedImportRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',').map((p) => p.trim());
    const name = parts[nameIdx >= 0 ? nameIdx : 0];
    if (!name) continue;
    const amount = amountIdx >= 0 ? parseFloat(parts[amountIdx]) : 0;
    const due_date = dateIdx >= 0 ? parts[dateIdx] || null : null;
    const freqRaw = freqIdx >= 0 ? parts[freqIdx] : 'monthly';
    const frequency = (
      ['weekly', 'monthly', 'yearly', 'once'].includes(freqRaw) ? freqRaw : 'monthly'
    ) as Frequency;
    rows.push({
      name,
      amount: Number.isFinite(amount) ? amount : 0,
      currency: 'MXN',
      due_date,
      frequency,
      category: catIdx >= 0 ? parts[catIdx] : undefined,
      confidence: 'high',
      raw: lines[i],
    });
  }
  return rows;
}

export function toSubscriptionInput(row: ParsedImportRow): SubscriptionInput {
  const base = {
    name: row.name,
    amount: row.amount > 0 ? row.amount : 1,
    currency: row.currency,
    category: row.category,
    notify_days_before: row.frequency === 'weekly' ? 1 : 3,
    notify_hour: row.frequency === 'once' ? 15 : 9,
  };

  if (row.frequency === 'once' || !row.due_date) {
    return {
      ...base,
      frequency: 'once',
      due_date: row.due_date ?? new Date().toISOString().slice(0, 10),
    };
  }

  if (row.frequency === 'weekly') {
    const d = new Date(row.due_date + 'T12:00:00Z');
    const dow = d.getUTCDay();
    return {
      ...base,
      frequency: 'weekly',
      due_day: dow === 0 ? 7 : dow,
    };
  }

  return {
    ...base,
    frequency: row.frequency,
    due_date: row.due_date,
  };
}
