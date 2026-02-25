/**
 * Field extraction from raw OCR text.
 * Pure functions — no DOM, no side-effects.
 *
 * NOTE: `name` (氏名) is intentionally NOT extracted because OCR accuracy
 * for Japanese personal names is too low to be useful without NLP.
 */

// ===== Patterns =====

const EMAIL_RE = /[\w.+\-]+@[\w\-]+(?:\.[\w\-]+)+/;

// Japanese phone numbers with hyphens/spaces:
// 03-1234-5678 / 090-1234-5678 / 0120-123-456
const PHONE_RE = /0\d{1,4}[-\s]\d{1,4}[-\s]\d{3,4}/g;

const URL_RE  = /https?:\/\/[\w.\-/~?=&#%+@:]+/;
const WWW_RE  = /www\.[\w.\-/~?=&#%+@:]+/;

// Corporate legal-form keywords (longest → shortest for greedy matching)
const CORP_KEYWORDS = [
  '公益財団法人', '公益社団法人', '一般財団法人', '一般社団法人',
  '特定非営利活動法人', 'NPO法人', '医療法人', '社団法人', '財団法人',
  '合同会社', '有限会社', '株式会社',
];

// Title / position keywords (longest first to prefer specific matches)
const POSITION_KEYWORDS = [
  '代表取締役社長', '代表取締役副社長', '代表取締役', '専務取締役', '常務取締役',
  '取締役', '代表', '社長', '副社長', '専務', '常務', '顧問', '相談役',
  '部長', '副部長', '課長', '副課長', '係長', '主任', '担当', '責任者',
  'Vice President', 'General Manager', 'Executive Director',
  'CEO', 'COO', 'CTO', 'CFO', 'CMO', 'CIO', 'CSO',
  'President', 'Director', 'Manager', 'Executive',
];

// All 47 Japanese prefectures
const PREFECTURES = [
  '北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県',
  '茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県',
  '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県',
  '静岡県', '愛知県', '三重県', '滋賀県', '京都府', '大阪府', '兵庫県',
  '奈良県', '和歌山県', '鳥取県', '島根県', '岡山県', '広島県', '山口県',
  '徳島県', '香川県', '愛媛県', '高知県', '福岡県', '佐賀県', '長崎県',
  '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県',
];

// ===== Helpers =====

function getLines(text) {
  return text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
}

// ===== Individual extractors =====

export function extractEmail(text) {
  const m = text.match(EMAIL_RE);
  return m ? m[0] : '';
}

/** Returns up to 2 unique phone numbers found in text. */
export function extractPhones(text) {
  const raw = [...text.matchAll(PHONE_RE)].map(m => m[0]);
  return [...new Set(raw)].slice(0, 2);
}

export function extractWebsite(text) {
  const urlM = text.match(URL_RE);
  if (urlM) return urlM[0];
  const wwwM = text.match(WWW_RE);
  if (wwwM) return `https://${wwwM[0]}`;
  return '';
}

// English legal-form patterns in priority order (Inc. > Co.,Ltd. > LLC > GmbH > Corp.)
// Avoid trailing \b after periods because \b fails after a non-word char (`.`).
const ENG_CORP_RES = [
  /\bInc\./i,
  /\bCo\.,?\s*Ltd\./i,
  /\bLLC\b/i,
  /\bGmbH\b/i,
  /\bCorp\.?(?!\w)/i,
];

export function extractCompany(text) {
  const lines = getLines(text);

  // Japanese legal forms
  for (const line of lines) {
    if (CORP_KEYWORDS.some(kw => line.includes(kw))) return line;
  }

  // English legal forms — check each pattern in priority order
  for (const re of ENG_CORP_RES) {
    const line = lines.find(l => re.test(l));
    if (line) return line;
  }

  return '';
}

export function extractPosition(text) {
  const lines = getLines(text);
  // Check longest keywords first to prefer more specific titles
  for (const kw of POSITION_KEYWORDS) {
    const line = lines.find(l => l.includes(kw));
    if (line) return line;
  }
  return '';
}

export function extractAddress(text) {
  const lines = getLines(text);

  // Postal code marker 〒 is a reliable anchor
  const postalLine = lines.find(l => l.includes('〒'));
  if (postalLine) return postalLine;

  // Fall back to prefecture name
  for (const line of lines) {
    if (PREFECTURES.some(p => line.includes(p))) return line;
  }

  return '';
}

// ===== Main export =====

/**
 * Parse raw OCR text and return extracted card fields.
 * All values are strings; empty string means not found.
 * `name` is intentionally omitted — accuracy too low without NLP.
 *
 * @param {string} rawText
 * @returns {{ email, phone, mobile, website, company, position, address }}
 */
export function parseOCRText(rawText) {
  const text = rawText || '';
  const phones = extractPhones(text);

  return {
    email:    extractEmail(text),
    phone:    phones[0] || '',
    mobile:   phones[1] || '',
    website:  extractWebsite(text),
    company:  extractCompany(text),
    position: extractPosition(text),
    address:  extractAddress(text),
  };
}
