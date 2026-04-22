/* ============================================
   NoteVault PWA – App Logic
   Storage: IndexedDB (primary) + LocalStorage (fallback)
   ============================================ */

'use strict';

// ─── IndexedDB Setup ───────────────────────────────────────────
const DB_NAME = 'notevault-db';
const DB_VERSION = 1;
const STORE = 'notes';
let db = null;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains(STORE)) {
        const store = d.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
        store.createIndex('pinned', 'pinned', { unique: false });
      }
    };
    req.onsuccess = (e) => { db = e.target.result; resolve(db); };
    req.onerror = () => reject(req.error);
  });
}

const IDB = {
  getAll() {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },
  put(note) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const req = tx.objectStore(STORE).put(note);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },
  delete(id) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const req = tx.objectStore(STORE).delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  },
  clear() {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const req = tx.objectStore(STORE).clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }
};

// ─── LocalStorage Fallback ─────────────────────────────────────
const LSFallback = {
  getAll() {
    try { return JSON.parse(localStorage.getItem('notevault-notes') || '[]'); }
    catch { return []; }
  },
  put(note) {
    const notes = this.getAll();
    const idx = notes.findIndex(n => n.id === note.id);
    if (idx >= 0) notes[idx] = note; else notes.unshift(note);
    localStorage.setItem('notevault-notes', JSON.stringify(notes));
  },
  delete(id) {
    const notes = this.getAll().filter(n => n.id !== id);
    localStorage.setItem('notevault-notes', JSON.stringify(notes));
  },
  clear() { localStorage.removeItem('notevault-notes'); }
};

// ─── State ─────────────────────────────────────────────────────
const state = {
  notes: [],
  filter: 'all',
  activeTag: null,
  searchQuery: '',
  sortOrder: 'newest',
  isGridView: true,
  editingId: null,
  deleteId: null,
  useIDB: true
};

// ─── Storage Wrapper ───────────────────────────────────────────
const Storage = {
  async getAll()  { return state.useIDB ? IDB.getAll() : LSFallback.getAll(); },
  async put(n)    { return state.useIDB ? IDB.put(n)   : LSFallback.put(n); },
  async delete(id){ return state.useIDB ? IDB.delete(id) : LSFallback.delete(id); },
  async clear()   { return state.useIDB ? IDB.clear()  : LSFallback.clear(); }
};

// ─── DOM References ────────────────────────────────────────────
const $ = id => document.getElementById(id);
const els = {
  offlineBanner: $('offline-banner'),
  installPrompt: $('install-prompt'),
  installBtn: $('install-btn'),
  dismissBtn: $('dismiss-btn'),
  sidebar: $('sidebar'),
  sidebarClose: $('sidebar-close'),
  overlay: $('overlay'),
  menuBtn: $('menu-btn'),
  searchInput: $('search-input'),
  searchClear: $('search-clear'),
  viewToggle: $('view-toggle'),
  sortBtn: $('sort-btn'),
  notesGrid: $('notes-grid'),
  emptyState: $('empty-state'),
  sectionTitle: $('section-title'),
  noteCountBadge: $('note-count-badge'),
  totalCount: $('total-count'),
  pinnedCount: $('pinned-count'),
  tagCount: $('tag-count'),
  tagsList: $('tags-list'),
  fabBtn: $('fab-btn'),
  modalOverlay: $('modal-overlay'),
  noteTitle: $('note-title'),
  noteBody: $('note-body'),
  noteCategory: $('note-category'),
  noteTags: $('note-tags'),
  noteColor: $('note-color'),
  modalPin: $('modal-pin'),
  modalClose: $('modal-close'),
  btnCancel: $('btn-cancel'),
  btnSave: $('btn-save'),
  charCount: $('char-count'),
  deleteOverlay: $('delete-overlay'),
  deleteConfirm: $('delete-confirm'),
  deleteCancel: $('delete-cancel'),
  navItems: document.querySelectorAll('.nav-item'),
  toast: $('toast'),
  exportBtn: $('export-btn'),
  clearBtn: $('clear-btn')
};

