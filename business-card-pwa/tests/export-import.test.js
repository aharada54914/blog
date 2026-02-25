import { describe, it, expect } from 'vitest';
import {
  exportJSON,
  parseImportJSON,
  exportCSV,
  parseImportCSV,
  parseCSVLine,
} from '../lib/export-import.js';

const sampleCard = {
  id: 'abc123',
  name: '山田 太郎',
  furigana: 'ヤマダ タロウ',
  company: '株式会社サンプル',
  department: '営業部',
  position: '部長',
  email: 'taro@example.com',
  phone: '03-1234-5678',
  mobile: '090-1234-5678',
  address: '東京都千代田区1-1-1',
  website: 'https://example.com',
  tags: ['IT', '取引先'],
  notes: '重要な顧客',
  hasPhoto: false,
  createdAt: '2024-01-01T00:00:00.000Z',
};

// ===== parseCSVLine (unit) =====

describe('parseCSVLine', () => {
  it('parses a simple comma-separated line', () => {
    expect(parseCSVLine('a,b,c')).toEqual(['a', 'b', 'c']);
  });

  it('parses a quoted field containing a comma', () => {
    expect(parseCSVLine('"a,b",c')).toEqual(['a,b', 'c']);
  });

  it('parses escaped double-quotes inside quoted field', () => {
    expect(parseCSVLine('"say ""hello"""')).toEqual(['say "hello"']);
  });

  it('parses an empty field', () => {
    expect(parseCSVLine('a,,c')).toEqual(['a', '', 'c']);
  });

  it('parses a quoted field containing a newline', () => {
    expect(parseCSVLine('"line1\nline2",next')).toEqual(['line1\nline2', 'next']);
  });
});

// ===== JSON export / import =====

describe('exportJSON', () => {
  it('produces valid JSON', () => {
    expect(() => JSON.parse(exportJSON([sampleCard]))).not.toThrow();
  });

  it('omits the hasPhoto field', () => {
    const json = exportJSON([sampleCard]);
    const parsed = JSON.parse(json);
    expect(parsed[0]).not.toHaveProperty('hasPhoto');
  });

  it('preserves all text fields', () => {
    const json = exportJSON([sampleCard]);
    const parsed = JSON.parse(json);
    expect(parsed[0].name).toBe(sampleCard.name);
    expect(parsed[0].email).toBe(sampleCard.email);
    expect(parsed[0].tags).toEqual(sampleCard.tags);
  });
});

describe('parseImportJSON', () => {
  it('throws SyntaxError on invalid JSON', () => {
    expect(() => parseImportJSON('not json')).toThrow(SyntaxError);
  });

  it('throws TypeError when root is not an array', () => {
    expect(() => parseImportJSON('{"name":"test"}')).toThrow(TypeError);
  });

  it('skips items without a name', () => {
    const json = JSON.stringify([{ id: '1' }, { id: '2', name: '有効カード' }]);
    expect(parseImportJSON(json)).toHaveLength(1);
  });

  it('skips items with a blank name', () => {
    const json = JSON.stringify([{ name: '   ' }, { name: '田中' }]);
    expect(parseImportJSON(json)).toHaveLength(1);
  });

  it('assigns a createdAt when missing', () => {
    const json = JSON.stringify([{ name: '田中 花子' }]);
    const result = parseImportJSON(json);
    expect(result[0].createdAt).toBeTruthy();
  });

  it('preserves original id when present', () => {
    const json = JSON.stringify([{ id: 'myid', name: '田中 花子' }]);
    expect(parseImportJSON(json)[0].id).toBe('myid');
  });

  it('sets hasPhoto: false regardless of input', () => {
    const json = JSON.stringify([{ name: '田中', hasPhoto: true }]);
    expect(parseImportJSON(json)[0].hasPhoto).toBe(false);
  });

  it('normalises tags from array', () => {
    const json = JSON.stringify([{ name: 'A', tags: ['x', 'y'] }]);
    expect(parseImportJSON(json)[0].tags).toEqual(['x', 'y']);
  });
});

