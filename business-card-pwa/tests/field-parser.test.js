import { describe, it, expect } from 'vitest';
import {
  extractEmail,
  extractPhones,
  extractWebsite,
  extractCompany,
  extractPosition,
  extractAddress,
  parseOCRText,
} from '../lib/field-parser.js';

// ===== extractEmail =====

describe('extractEmail', () => {
  it('extracts a standard email address', () => {
    expect(extractEmail('Mail: taro@example.com')).toBe('taro@example.com');
  });

  it('extracts an email with subdomain', () => {
    expect(extractEmail('taro@mail.example.co.jp')).toBe('taro@mail.example.co.jp');
  });

  it('extracts an email with + addressing', () => {
    expect(extractEmail('taro+work@example.com')).toBe('taro+work@example.com');
  });

  it('extracts email from a mixed line', () => {
    expect(extractEmail('TEL:03-1234-5678 / taro@example.com')).toBe('taro@example.com');
  });

  it('returns empty string when no email is present', () => {
    expect(extractEmail('山田 太郎\n株式会社サンプル')).toBe('');
  });
});

// ===== extractPhones =====

describe('extractPhones', () => {
  it('extracts a standard Tokyo landline', () => {
    expect(extractPhones('TEL: 03-1234-5678')[0]).toBe('03-1234-5678');
  });

  it('extracts a mobile number', () => {
    expect(extractPhones('Mobile: 090-1234-5678')[0]).toBe('090-1234-5678');
  });

  it('extracts a toll-free number (0120)', () => {
    expect(extractPhones('0120-123-456')[0]).toBe('0120-123-456');
  });

  it('returns both phone and mobile when two numbers are present', () => {
    const phones = extractPhones('TEL: 03-1234-5678\nMobile: 090-1234-5678');
    expect(phones[0]).toBe('03-1234-5678');
    expect(phones[1]).toBe('090-1234-5678');
  });

  it('deduplicates identical numbers', () => {
    const phones = extractPhones('03-1234-5678 / 03-1234-5678');
    expect(phones).toHaveLength(1);
  });

  it('returns empty array when no phone number is present', () => {
    expect(extractPhones('taro@example.com')).toHaveLength(0);
  });
});

// ===== extractWebsite =====

describe('extractWebsite', () => {
  it('extracts an https URL', () => {
    expect(extractWebsite('https://www.example.com')).toBe('https://www.example.com');
  });

  it('extracts an http URL', () => {
    expect(extractWebsite('http://example.com/path')).toBe('http://example.com/path');
  });

  it('extracts a www. URL and prepends https://', () => {
    expect(extractWebsite('www.example.co.jp')).toBe('https://www.example.co.jp');
  });

  it('prefers https URL over www fallback when both are present', () => {
    const text = 'https://example.com\nwww.other.com';
    expect(extractWebsite(text)).toBe('https://example.com');
  });

  it('returns empty string when no URL is present', () => {
    expect(extractWebsite('山田 太郎 / 03-1234-5678')).toBe('');
  });
});

// ===== extractCompany =====

describe('extractCompany', () => {
  it('extracts a 株式会社 prefix form', () => {
    expect(extractCompany('株式会社サンプル')).toBe('株式会社サンプル');
  });

  it('extracts a 株式会社 suffix form', () => {
    expect(extractCompany('サンプル株式会社')).toBe('サンプル株式会社');
  });

  it('extracts 有限会社', () => {
    expect(extractCompany('有限会社テスト商事')).toBe('有限会社テスト商事');
  });

  it('extracts 合同会社', () => {
    expect(extractCompany('合同会社フォワード')).toBe('合同会社フォワード');
  });

  it('extracts English "Inc." form', () => {
    const text = 'Sample Corp.\nJohn Smith\nSample Inc.';
    expect(extractCompany(text)).toBe('Sample Inc.');
  });

  it('extracts "Co., Ltd." form', () => {
    expect(extractCompany('Sample Co., Ltd.')).toBe('Sample Co., Ltd.');
  });

  it('returns empty string when no company marker is found', () => {
    expect(extractCompany('山田 太郎\n03-1234-5678')).toBe('');
  });
});