// ─── Helpers ───────────────────────────────────────────────────
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function formatDate(ts) {
  const d = new Date(ts);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff/60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff/3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff/86400000)}d ago`;
  return d.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
}

let toastTimer;
function showToast(msg, type='') {
  clearTimeout(toastTimer);
  els.toast.textContent = msg;
  els.toast.className = `toast ${type}`;
  toastTimer = setTimeout(() => { els.toast.className = 'toast hidden'; }, 2500);
}

// ─── Filtering & Sorting ───────────────────────────────────────
function getFilteredNotes() {
  let notes = [...state.notes];

  // Filter
  if (state.filter === 'pinned') notes = notes.filter(n => n.pinned);
  if (state.filter === 'recent') {
    const cutoff = Date.now() - 7 * 86400000;
    notes = notes.filter(n => n.updatedAt >= cutoff);
  }

  // Tag filter
  if (state.activeTag) {
    notes = notes.filter(n => n.tags && n.tags.includes(state.activeTag));
  }

  // Search
  if (state.searchQuery.trim()) {
    const q = state.searchQuery.toLowerCase();
    notes = notes.filter(n =>
      (n.title && n.title.toLowerCase().includes(q)) ||
      (n.body  && n.body.toLowerCase().includes(q)) ||
      (n.tags  && n.tags.some(t => t.toLowerCase().includes(q)))
    );
  }

  // Sort
  if (state.sortOrder === 'newest') notes.sort((a,b) => b.updatedAt - a.updatedAt);
  else if (state.sortOrder === 'oldest') notes.sort((a,b) => a.updatedAt - b.updatedAt);
  else if (state.sortOrder === 'az') notes.sort((a,b) => (a.title||'').localeCompare(b.title||''));

  // Pinned first
  notes.sort((a,b) => (b.pinned?1:0) - (a.pinned?1:0));

  return notes;
}

// ─── Render ────────────────────────────────────────────────────
function render() {
  const notes = getFilteredNotes();
  els.notesGrid.innerHTML = '';

  if (notes.length === 0) {
    els.emptyState.classList.remove('hidden');
  } else {
    els.emptyState.classList.add('hidden');
    notes.forEach((note, i) => {
      const card = createCard(note);
      card.style.animationDelay = `${Math.min(i * 40, 300)}ms`;
      els.notesGrid.appendChild(card);
    });
  }

  const count = notes.length;
  els.noteCountBadge.textContent = `${count} note${count !== 1 ? 's' : ''}`;
  updateSidebar();
}

function createCard(note) {
  const div = document.createElement('div');
  div.className = `note-card${note.color && note.color !== 'default' ? ' note-'+note.color : ''}`;
  div.dataset.id = note.id;

  const tags = (note.tags || []).map(t => `<span class="note-tag">#${t}</span>`).join('');
  const category = note.category ? `<span class="note-card-category">${getCategoryEmoji(note.category)} ${note.category}</span>` : '';

  div.innerHTML = `
    <div class="note-card-header">
      <span class="note-card-title">${escapeHtml(note.title || 'Untitled')}</span>
      ${note.pinned ? '<span class="note-card-pin">📌</span>' : ''}
    </div>
    ${note.body ? `<p class="note-card-body">${escapeHtml(note.body)}</p>` : ''}
    ${tags ? `<div class="note-card-tags">${tags}</div>` : ''}
    <div class="note-card-footer">
      <span class="note-card-date">${formatDate(note.updatedAt)}</span>
      <div style="display:flex;align-items:center;gap:6px;">
        ${category}
        <div class="note-card-actions">
          <button class="action-pin" title="${note.pinned?'Unpin':'Pin'}">📌</button>
          <button class="action-edit" title="Edit">✏️</button>
          <button class="action-delete" title="Delete">🗑</button>
        </div>
      </div>
    </div>
  `;

  div.querySelector('.action-pin').addEventListener('click', e => { e.stopPropagation(); togglePin(note.id); });
  div.querySelector('.action-edit').addEventListener('click', e => { e.stopPropagation(); openEdit(note.id); });
  div.querySelector('.action-delete').addEventListener('click', e => { e.stopPropagation(); confirmDelete(note.id); });
  div.addEventListener('click', () => openEdit(note.id));
  return div;
}

function getCategoryEmoji(cat) {
  const map = { work:'💼', personal:'🏠', ideas:'💡', shopping:'🛒', health:'❤️' };
  return map[cat] || '📂';
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function updateSidebar() {
  const all = state.notes;
  els.totalCount.textContent = all.length;
  els.pinnedCount.textContent = all.filter(n => n.pinned).length;

  const allTags = [...new Set(all.flatMap(n => n.tags || []))].filter(Boolean);
  els.tagCount.textContent = allTags.length;

  els.tagsList.innerHTML = allTags.map(tag =>
    `<button class="tag-chip${state.activeTag===tag?' active':''}" data-tag="${escapeHtml(tag)}">#${escapeHtml(tag)}</button>`
  ).join('');

  els.tagsList.querySelectorAll('.tag-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      state.activeTag = state.activeTag === chip.dataset.tag ? null : chip.dataset.tag;
      render();
    });
  });
}

