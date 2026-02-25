import { cardToVCard, cardsToVCards } from './lib/vcard.js';
import { exportJSON, exportCSV, parseImportJSON, parseImportCSV } from './lib/export-import.js';
import { renderQR } from './lib/qr.js';
import { recognizeImage } from './lib/ocr.js';
import { parseOCRText } from './lib/field-parser.js';

// ===== Dark Mode (apply immediately to prevent FOUC) =====
const THEME_KEY = 'meishi_theme';

function getTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved) return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);
}

applyTheme(getTheme());

// ===== IndexedDB =====
const DB_NAME = 'meishi_db';
const DB_VERSION = 1;
const PHOTO_STORE = 'photos';
let db = null;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const database = e.target.result;
      if (!database.objectStoreNames.contains(PHOTO_STORE)) {
        database.createObjectStore(PHOTO_STORE);
      }
    };
    req.onsuccess = (e) => { db = e.target.result; resolve(db); };
    req.onerror = (e) => reject(e.target.error);
  });
}

function savePhotoDB(id, blob) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE, 'readwrite');
    tx.objectStore(PHOTO_STORE).put(blob, id);
    tx.oncomplete = resolve;
    tx.onerror = (e) => reject(e.target.error);
  });
}

function getPhotoDB(id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE, 'readonly');
    const req = tx.objectStore(PHOTO_STORE).get(id);
    req.onsuccess = (e) => resolve(e.target.result || null);
    req.onerror = (e) => reject(e.target.error);
  });
}

function deletePhotoDB(id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE, 'readwrite');
    tx.objectStore(PHOTO_STORE).delete(id);
    tx.oncomplete = resolve;
    tx.onerror = (e) => reject(e.target.error);
  });
}

// ===== Photo URL Cache =====
const photoUrlCache = new Map();

function revokePhotoUrl(id) {
  const url = photoUrlCache.get(id);
  if (url) { URL.revokeObjectURL(url); photoUrlCache.delete(id); }
}

async function getPhotoUrl(id) {
  if (photoUrlCache.has(id)) return photoUrlCache.get(id);
  const blob = await getPhotoDB(id);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  photoUrlCache.set(id, url);
  return url;
}

// ===== Storage =====
const STORE_KEY = 'meishi_cards';

function loadCards() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveCards(cards) {
  localStorage.setItem(STORE_KEY, JSON.stringify(cards));
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ===== Migration: base64 photos → IndexedDB =====
async function migratePhotos() {
  let changed = false;
  for (const card of cards) {
    if (card.photo && card.photo.startsWith('data:')) {
      try {
        const res = await fetch(card.photo);
        const blob = await res.blob();
        await savePhotoDB(card.id, blob);
        card.hasPhoto = true;
        delete card.photo;
        changed = true;
      } catch {
        // Leave as-is on failure
      }
    }
  }
  if (changed) saveCards(cards);
}

// ===== State =====
let cards = loadCards();
let searchQuery = '';
let currentDetailId = null;
let sortBy = 'createdAt';

// ===== DOM refs =====
const $ = (id) => document.getElementById(id);
const cardList   = $('card-list');
const emptyState = $('empty-state');

// Header
const btnAdd          = $('btn-add');
const btnSearchToggle = $('btn-search-toggle');
const btnTheme        = $('btn-theme');
const btnMenu         = $('btn-menu');
const searchBar       = $('search-bar');
const searchInput     = $('search-input');
const fab             = $('fab');

// Sort chips
const sortChips = document.querySelectorAll('.sort-chip');

// Action menu
const actionMenu = $('action-menu');
const importFile = $('import-file');

// Scan
const btnScan   = $('btn-scan');
const scanPhoto = $('scan-photo');
const scanHint  = $('scan-hint');

// Add/Edit modal
const modalOverlay  = $('modal-overlay');
const modalTitle    = $('modal-title');
const cardForm      = $('card-form');
const btnModalClose = $('btn-modal-close');
const btnCancel     = $('btn-cancel');
const photoPreview  = $('photo-preview');
const formPhoto     = $('form-photo');

// Detail modal
const detailOverlay   = $('detail-overlay');
const detailContent   = $('detail-content');
const btnDetailClose  = $('btn-detail-close');
const btnDetailEdit   = $('btn-detail-edit');
const btnDetailDelete = $('btn-detail-delete');
const btnDetailQr     = $('btn-detail-qr');

// QR modal
const qrOverlay     = $('qr-overlay');
const qrCanvasWrap  = $('qr-canvas-wrap');
const qrName        = $('qr-name');
const btnQrClose    = $('btn-qr-close');

// Toast
const toast = $('toast');
let toastTimer;

// ===== Render =====
function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return parts[0][0] + parts[1][0];
  return name.slice(0, 2);
}

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderAvatarHtml(card, cls) {
  return `<div class="${cls}" data-id="${escHtml(card.id)}">${escHtml(getInitials(card.name))}</div>`;
}

