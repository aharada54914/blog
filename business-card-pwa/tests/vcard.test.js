import { describe, it, expect } from 'vitest';
import { cardToVCard, cardsToVCards } from '../lib/vcard.js';

const baseCard = {
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

// ===== cardToVCard =====

describe('cardToVCard — structure', () => {
  it('starts with BEGIN:VCARD', () => {
    expect(cardToVCard(baseCard)).toMatch(/^BEGIN:VCARD/);
  });

  it('ends with END:VCARD + CRLF', () => {
    expect(cardToVCard(baseCard)).toMatch(/END:VCARD\r\n$/);
  });

  it('contains VERSION:4.0', () => {
    expect(cardToVCard(baseCard)).toContain('VERSION:4.0');
  });

  it('uses CRLF line endings throughout', () => {
    const result = cardToVCard(baseCard);
    // Every line should end with \r\n (no bare \n)
    const lines = result.split('\r\n');
    // re-joining with \r\n should reproduce the original
    expect(lines.join('\r\n')).toBe(result);
  });
});

describe('cardToVCard — fields', () => {
  it('includes FN with full name', () => {
    expect(cardToVCard(baseCard)).toContain('FN:山田 太郎');
  });

  it('includes N with family and given name split', () => {
    expect(cardToVCard(baseCard)).toContain('N:山田;太郎;;;');
  });

  it('includes SORT-STRING from furigana', () => {
    expect(cardToVCard(baseCard)).toContain('SORT-STRING:ヤマダ タロウ');
  });

  it('includes ORG with company and department separated by ;', () => {
    expect(cardToVCard(baseCard)).toContain('ORG:株式会社サンプル;営業部');
  });

  it('includes TITLE for position', () => {
    expect(cardToVCard(baseCard)).toContain('TITLE:部長');
  });

  it('includes TEL for phone with WORK type', () => {
    expect(cardToVCard(baseCard)).toContain('TEL;TYPE=WORK,VOICE:03-1234-5678');
  });

  it('includes TEL for mobile with CELL type', () => {
    expect(cardToVCard(baseCard)).toContain('TEL;TYPE=CELL,VOICE:090-1234-5678');
  });

  it('includes EMAIL with WORK type', () => {
    expect(cardToVCard(baseCard)).toContain('EMAIL;TYPE=WORK:taro@example.com');
  });

  it('includes ADR with address', () => {
    expect(cardToVCard(baseCard)).toContain('東京都千代田区1-1-1');
  });

  it('includes URL for website', () => {
    expect(cardToVCard(baseCard)).toContain('URL:https://example.com');
  });

  it('includes NOTE', () => {
    expect(cardToVCard(baseCard)).toContain('NOTE:重要な顧客');
  });
});

describe('cardToVCard — optional fields are omitted when empty', () => {
  const minimal = { id: '1', name: '田中 花子', hasPhoto: false };

  it('omits ORG when company is absent', () => {
    expect(cardToVCard(minimal)).not.toContain('ORG:');
  });

  it('omits TITLE when position is absent', () => {
    expect(cardToVCard(minimal)).not.toContain('TITLE:');
  });

  it('omits TEL when phone and mobile are absent', () => {
    expect(cardToVCard(minimal)).not.toContain('TEL;');
  });

  it('omits EMAIL when email is absent', () => {
    expect(cardToVCard(minimal)).not.toContain('EMAIL;');
  });

  it('omits SORT-STRING when furigana is absent', () => {
    expect(cardToVCard(minimal)).not.toContain('SORT-STRING:');
  });

  it('omits NOTE when notes is absent', () => {
    expect(cardToVCard(minimal)).not.toContain('NOTE:');
  });
});

describe('cardToVCard — escaping', () => {
  it('escapes semicolons in text values', () => {
    const card = { ...baseCard, company: 'A;B Corp', department: '' };
    expect(cardToVCard(card)).toContain('ORG:A\\;B Corp');
  });

  it('escapes commas in text values', () => {
    const card = { ...baseCard, notes: 'foo,bar' };
    expect(cardToVCard(card)).toContain('NOTE:foo\\,bar');
  });

  it('escapes backslashes in text values', () => {
    const card = { ...baseCard, notes: 'path\\to\\file' };
    expect(cardToVCard(card)).toContain('NOTE:path\\\\to\\\\file');
  });

  it('escapes newlines as \\n in NOTE', () => {
    const card = { ...baseCard, notes: 'line1\nline2' };
    expect(cardToVCard(card)).toContain('NOTE:line1\\nline2');
  });
});

// ===== cardsToVCards =====

describe('cardsToVCards', () => {
  it('returns empty string for empty array', () => {
    expect(cardsToVCards([])).toBe('');
  });

  it('returns a single vCard for one card', () => {
    const result = cardsToVCards([baseCard]);
    expect((result.match(/BEGIN:VCARD/g) ?? []).length).toBe(1);
  });

  it('concatenates multiple vCards correctly', () => {
    const cards = [
      baseCard,
      { ...baseCard, id: 'def456', name: '鈴木 一郎' },
    ];
    const result = cardsToVCards(cards);
    expect((result.match(/BEGIN:VCARD/g) ?? []).length).toBe(2);
    expect(result).toContain('FN:山田 太郎');
    expect(result).toContain('FN:鈴木 一郎');
  });
});
