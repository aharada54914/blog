/**
 * vCard 4.0 generation utilities.
 * Pure functions — no DOM, no side-effects.
 */

/**
 * Escape special characters in vCard text values.
 * Per RFC 6350 §3.3: \, ; and , must be escaped; newlines → \n
 */
function escapeText(str) {
  return String(str ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/**
 * Convert a single card object to a vCard 4.0 string.
 * Lines are separated by CRLF as required by RFC 6350.
 */
export function cardToVCard(card) {
  const lines = ['BEGIN:VCARD', 'VERSION:4.0'];

  // FN (full name) — required in vCard 4.0
  lines.push(`FN:${escapeText(card.name || '')}`);

  // N: family;given;additional;prefix;suffix
  const parts = (card.name || '').trim().split(/\s+/);
  const family = escapeText(parts[0] || '');
  const given  = escapeText(parts.slice(1).join(' ') || '');
  lines.push(`N:${family};${given};;;`);

  // SORT-STRING from furigana (non-standard but widely supported)
  if (card.furigana) {
    lines.push(`SORT-STRING:${escapeText(card.furigana)}`);
  }

  // ORG: company;department
  const orgParts = [card.company, card.department].filter(Boolean).map(escapeText);
  if (orgParts.length > 0) {
    lines.push(`ORG:${orgParts.join(';')}`);
  }

  if (card.position)  lines.push(`TITLE:${escapeText(card.position)}`);
  if (card.phone)     lines.push(`TEL;TYPE=WORK,VOICE:${card.phone}`);
  if (card.mobile)    lines.push(`TEL;TYPE=CELL,VOICE:${card.mobile}`);
  if (card.email)     lines.push(`EMAIL;TYPE=WORK:${card.email}`);

  // ADR: pobox;ext;street;city;region;postal;country
  if (card.address) {
    lines.push(`ADR;TYPE=WORK:;;${escapeText(card.address)};;;;`);
  }

  if (card.website) lines.push(`URL:${card.website}`);
  if (card.notes)   lines.push(`NOTE:${escapeText(card.notes)}`);

  lines.push('END:VCARD');
  return lines.join('\r\n') + '\r\n';
}

/**
 * Convert multiple cards to a single vCard string (concatenated).
 */
export function cardsToVCards(cards) {
  return cards.map(cardToVCard).join('');
}
