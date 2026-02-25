'use strict';

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

// ===== State =====
let cards = loadCards();
let searchQuery = '';
let currentDetailId = null;

// ===== DOM refs =====
const $ = (id) => document.getElementById(id);
const cardList   = $('card-list');
const emptyState = $('empty-state');

// Header
const btnAdd          = $('btn-add');
const btnSearchToggle = $('btn-search-toggle');
const searchBar       = $('search-bar');
const searchInput     = $('search-input');
const fab             = $('fab');

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

function renderAvatar(card, size = 'small') {
  const cls = size === 'large' ? 'detail-avatar' : 'card-avatar';
  if (card.photo) {
    return `<div class="${cls}"><img src="${escHtml(card.photo)}" alt="${escHtml(card.name)}" /></div>`;
  }
  return `<div class="${cls}">${escHtml(getInitials(card.name))}</div>`;
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
    ${renderAvatar(card)}
    <div class="card-body">
      ${card.furigana ? `<div class="card-furigana">${escHtml(card.furigana)}</div>` : ''}
      <div class="card-name">${escHtml(card.name)}</div>
      ${card.company ? `<div class="card-company">${escHtml(card.company)}</div>` : ''}
      ${card.position ? `<div class="card-position">${escHtml(card.position)}</div>` : ''}
      ${tags ? `<div class="card-tags">${tags}</div>` : ''}
    </div>
  `;

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

function renderList() {
  const list = filteredCards();
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

// ===== Add / Edit Modal =====
let photoDataUrl = null;

function openAddModal() {
  modalTitle.textContent = '名刺を追加';
  cardForm.reset();
  $('form-id').value = '';
  photoDataUrl = null;
  photoPreview.innerHTML = '<span class="photo-placeholder">👤</span>';
  clearErrors();
  modalOverlay.classList.remove('hidden');
  setTimeout(() => $('form-name').focus(), 50);
}

function openEditModal(card) {
  modalTitle.textContent = '名刺を編集';
  $('form-id').value    = card.id;
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

  photoDataUrl = card.photo || null;
  photoPreview.innerHTML = card.photo
    ? `<img src="${escHtml(card.photo)}" alt="写真" />`
    : '<span class="photo-placeholder">👤</span>';

  clearErrors();
  modalOverlay.classList.remove('hidden');
  setTimeout(() => $('form-name').focus(), 50);
}

function closeAddModal() {
  modalOverlay.classList.add('hidden');
}

function clearErrors() {
  $('err-name').textContent = '';
  $('form-name').classList.remove('invalid');
}

function validateForm() {
  let ok = true;
  const name = $('form-name').value.trim();
  if (!name) {
    $('err-name').textContent = '氏名は必須です';
    $('form-name').classList.add('invalid');
    ok = false;
  } else {
    $('err-name').textContent = '';
    $('form-name').classList.remove('invalid');
  }
  return ok;
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
    photo:      photoDataUrl || null,
  };
}

cardForm.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!validateForm()) return;

  const data = collectForm();
  const id = $('form-id').value;

  if (id) {
    // Edit
    const idx = cards.findIndex((c) => c.id === id);
    if (idx !== -1) {
      cards[idx] = { ...cards[idx], ...data, updatedAt: new Date().toISOString() };
    }
    showToast('名刺を更新しました');
  } else {
    // Add
    cards.push({ id: generateId(), ...data, createdAt: new Date().toISOString() });
    showToast('名刺を追加しました');
  }

  saveCards(cards);
  renderList();
  closeAddModal();
});

// Photo picker
formPhoto.addEventListener('change', () => {
  const file = formPhoto.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    photoDataUrl = reader.result;
    photoPreview.innerHTML = `<img src="${escHtml(reader.result)}" alt="写真" />`;
  };
  reader.readAsDataURL(file);
});
photoPreview.addEventListener('click', () => formPhoto.click());

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

function openDetail(id) {
  const card = cards.find((c) => c.id === id);
  if (!card) return;
  currentDetailId = id;

  const tags = (card.tags || [])
    .map((t) => `<span class="tag">${escHtml(t)}</span>`)
    .join('');

  const companyLine = [card.company, card.department].filter(Boolean).join(' / ');

  detailContent.innerHTML = `
    <div class="detail-avatar-wrap">
      ${renderAvatar(card, 'large')}
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

btnDetailDelete.addEventListener('click', () => {
  if (!currentDetailId) return;
  const card = cards.find((c) => c.id === currentDetailId);
  if (!confirm(`「${card?.name}」を削除しますか？`)) return;
  cards = cards.filter((c) => c.id !== currentDetailId);
  saveCards(cards);
  renderList();
  closeDetail();
  showToast('名刺を削除しました');
});

// ===== Toast =====
function showToast(msg) {
  clearTimeout(toastTimer);
  toast.textContent = msg;
  toast.classList.add('show');
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2500);
}

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

// ===== Event Bindings =====
btnAdd.addEventListener('click', openAddModal);
fab.addEventListener('click', openAddModal);
btnModalClose.addEventListener('click', closeAddModal);
btnCancel.addEventListener('click', closeAddModal);
btnDetailClose.addEventListener('click', closeDetail);

// Close on backdrop click
modalOverlay.addEventListener('click', (e) => {
  if (e.target === modalOverlay) closeAddModal();
});
detailOverlay.addEventListener('click', (e) => {
  if (e.target === detailOverlay) closeDetail();
});

// ESC key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!modalOverlay.classList.contains('hidden')) closeAddModal();
    else if (!detailOverlay.classList.contains('hidden')) closeDetail();
    else if (!searchBar.classList.contains('hidden')) {
      searchBar.classList.add('hidden');
      searchQuery = '';
      searchInput.value = '';
      renderList();
    }
  }
});

// Handle ?action=add from manifest shortcut
if (new URLSearchParams(location.search).get('action') === 'add') {
  history.replaceState({}, '', location.pathname);
  openAddModal();
}

// ===== Service Worker =====
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./service-worker.js').catch(() => {});
}

// ===== Init =====
renderList();