async function loadAvatarPhoto(el, card) {
  if (!card.hasPhoto || !el) return;
  try {
    const url = await getPhotoUrl(card.id);
    if (!url || !el.isConnected) return;
    el.innerHTML = `<img src="${url}" alt="${escHtml(card.name)}" />`;
  } catch {
    // Initials remain
  }
}

function renderCardItem(card) {
  const li = document.createElement('li');
  li.className = 'card-item';
  li.dataset.id = card.id;
  li.setAttribute('role', 'button');
  li.setAttribute('tabindex', '0');
  li.setAttribute('aria-label', `${card.name}の名刺`);

  const tags = (card.tags || [])
    .map((t) => `<span class="tag">${escHtml(t)}</span>`)
    .join('');

  li.innerHTML = `
    ${renderAvatarHtml(card, 'card-avatar')}
    <div class="card-body">
      ${card.furigana ? `<div class="card-furigana">${escHtml(card.furigana)}</div>` : ''}
      <div class="card-name">${escHtml(card.name)}</div>
      ${card.company ? `<div class="card-company">${escHtml(card.company)}</div>` : ''}
      ${card.position ? `<div class="card-position">${escHtml(card.position)}</div>` : ''}
      ${tags ? `<div class="card-tags">${tags}</div>` : ''}
    </div>
  `;

  if (card.hasPhoto) loadAvatarPhoto(li.querySelector('.card-avatar'), card);

  li.addEventListener('click', () => openDetail(card.id));
  li.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(card.id); }
  });

  return li;
}

function filteredCards() {
  if (!searchQuery) return [...cards];
  const q = searchQuery.toLowerCase();
  return cards.filter(
    (c) =>
      (c.name || '').toLowerCase().includes(q) ||
      (c.furigana || '').toLowerCase().includes(q) ||
      (c.company || '').toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q) ||
      (c.tags || []).some((t) => t.toLowerCase().includes(q))
  );
}

function sortedCards(list) {
  if (sortBy === 'name') {
    return list.sort((a, b) => {
      const fa = a.furigana || a.name || '';
      const fb = b.furigana || b.name || '';
      return fa.localeCompare(fb, 'ja');
    });
  }
  if (sortBy === 'company') {
    return list.sort((a, b) =>
      (a.company || '').localeCompare(b.company || '', 'ja')
    );
  }
  return list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}

function renderList() {
  const list = sortedCards(filteredCards());
  cardList.innerHTML = '';

  if (list.length === 0) {
    emptyState.classList.remove('hidden');
    emptyState.querySelector('.empty-sub').textContent = searchQuery
      ? '検索結果がありません'
      : '右上の＋ボタンで名刺を追加しましょう';
  } else {
    emptyState.classList.add('hidden');
    list.forEach((c) => cardList.appendChild(renderCardItem(c)));
  }
}

// ===== Sort =====
sortChips.forEach((chip) => {
  chip.addEventListener('click', () => {
    sortChips.forEach((c) => c.classList.remove('active'));
    chip.classList.add('active');
    sortBy = chip.dataset.sort;
    renderList();
  });
});

