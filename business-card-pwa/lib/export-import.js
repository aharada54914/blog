/**
 * Export / Import utilities for JSON and CSV formats.
 * Pure functions — no DOM, no side-effects.
 */

// ===== CSV helpers =====

// BOM ensures Excel on Windows reads UTF-8 correctly
const BOM = '\uFEFF';

const CSV_HEADERS = [
  'name', 'furigana', 'company', 'department', 'position',
  'email', 'phone', 'mobile', 'address', 'website', 'tags', 'notes',
];

/** Wrap a CSV field value in quotes if it contains special characters. */
function csvField(value) {
  const str = String(value ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

/**
 * Parse a single CSV line respecting quoted fields (RFC 4180).
 * Returns an array of string values.
 */
export function parseCSVLine(line) {
  const fields = [];
  let i = 0;

  while (i <= line.length) {
    if (i === line.length) {
      // Trailing comma edge case — already pushed in loop, just break
      break;
    }

    if (line[i] === '"') {
      // Quoted field
      let field = '';
      i++; // skip opening quote
      while (i < line.length) {
        if (line[i] === '"' && line[i + 1] === '"') {
          field += '"';
          i += 2;
        } else if (line[i] === '"') {
          i++; // skip closing quote
          break;
        } else {
          field += line[i++];
        }
      }
      fields.push(field);
      if (line[i] === ',') i++; // skip comma after closing quote
    } else {
      // Unquoted field
      const end = line.indexOf(',', i);
      if (end === -1) {
        fields.push(line.slice(i));
        break;
      } else {
        fields.push(line.slice(i, end));
        i = end + 1;
      }
    }
  }

  return fields;
}

// ===== JSON =====

/**
 * Serialize cards to a pretty-printed JSON string.
 * Photos (hasPhoto flag + IndexedDB blobs) are intentionally excluded.
 */
export function exportJSON(cards) {
  const exportable = cards.map(({ hasPhoto: _h, ...rest }) => rest);
  return JSON.stringify(exportable, null, 2);
}

/**
 * Parse a JSON string into an array of card objects.
 * Throws on invalid JSON or non-array root.
 * Skips entries without a non-empty `name` field.
 */
export function parseImportJSON(str) {
  const data = JSON.parse(str); // throws SyntaxError on invalid input
  if (!Array.isArray(data)) throw new TypeError('JSONのルートは配列である必要があります');

  return data
    .filter(item => item && typeof item === 'object' && String(item.name ?? '').trim())
    .map(item => ({
      id:         String(item.id || generateId()),
      name:       String(item.name).trim(),
      furigana:   String(item.furigana   || ''),
      company:    String(item.company    || ''),
      department: String(item.department || ''),
      position:   String(item.position   || ''),
      email:      String(item.email      || ''),
      phone:      String(item.phone      || ''),
      mobile:     String(item.mobile     || ''),
      address:    String(item.address    || ''),
      website:    String(item.website    || ''),
      tags:       Array.isArray(item.tags) ? item.tags.map(String) : [],
      notes:      String(item.notes      || ''),
      hasPhoto:   false,
      createdAt:  item.createdAt || new Date().toISOString(),
      ...(item.updatedAt ? { updatedAt: item.updatedAt } : {}),
    }));
}

// ===== CSV =====

/**
 * Serialize cards to a CSV string (BOM + header row + data rows, CRLF).
 * Tags are joined with "; " so they survive the comma-separated format.
 */
export function exportCSV(cards) {
  const rows = [CSV_HEADERS.join(',')];

  for (const card of cards) {
    const row = CSV_HEADERS.map(key => {
      if (key === 'tags') return csvField((card.tags || []).join('; '));
      return csvField(card[key] ?? '');
    });
    rows.push(row.join(','));
  }

  return BOM + rows.join('\r\n');
}

/**
 * Parse a CSV string (with optional BOM + header row) into card objects.
 * Expects the header row to match CSV_HEADERS (any order is supported).
 * Skips rows without a non-empty `name` field.
 */
export function parseImportCSV(str) {
  // Strip BOM if present
  const clean = str.startsWith('\uFEFF') ? str.slice(1) : str;
  const lines = clean.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]);
  const results = [];

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCSVLine(lines[i]);
    const obj = Object.fromEntries(headers.map((h, idx) => [h, fields[idx] ?? '']));

    if (!String(obj.name ?? '').trim()) continue;

    results.push({
      id:         generateId(),
      name:       obj.name.trim(),
      furigana:   obj.furigana   || '',
      company:    obj.company    || '',
      department: obj.department || '',
      position:   obj.position   || '',
      email:      obj.email      || '',
      phone:      obj.phone      || '',
      mobile:     obj.mobile     || '',
      address:    obj.address    || '',
      website:    obj.website    || '',
      tags:       obj.tags ? obj.tags.split(';').map(t => t.trim()).filter(Boolean) : [],
      notes:      obj.notes      || '',
      hasPhoto:   false,
      createdAt:  new Date().toISOString(),
    });
  }

  return results;
}

// ===== Shared =====

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