// ─── Modal ─────────────────────────────────────────────────────
function openNew() {
  state.editingId = null;
  els.noteTitle.value = '';
  els.noteBody.value = '';
  els.noteCategory.value = '';
  els.noteTags.value = '';
  els.noteColor.value = 'default';
  els.modalPin.classList.remove('pinned');
  els.modalPin.dataset.pinned = '';
  updateCharCount();
  els.modalOverlay.classList.add('open');
  setTimeout(() => els.noteTitle.focus(), 100);
}

function openEdit(id) {
  const note = state.notes.find(n => n.id === id);
  if (!note) return;
  state.editingId = id;
  els.noteTitle.value = note.title || '';
  els.noteBody.value = note.body || '';
  els.noteCategory.value = note.category || '';
  els.noteTags.value = (note.tags || []).join(', ');
  els.noteColor.value = note.color || 'default';
  els.modalPin.dataset.pinned = note.pinned ? '1' : '';
  els.modalPin.classList.toggle('pinned', !!note.pinned);
  updateCharCount();
  els.modalOverlay.classList.add('open');
  setTimeout(() => els.noteBody.focus(), 100);
}

function closeModal() {
  els.modalOverlay.classList.remove('open');
  state.editingId = null;
}

function updateCharCount() {
  const len = els.noteBody.value.length;
  els.charCount.textContent = `${len} character${len !== 1 ? 's' : ''}`;
}