// ===== Add / Edit Modal =====
let pendingPhotoBlob = null;
let pendingPhotoPreviewUrl = null;

function clearPendingPhoto() {
  if (pendingPhotoPreviewUrl) {
    URL.revokeObjectURL(pendingPhotoPreviewUrl);
    pendingPhotoPreviewUrl = null;
  }
  pendingPhotoBlob = null;
}

function openAddModal() {
  modalTitle.textContent = '名刺を追加';
  cardForm.reset();
  $('form-id').value = '';
  clearPendingPhoto();
  photoPreview.innerHTML = '<span class="photo-placeholder">👤</span>';
  clearErrors();
  modalOverlay.classList.remove('hidden');
  setTimeout(() => $('form-name').focus(), 50);
}

async function openEditModal(card) {
  modalTitle.textContent = '名刺を編集';
  $('form-id').value        = card.id;
  $('form-name').value      = card.name || '';
  $('form-furigana').value  = card.furigana || '';
  $('form-company').value   = card.company || '';
  $('form-department').value= card.department || '';
  $('form-position').value  = card.position || '';
  $('form-email').value     = card.email || '';
  $('form-phone').value     = card.phone || '';
  $('form-mobile').value    = card.mobile || '';
  $('form-address').value   = card.address || '';
  $('form-website').value   = card.website || '';
  $('form-tags').value      = (card.tags || []).join(', ');
  $('form-notes').value     = card.notes || '';

  clearPendingPhoto();
  photoPreview.innerHTML = '<span class="photo-placeholder">👤</span>';

  clearErrors();
  modalOverlay.classList.remove('hidden');
  setTimeout(() => $('form-name').focus(), 50);

  if (card.hasPhoto) {
    try {
      const url = await getPhotoUrl(card.id);
      if (url && !modalOverlay.classList.contains('hidden')) {
        photoPreview.innerHTML = `<img src="${url}" alt="写真" />`;
      }
    } catch { /* leave placeholder */ }
  }
}

function closeAddModal() {
  modalOverlay.classList.add('hidden');
  clearPendingPhoto();
}

function clearErrors() {
  $('err-name').textContent = '';
  $('form-name').classList.remove('invalid');
}

function validateForm() {
  const name = $('form-name').value.trim();
  if (!name) {
    $('err-name').textContent = '氏名は必須です';
    $('form-name').classList.add('invalid');
    return false;
  }
  $('err-name').textContent = '';
  $('form-name').classList.remove('invalid');
  return true;
}

function collectForm() {
  const tagsRaw = $('form-tags').value.trim();
  const tags = tagsRaw
    ? tagsRaw.split(',').map((t) => t.trim()).filter(Boolean)
    : [];

  return {
    name:       $('form-name').value.trim(),
    furigana:   $('form-furigana').value.trim(),
    company:    $('form-company').value.trim(),
    department: $('form-department').value.trim(),
    position:   $('form-position').value.trim(),
    email:      $('form-email').value.trim(),
    phone:      $('form-phone').value.trim(),
    mobile:     $('form-mobile').value.trim(),
    address:    $('form-address').value.trim(),
    website:    $('form-website').value.trim(),
    tags,
    notes:      $('form-notes').value.trim(),
  };
}

cardForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!validateForm()) return;

  const data = collectForm();
  const id = $('form-id').value;

  if (id) {
    const idx = cards.findIndex((c) => c.id === id);
    if (idx !== -1) {
      let hasPhoto = cards[idx].hasPhoto || false;
      if (pendingPhotoBlob) {
        await savePhotoDB(id, pendingPhotoBlob);
        revokePhotoUrl(id);
        hasPhoto = true;
      }
      cards[idx] = { ...cards[idx], ...data, hasPhoto, updatedAt: new Date().toISOString() };
    }
    showToast('名刺を更新しました');
  } else {
    const newId = generateId();
    let hasPhoto = false;
    if (pendingPhotoBlob) {
      await savePhotoDB(newId, pendingPhotoBlob);
      hasPhoto = true;
    }
    cards.push({ id: newId, ...data, hasPhoto, createdAt: new Date().toISOString() });
    showToast('名刺を追加しました');
  }

  saveCards(cards);
  renderList();
  closeAddModal();
});