describe('exportJSON / parseImportJSON round-trip', () => {
  it('restores name, email, and tags identically', () => {
    const [result] = parseImportJSON(exportJSON([sampleCard]));
    expect(result.name).toBe(sampleCard.name);
    expect(result.email).toBe(sampleCard.email);
    expect(result.tags).toEqual(sampleCard.tags);
  });

  it('restores all text fields', () => {
    const fields = ['furigana', 'company', 'department', 'position', 'phone', 'mobile', 'address', 'website', 'notes'];
    const [result] = parseImportJSON(exportJSON([sampleCard]));
    for (const f of fields) {
      expect(result[f]).toBe(sampleCard[f]);
    }
  });
});

// ===== CSV export / import =====

describe('exportCSV', () => {
  it('starts with UTF-8 BOM', () => {
    expect(exportCSV([sampleCard]).charCodeAt(0)).toBe(0xFEFF);
  });

  it('first data line after BOM is a header row containing "name"', () => {
    const csv = exportCSV([sampleCard]);
    const firstLine = csv.slice(1).split('\r\n')[0]; // skip BOM
    expect(firstLine).toContain('name');
    expect(firstLine).toContain('email');
    expect(firstLine).toContain('tags');
  });

  it('uses CRLF line endings', () => {
    const csv = exportCSV([sampleCard]);
    expect(csv).toContain('\r\n');
  });

  it('wraps fields containing commas in quotes', () => {
    const card = { ...sampleCard, address: '東京都, 千代田区' };
    expect(exportCSV([card])).toContain('"東京都, 千代田区"');
  });

  it('escapes double-quotes by doubling them', () => {
    const card = { ...sampleCard, notes: 'say "hello"' };
    expect(exportCSV([card])).toContain('"say ""hello"""');
  });

  it('serialises tags as semicolon-separated values', () => {
    const csv = exportCSV([sampleCard]);
    // Tags ['IT', '取引先'] → "IT; 取引先"
    expect(csv).toContain('IT; 取引先');
  });

  it('returns only BOM + header for empty array', () => {
    const csv = exportCSV([]);
    const lines = csv.slice(1).split('\r\n').filter(Boolean);
    expect(lines).toHaveLength(1); // header only
  });
});

describe('parseImportCSV', () => {
  it('returns empty array when only header is present', () => {
    expect(parseImportCSV(exportCSV([]))).toHaveLength(0);
  });

  it('skips rows with empty name', () => {
    const csv = 'name,email\r\n,test@example.com\r\n有効,valid@example.com';
    expect(parseImportCSV(csv)).toHaveLength(1);
  });

  it('sets hasPhoto: false', () => {
    const [result] = parseImportCSV(exportCSV([sampleCard]));
    expect(result.hasPhoto).toBe(false);
  });

  it('assigns createdAt', () => {
    const [result] = parseImportCSV(exportCSV([sampleCard]));
    expect(result.createdAt).toBeTruthy();
  });

  it('handles CSV with BOM', () => {
    const csv = '\uFEFFname,email\r\n田中,t@example.com';
    const [result] = parseImportCSV(csv);
    expect(result.name).toBe('田中');
  });
});

describe('exportCSV / parseImportCSV round-trip', () => {
  it('restores name and email', () => {
    const [result] = parseImportCSV(exportCSV([sampleCard]));
    expect(result.name).toBe(sampleCard.name);
    expect(result.email).toBe(sampleCard.email);
  });

  it('restores tags array from semicolon-separated value', () => {
    const [result] = parseImportCSV(exportCSV([sampleCard]));
    expect(result.tags).toEqual(sampleCard.tags);
  });

  it('restores field containing a comma', () => {
    const card = { ...sampleCard, address: '東京都, 千代田区' };
    const [result] = parseImportCSV(exportCSV([card]));
    expect(result.address).toBe('東京都, 千代田区');
  });

  it('restores field containing double-quotes', () => {
    const card = { ...sampleCard, notes: 'She said "hello"' };
    const [result] = parseImportCSV(exportCSV([card]));
    expect(result.notes).toBe('She said "hello"');
  });

  it('round-trips multiple cards', () => {
    const cards = [sampleCard, { ...sampleCard, id: 'xyz', name: '鈴木 一郎', email: 'suzuki@example.com' }];
    const results = parseImportCSV(exportCSV(cards));
    expect(results).toHaveLength(2);
    expect(results[1].name).toBe('鈴木 一郎');
  });
});