// ===== extractPosition =====

describe('extractPosition', () => {
  it('extracts 部長', () => {
    expect(extractPosition('営業部 部長')).toBe('営業部 部長');
  });

  it('extracts 代表取締役社長 (most specific first)', () => {
    const text = '代表取締役社長\n取締役';
    expect(extractPosition(text)).toBe('代表取締役社長');
  });

  it('extracts CEO', () => {
    expect(extractPosition('John Smith\nCEO')).toBe('CEO');
  });

  it('extracts Director', () => {
    expect(extractPosition('Sales Director')).toBe('Sales Director');
  });

  it('extracts 課長', () => {
    expect(extractPosition('第一営業部 課長')).toBe('第一営業部 課長');
  });

  it('returns empty string when no position keyword is found', () => {
    expect(extractPosition('山田 太郎\n株式会社サンプル')).toBe('');
  });
});

// ===== extractAddress =====

describe('extractAddress', () => {
  it('extracts a line containing a 〒 postal code marker', () => {
    const text = '山田 太郎\n〒100-0001 東京都千代田区千代田1-1';
    expect(extractAddress(text)).toBe('〒100-0001 東京都千代田区千代田1-1');
  });

  it('prefers 〒 line over prefecture-only line', () => {
    const text = '東京都渋谷区\n〒100-0001 東京都千代田区千代田1-1';
    expect(extractAddress(text)).toBe('〒100-0001 東京都千代田区千代田1-1');
  });

  it('falls back to prefecture name when no 〒 is present', () => {
    const text = '山田 太郎\n大阪府大阪市北区梅田1-1-1';
    expect(extractAddress(text)).toBe('大阪府大阪市北区梅田1-1-1');
  });

  it('extracts 東京都 address', () => {
    expect(extractAddress('東京都新宿区西新宿2-8-1')).toBe('東京都新宿区西新宿2-8-1');
  });

  it('returns empty string when no address indicator is found', () => {
    expect(extractAddress('山田 太郎\n03-1234-5678')).toBe('');
  });
});

// ===== parseOCRText (integration) =====

describe('parseOCRText', () => {
  it('returns all empty strings for empty input', () => {
    const result = parseOCRText('');
    expect(result.email).toBe('');
    expect(result.phone).toBe('');
    expect(result.mobile).toBe('');
    expect(result.website).toBe('');
    expect(result.company).toBe('');
    expect(result.position).toBe('');
    expect(result.address).toBe('');
  });

  it('returns all empty strings for null/undefined input', () => {
    const result = parseOCRText(null);
    expect(result.email).toBe('');
    expect(result.company).toBe('');
  });

  it('extracts multiple fields from a realistic business card OCR output', () => {
    const ocr = [
      '株式会社サンプル',
      '営業部 部長',
      '山田 太郎',
      'TEL: 03-1234-5678',
      'Mobile: 090-1234-5678',
      'taro@example.com',
      '〒100-0001 東京都千代田区千代田1-1',
      'https://www.example.com',
    ].join('\n');

    const result = parseOCRText(ocr);
    expect(result.company).toBe('株式会社サンプル');
    expect(result.position).toBe('営業部 部長');
    expect(result.phone).toBe('03-1234-5678');
    expect(result.mobile).toBe('090-1234-5678');
    expect(result.email).toBe('taro@example.com');
    expect(result.address).toBe('〒100-0001 東京都千代田区千代田1-1');
    expect(result.website).toBe('https://www.example.com');
  });

  it('assigns first phone to phone and second to mobile', () => {
    const result = parseOCRText('TEL 06-9876-5432\nFAX 06-9876-0000');
    expect(result.phone).toBe('06-9876-5432');
    expect(result.mobile).toBe('06-9876-0000');
  });

  it('does not include a name field in the returned object', () => {
    const result = parseOCRText('山田 太郎');
    expect(result).not.toHaveProperty('name');
  });
});