formPhoto.addEventListener('change', () => {
  const file = formPhoto.files[0];
  if (!file) return;
  clearPendingPhoto();
  pendingPhotoBlob = file;
  pendingPhotoPreviewUrl = URL.createObjectURL(file);
  photoPreview.innerHTML = `<img src="${pendingPhotoPreviewUrl}" alt="写真" />`;
});
photoPreview.addEventListener('click', () => formPhoto.click());

// ===== Scan (OCR) =====
let isScanning = false;

function setFormDisabled(disabled) {
  cardForm.querySelectorAll('input, textarea, select').forEach(el => {
    el.disabled = disabled;
  });
  cardForm.querySelector('button[type="submit"]').disabled = disabled;
  btnScan.disabled = disabled;
}

function fillFormFromOCR(fields) {
  if (fields.company)  $('form-company').value  = fields.company;
  if (fields.position) $('form-position').value = fields.position;
  if (fields.email)    $('form-email').value    = fields.email;
  if (fields.phone)    $('form-phone').value    = fields.phone;
  if (fields.mobile)   $('form-mobile').value   = fields.mobile;
  if (fields.address)  $('form-address').value  = fields.address;
  if (fields.website)  $('form-website').value  = fields.website;
}

btnScan.addEventListener('click', () => {
  if (isScanning) return;
  scanPhoto.click();
});

scanPhoto.addEventListener('change', async () => {
  const file = scanPhoto.files[0];
  if (!file) return;

  // Use the scanned image as the avatar photo too
  clearPendingPhoto();
  pendingPhotoBlob = file;
  pendingPhotoPreviewUrl = URL.createObjectURL(file);

  isScanning = true;
  setFormDisabled(true);
  scanHint.classList.add('hidden');

  // Show spinner in preview
  photoPreview.innerHTML = `
    <div class="scan-progress">
      <div class="scan-spinner"></div>
      <span class="scan-pct">0%</span>
    </div>`;

  try {
    const rawText = await recognizeImage(file, (pct) => {
      const el = photoPreview.querySelector('.scan-pct');
      if (el) el.textContent = `${pct}%`;
    });

    // Restore photo preview
    photoPreview.innerHTML = `<img src="${pendingPhotoPreviewUrl}" alt="写真" />`;

    const fields = parseOCRText(rawText);
    fillFormFromOCR(fields);
    scanHint.classList.remove('hidden');
    showToast('解析完了。内容を確認・修正してください');
  } catch (err) {
    photoPreview.innerHTML = '<span class="photo-placeholder">👤</span>';
    clearPendingPhoto();
    showToast('スキャンに失敗しました: ' + (err.message || '不明なエラー'));
  } finally {
    isScanning = false;
    setFormDisabled(false);
    scanPhoto.value = '';
  }
});

// ===== Detail Modal =====
function detailField(icon, label, value, link = null) {
  if (!value) return '';
  const valHtml = link
    ? `<a href="${escHtml(link)}">${escHtml(value)}</a>`
    : escHtml(value);
  return `
    <div class="detail-field">
      <div class="detail-field-icon">${icon}</div>
      <div class="detail-field-body">
        <div class="detail-field-label">${label}</div>
        <div class="detail-field-value">${valHtml}</div>
      </div>
    </div>`;
}