async function saveNote() {
  const title = els.noteTitle.value.trim();
  const body  = els.noteBody.value.trim();

  if (!title && !body) {
    showToast('Note cannot be empty', 'error');
    return;
  }

  const tags = els.noteTags.value
    .split(',')
    .map(t => t.trim().replace(/^#+/, ''))
    .filter(Boolean);

  const now = Date.now();

  if (state.editingId) {
    const note = state.notes.find(n => n.id === state.editingId);
    if (!note) return;
    Object.assign(note, {
      title, body, tags,
      category: els.noteCategory.value,
      color: els.noteColor.value,
      pinned: els.modalPin.dataset.pinned === '1',
      updatedAt: now
    });
    await Storage.put(note);
    showToast('Note updated ✓', 'success');
  } else {
    const note = {
      id: genId(), title, body, tags,
      category: els.noteCategory.value,
      color: els.noteColor.value,
      pinned: els.modalPin.dataset.pinned === '1',
      createdAt: now, updatedAt: now
    };
    state.notes.unshift(note);
    await Storage.put(note);
    showToast('Note saved ✓', 'success');
  }

  closeModal();
  render();
}

// ─── Pin / Delete ──────────────────────────────────────────────
async function togglePin(id) {
  const note = state.notes.find(n => n.id === id);
  if (!note) return;
  note.pinned = !note.pinned;
  note.updatedAt = Date.now();
  await Storage.put(note);
  showToast(note.pinned ? 'Note pinned 📌' : 'Note unpinned');
  render();
}

function confirmDelete(id) {
  state.deleteId = id;
  els.deleteOverlay.classList.add('open');
}

async function deleteNote() {
  if (!state.deleteId) return;
  state.notes = state.notes.filter(n => n.id !== state.deleteId);
  await Storage.delete(state.deleteId);
  state.deleteId = null;
  els.deleteOverlay.classList.remove('open');
  showToast('Note deleted');
  render();
}

// ─── Export ────────────────────────────────────────────────────
function exportNotes() {
  if (state.notes.length === 0) { showToast('No notes to export', 'error'); return; }
  const data = JSON.stringify(state.notes, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `notevault-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast(`Exported ${state.notes.length} notes ⬇`, 'success');
}

async function clearAll() {
  if (state.notes.length === 0) { showToast('No notes to clear', 'error'); return; }
  if (!confirm(`Delete all ${state.notes.length} notes? This cannot be undone.`)) return;
  state.notes = [];
  await Storage.clear();
  showToast('All notes cleared');
  render();
}

// ─── Sidebar / Navigation ──────────────────────────────────────
function openSidebar() {
  els.sidebar.classList.add('open');
  els.overlay.classList.add('show');
}
function closeSidebar() {
  els.sidebar.classList.remove('open');
  els.overlay.classList.remove('show');
}

// ─── Events ────────────────────────────────────────────────────
els.fabBtn.addEventListener('click', openNew);
els.modalClose.addEventListener('click', closeModal);
els.btnCancel.addEventListener('click', closeModal);
els.btnSave.addEventListener('click', saveNote);
els.menuBtn.addEventListener('click', openSidebar);
els.sidebarClose.addEventListener('click', closeSidebar);
els.overlay.addEventListener('click', closeSidebar);

els.modalPin.addEventListener('click', () => {
  const pinned = els.modalPin.dataset.pinned === '1' ? '' : '1';
  els.modalPin.dataset.pinned = pinned;
  els.modalPin.classList.toggle('pinned', pinned === '1');
});

els.noteBody.addEventListener('input', updateCharCount);

els.searchInput.addEventListener('input', () => {
  state.searchQuery = els.searchInput.value;
  els.searchClear.classList.toggle('hidden', !state.searchQuery);
  render();
});
els.searchClear.addEventListener('click', () => {
  els.searchInput.value = '';
  state.searchQuery = '';
  els.searchClear.classList.add('hidden');
  render();
});

els.viewToggle.addEventListener('click', () => {
  state.isGridView = !state.isGridView;
  els.notesGrid.classList.toggle('list-view', !state.isGridView);
  els.viewToggle.textContent = state.isGridView ? '⊞' : '☰';
});

els.sortBtn.addEventListener('click', () => {
  const orders = ['newest','oldest','az'];
  const icons = { newest:'↓ Newest', oldest:'↑ Oldest', az:'A–Z' };
  state.sortOrder = orders[(orders.indexOf(state.sortOrder)+1) % orders.length];
  showToast(`Sorted by ${icons[state.sortOrder]}`);
  render();
});

els.navItems.forEach(item => {
  item.addEventListener('click', () => {
    els.navItems.forEach(n => n.classList.remove('active'));
    item.classList.add('active');
    state.filter = item.dataset.filter;
    state.activeTag = null;
    const titles = { all:'All Notes', pinned:'Pinned', recent:'Recent' };
    els.sectionTitle.textContent = titles[state.filter];
    render();
    if (window.innerWidth < 768) closeSidebar();
  });
});

els.deleteConfirm.addEventListener('click', deleteNote);
els.deleteCancel.addEventListener('click', () => {
  state.deleteId = null;
  els.deleteOverlay.classList.remove('open');
});

els.exportBtn.addEventListener('click', exportNotes);
els.clearBtn.addEventListener('click', clearAll);

// Keyboard shortcuts
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'n') { e.preventDefault(); openNew(); }
  if (e.key === 'Escape') { closeModal(); els.deleteOverlay.classList.remove('open'); closeSidebar(); }
  if ((e.ctrlKey || e.metaKey) && e.key === 's' && els.modalOverlay.classList.contains('open')) {
    e.preventDefault(); saveNote();
  }
});

// ─── PWA Install Prompt ────────────────────────────────────────
let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredPrompt = e;
  if (!localStorage.getItem('install-dismissed')) {
    els.installPrompt.classList.remove('hidden');
  }
});

els.installBtn.addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  if (outcome === 'accepted') showToast('App installed! 🎉', 'success');
  deferredPrompt = null;
  els.installPrompt.classList.add('hidden');
});

els.dismissBtn.addEventListener('click', () => {
  els.installPrompt.classList.add('hidden');
  localStorage.setItem('install-dismissed', '1');
});

window.addEventListener('appinstalled', () => {
  els.installPrompt.classList.add('hidden');
  showToast('NoteVault installed successfully! 🎉', 'success');
});

// ─── Online / Offline Detection ────────────────────────────────
function updateOnlineStatus() {
  if (!navigator.onLine) {
    els.offlineBanner.classList.remove('hidden');
  } else {
    els.offlineBanner.classList.add('hidden');
  }
}
window.addEventListener('online',  updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);
updateOnlineStatus();

// ─── Service Worker Registration ───────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => {
        console.log('[NoteVault] SW registered:', reg.scope);
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              showToast('App updated! Refresh for latest version.');
            }
          });
        });
      })
      .catch(err => console.error('[NoteVault] SW error:', err));
  });
}

// ─── Init ──────────────────────────────────────────────────────
async function init() {
  try {
    await openDB();
    state.useIDB = true;
    console.log('[NoteVault] IndexedDB ready');
  } catch(e) {
    state.useIDB = false;
    console.warn('[NoteVault] Falling back to LocalStorage:', e);
  }

  state.notes = await Storage.getAll();
  render();
}

init();