async function openDetail(id) {
  const card = cards.find((c) => c.id === id);
  if (!card) return;
  currentDetailId = id;

  const tags = (card.tags || [])
    .map((t) => `<span class="tag">${escHtml(t)}</span>`)
    .join('');

  const companyLine = [card.company, card.department].filter(Boolean).join(' / ');

  detailContent.innerHTML = `
    <div class="detail-avatar-wrap">
      ${renderAvatarHtml(card, 'detail-avatar')}
      <div class="detail-name">${escHtml(card.name)}</div>
      ${card.furigana ? `<div class="detail-furigana">${escHtml(card.furigana)}</div>` : ''}
      ${companyLine ? `<div class="detail-company">${escHtml(companyLine)}</div>` : ''}
      ${card.position ? `<div class="detail-position">${escHtml(card.position)}</div>` : ''}
    </div>
    <div class="detail-divider"></div>
    <div class="detail-fields">
      ${detailField('📧', 'メール', card.email, card.email ? `mailto:${card.email}` : null)}
      ${detailField('📞', '電話', card.phone, card.phone ? `tel:${card.phone}` : null)}
      ${detailField('📱', '携帯', card.mobile, card.mobile ? `tel:${card.mobile}` : null)}
      ${detailField('🏢', '住所', card.address)}
      ${detailField('🌐', 'ウェブサイト', card.website, card.website)}
    </div>
    ${tags ? `<div class="detail-tags">${tags}</div>` : ''}
    ${card.notes ? `
      <div class="detail-divider"></div>
      <div class="detail-field-label" style="font-size:12px;font-weight:600;color:var(--text-hint);text-transform:uppercase;letter-spacing:.4px;">メモ</div>
      <div class="detail-notes">${escHtml(card.notes)}</div>
    ` : ''}
  `;

  detailOverlay.classList.remove('hidden');

  if (card.hasPhoto) {
    loadAvatarPhoto(detailContent.querySelector('.detail-avatar'), card);
  }
}

function closeDetail() {
  detailOverlay.classList.add('hidden');
  currentDetailId = null;
}

btnDetailEdit.addEventListener('click', () => {
  const card = cards.find((c) => c.id === currentDetailId);
  if (!card) return;
  closeDetail();
  openEditModal(card);
});

btnDetailDelete.addEventListener('click', async () => {
  if (!currentDetailId) return;
  const card = cards.find((c) => c.id === currentDetailId);
  if (!confirm(`「${card?.name}」を削除しますか？`)) return;

  if (card.hasPhoto) {
    try { await deletePhotoDB(currentDetailId); } catch { /* ignore */ }
    revokePhotoUrl(currentDetailId);
  }

  cards = cards.filter((c) => c.id !== currentDetailId);
  saveCards(cards);
  renderList();
  closeDetail();
  showToast('名刺を削除しました');
});

// ===== QR Modal =====
btnDetailQr.addEventListener('click', async () => {
  const card = cards.find((c) => c.id === currentDetailId);
  if (!card) return;

  qrName.textContent = card.name;
  qrCanvasWrap.innerHTML = '<div class="qr-loading">生成中...</div>';
  qrOverlay.classList.remove('hidden');

  try {
    await renderQR(qrCanvasWrap, cardToVCard(card));
  } catch {
    qrCanvasWrap.innerHTML = '<p class="qr-error">QRコードの生成に失敗しました</p>';
  }
});

btnQrClose.addEventListener('click', () => qrOverlay.classList.add('hidden'));
qrOverlay.addEventListener('click', (e) => {
  if (e.target === qrOverlay) qrOverlay.classList.add('hidden');
});

// ===== Toast =====
function showToast(msg) {
  clearTimeout(toastTimer);
  toast.textContent = msg;
  toast.classList.add('show');
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2500);
}

// ===== Action Menu =====
function closeMenu() {
  actionMenu.classList.add('hidden');
  btnMenu.setAttribute('aria-expanded', 'false');
}

btnMenu.addEventListener('click', (e) => {
  e.stopPropagation();
  const isOpen = !actionMenu.classList.contains('hidden');
  if (isOpen) {
    closeMenu();
  } else {
    // Position below entire header
    const headerBottom = document.querySelector('.header').getBoundingClientRect().bottom;
    actionMenu.style.top = `${headerBottom + 4}px`;
    actionMenu.classList.remove('hidden');
    btnMenu.setAttribute('aria-expanded', 'true');
  }
});

document.addEventListener('click', closeMenu);
actionMenu.addEventListener('click', (e) => e.stopPropagation());

// ===== File download helper =====
function downloadFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ===== Export =====
$('menu-export-json').addEventListener('click', () => {
  downloadFile('meishi-export.json', exportJSON(cards), 'application/json');
  closeMenu();
});

$('menu-export-csv').addEventListener('click', () => {
  downloadFile('meishi-export.csv', exportCSV(cards), 'text/csv;charset=utf-8;');
  closeMenu();
});

$('menu-export-vcard').addEventListener('click', () => {
  downloadFile('meishi-export.vcf', cardsToVCards(cards), 'text/vcard;charset=utf-8;');
  closeMenu();
});

// ===== Import =====
let importMode = null; // 'json' | 'csv'

$('menu-import-json').addEventListener('click', () => {
  importMode = 'json';
  importFile.accept = '.json,application/json';
  importFile.click();
  closeMenu();
});

$('menu-import-csv').addEventListener('click', () => {
  importMode = 'csv';
  importFile.accept = '.csv,text/csv';
  importFile.click();
  closeMenu();
});

importFile.addEventListener('change', async () => {
  const file = importFile.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const imported = importMode === 'json'
      ? parseImportJSON(text)
      : parseImportCSV(text);

    if (imported.length === 0) {
      showToast('インポートできるデータがありませんでした');
      return;
    }

    let added = 0;
    let updated = 0;

    for (const newCard of imported) {
      const idx = cards.findIndex((c) => c.id === newCard.id);
      if (idx !== -1) {
        cards[idx] = { ...cards[idx], ...newCard };
        updated++;
      } else {
        cards.push(newCard);
        added++;
      }
    }

    saveCards(cards);
    renderList();

    const parts = [];
    if (added)   parts.push(`${added}件追加`);
    if (updated) parts.push(`${updated}件更新`);
    showToast(parts.join('、') + 'しました');
  } catch (err) {
    showToast('インポート失敗: ' + (err.message || '不明なエラー'));
  }

  importFile.value = '';
});

// ===== Search =====
btnSearchToggle.addEventListener('click', () => {
  const hidden = searchBar.classList.toggle('hidden');
  if (!hidden) {
    searchInput.focus();
  } else {
    searchQuery = '';
    searchInput.value = '';
    renderList();
  }
});

searchInput.addEventListener('input', () => {
  searchQuery = searchInput.value.trim();
  renderList();
});

// ===== Dark Mode Toggle =====
btnTheme.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  applyTheme(current === 'dark' ? 'light' : 'dark');
});

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
  if (!localStorage.getItem(THEME_KEY)) {
    applyTheme(e.matches ? 'dark' : 'light');
  }
});

// ===== Event Bindings =====
btnAdd.addEventListener('click', openAddModal);
fab.addEventListener('click', openAddModal);
btnModalClose.addEventListener('click', closeAddModal);
btnCancel.addEventListener('click', closeAddModal);
btnDetailClose.addEventListener('click', closeDetail);

modalOverlay.addEventListener('click', (e) => {
  if (e.target === modalOverlay) closeAddModal();
});
detailOverlay.addEventListener('click', (e) => {
  if (e.target === detailOverlay) closeDetail();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!qrOverlay.classList.contains('hidden'))      { qrOverlay.classList.add('hidden'); return; }
    if (!modalOverlay.classList.contains('hidden'))   { closeAddModal(); return; }
    if (!detailOverlay.classList.contains('hidden'))  { closeDetail(); return; }
    if (!actionMenu.classList.contains('hidden'))     { closeMenu(); return; }
    if (!searchBar.classList.contains('hidden')) {
      searchBar.classList.add('hidden');
      searchQuery = '';
      searchInput.value = '';
      renderList();
    }
  }
});

if (new URLSearchParams(location.search).get('action') === 'add') {
  history.replaceState({}, '', location.pathname);
  openAddModal();
}

// ===== Service Worker =====
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./service-worker.js').catch(() => {});
}

// ===== Init =====
async function init() {
  renderList();
  await openDB();
  await migratePhotos();
  renderList();
}

init();
