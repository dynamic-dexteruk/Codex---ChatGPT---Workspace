// Home Library App - No external dependencies, IndexedDB storage

(() => {
  const state = {
    books: [],
    filters: { search: '', room: '', status: '' },
    db: null,
  };

  // Placeholder used when no cover is available
  const PLACEHOLDER_COVER = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300" viewBox="0 0 200 300">
      <rect width="100%" height="100%" fill="#1f2937"/>
      <rect x="20" y="20" width="160" height="260" rx="10" ry="10" fill="#0b1220" stroke="#374151"/>
      <path d="M50 70 h100 v8 H50z M50 95 h100 v8 H50z M50 120 h80 v8 H50z" fill="#374151"/>
      <text x="100" y="180" fill="#94a3b8" font-size="16" text-anchor="middle" font-family="sans-serif">No Cover</text>
    </svg>`
  );

  function makeBg(url) {
    if (url) return `url(${url}), url(${PLACEHOLDER_COVER})`;
    return `url(${PLACEHOLDER_COVER})`;
  }

  // ---------- IndexedDB Utilities ----------
  const DB_NAME = 'home-library';
  const DB_VERSION = 1;
  const STORE = 'books';

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (ev) => {
        const db = ev.target.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
          store.createIndex('by_title', 'title', { unique: false });
          store.createIndex('by_author', 'author', { unique: false });
          store.createIndex('by_isbn', 'isbn', { unique: false });
          store.createIndex('by_location', 'location', { unique: false });
          store.createIndex('by_status', 'status', { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function withStore(mode, fn) {
    const tx = state.db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    const result = await fn(store);
    await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
    return result;
  }

  const dbAPI = {
    add: (book) => withStore('readwrite', (s) => s.add(book)),
    put: (book) => withStore('readwrite', (s) => s.put(book)),
    delete: (id) => withStore('readwrite', (s) => s.delete(id)),
    getAll: () => withStore('readonly', (s) => s.getAll()),
    clear: () => withStore('readwrite', (s) => s.clear()),
  };

  // ---------- DOM Helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function setBadge(text, cls = '') {
    const span = document.createElement('span');
    span.className = `badge ${cls}`;
    span.textContent = text;
    return span;
  }

  // ---------- Rendering ----------
  function renderRoomsFilter() {
    const rooms = Array.from(new Set(state.books.map(b => (b.location || '').trim()).filter(Boolean))).sort();
    const roomFilter = $('#roomFilter');
    const cur = roomFilter.value;
    roomFilter.innerHTML = '<option value="">All Rooms</option>' + rooms.map(r => `<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`).join('');
    if ([...roomFilter.options].some(o => o.value === cur)) roomFilter.value = cur;
  }

  function escapeHtml(s) {
    return (s ?? '').toString()
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function matchesFilters(book) {
    const { search, room, status } = state.filters;
    if (room && (book.location || '') !== room) return false;
    if (status && (book.status || 'available') !== status) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    const fields = [book.title, book.author, book.isbn, (book.tags || []).join(', ')].map(x => (x || '').toLowerCase());
    return fields.some(f => f.includes(q));
  }

  function renderList() {
    const list = $('#bookList');
    const empty = $('#emptyState');
    list.innerHTML = '';
    const filtered = state.books.filter(matchesFilters);
    empty.hidden = filtered.length > 0;
    const tpl = $('#bookItemTemplate');
    filtered.sort(compareByTitle);
    for (const b of filtered) {
      const li = tpl.content.firstElementChild.cloneNode(true);
      const cover = $('.cover', li);
      const meta = $('.meta', li);
      const title = $('.title', li);
      const sub = $('.sub', li);
      const badges = $('.badges', li);
      const actions = $('.row-actions', li);

      cover.style.backgroundImage = makeBg(b.coverUrl);
      title.textContent = b.title || '(Untitled)';
      const subBits = [];
      if (b.author) subBits.push(b.author);
      if (b.isbn) subBits.push(`ISBN ${b.isbn}`);
      sub.textContent = subBits.join(' • ');

      const status = b.status || 'available';
      badges.appendChild(setBadge(status === 'lent' ? `Lent to ${b.lentTo || 'Unknown'}` : 'Available', `status-${status}`));
      if (b.location) badges.appendChild(setBadge(b.location, 'room'));
      if (b.tags && b.tags.length) {
        for (const t of b.tags.slice(0, 3)) badges.appendChild(setBadge(`#${t}`));
        if (b.tags.length > 3) badges.appendChild(setBadge(`+${b.tags.length - 3} more`));
      }

      actions.dataset.id = b.id;
      $('button[data-action="lend"]', actions).disabled = status === 'lent';
      $('button[data-action="return"]', actions).disabled = status !== 'lent';

      list.appendChild(li);
    }
  }

  async function refresh() {
    state.books = await dbAPI.getAll();
    renderRoomsFilter();
    renderList();
  }

  // ---------- Event Handling ----------
  function wireTopbar() {
    $('#addBtn').addEventListener('click', () => openBookModal());
    $('#lookupOpenBtn').addEventListener('click', () => openLookupModal());
    $('#exportBtn').addEventListener('click', exportData);
    $('#importInput').addEventListener('change', importData);
    $('#searchInput').addEventListener('input', (e) => { state.filters.search = e.target.value.trim(); renderList(); });
    $('#roomFilter').addEventListener('change', (e) => { state.filters.room = e.target.value; renderList(); });
    $('#statusFilter').addEventListener('change', (e) => { state.filters.status = e.target.value; renderList(); });
  }

  function wireListActions() {
    $('#bookList').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      const id = Number(btn.parentElement.dataset.id);
      const book = state.books.find(b => b.id === id);
      if (!book) return;
      const action = btn.dataset.action;
      if (action === 'edit') openBookModal(book);
      else if (action === 'delete') deleteBook(book);
      else if (action === 'lend') openLendModal(book);
      else if (action === 'return') returnBook(book);
    });
  }

  // ---------- Book Modal ----------
  function openBookModal(book = null) {
    const dlg = $('#bookModal');
    const form = $('#bookForm');
    $('#bookModalTitle').textContent = book ? 'Edit Book' : 'Add Book';
    form.reset();
    form.id.value = book?.id ?? '';
    form.title.value = book?.title ?? '';
    form.author.value = book?.author ?? '';
    form.isbn.value = book?.isbn ?? '';
    form.location.value = book?.location ?? '';
    form.tags.value = (book?.tags || []).join(', ');
    form.notes.value = book?.notes ?? '';
    form.coverUrlPrefill.value = book?.coverUrl ?? '';
    // Set preview image
    const preview = $('#coverPreview');
    if (preview) preview.style.backgroundImage = makeBg(form.coverUrlPrefill.value || book?.coverUrl);
    dlg.showModal();
  }

  function fileToDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  function parseTags(s) {
    return (s || '')
      .split(',')
      .map(t => t.trim())
      .filter(Boolean);
  }

  function wireBookModal() {
    $('#cancelBookBtn').addEventListener('click', () => $('#bookModal').close());
    $('#saveBookBtn').addEventListener('click', async (e) => {
      e.preventDefault();
      const form = $('#bookForm');
      const id = form.id.value ? Number(form.id.value) : null;
      const coverInput = form.querySelector('input[name="cover"]');
      const coverFile = coverInput && coverInput.files ? coverInput.files[0] : null;
      let coverUrl = null;
      if (coverFile) {
        try { coverUrl = await fileToDataURL(coverFile); } catch {}
      } else if (id) {
        const existing = state.books.find(b => b.id === id);
        coverUrl = existing?.coverUrl || null;
      } else {
        // New book with prefilled cover from lookup
        coverUrl = form.coverUrlPrefill.value || null;
      }
      const now = new Date().toISOString();
      const book = {
        id: id ?? undefined,
        title: form.title.value.trim(),
        author: form.author.value.trim(),
        isbn: form.isbn.value.trim(),
        location: form.location.value.trim(),
        tags: parseTags(form.tags.value),
        notes: form.notes.value.trim(),
        coverUrl,
      };
      if (!book.title) { form.title.focus(); return; }
      if (id) {
        const existing = state.books.find(b => b.id === id) || {};
        const updated = { ...existing, ...book, updatedAt: now };
        await dbAPI.put(updated);
      } else {
        const toAdd = { ...book, status: 'available', createdAt: now, updatedAt: now };
        await dbAPI.add(toAdd);
      }
      $('#bookModal').close();
      await refresh();
    });

    // Live preview when selecting a file
    const form = $('#bookForm');
    const fileInput = form.querySelector('input[name="cover"]');
    const preview = $('#coverPreview');
    if (fileInput && preview) {
      fileInput.addEventListener('change', async () => {
        const f = fileInput.files?.[0];
        if (f) {
          try {
            const url = await fileToDataURL(f);
            preview.style.backgroundImage = makeBg(url);
          } catch {
            preview.style.backgroundImage = makeBg(null);
          }
        } else {
          const fallback = form.coverUrlPrefill.value || null;
          preview.style.backgroundImage = makeBg(fallback);
        }
      });
    }
  }

  // ---------- Lend Modal ----------
  function openLendModal(book) {
    const dlg = $('#lendModal');
    const form = $('#lendForm');
    form.reset();
    form.id.value = book.id;
    const today = new Date();
    form.lendDate.value = today.toISOString().slice(0,10);
    dlg.showModal();
  }

  function wireLendModal() {
    $('#cancelLendBtn').addEventListener('click', () => $('#lendModal').close());
    $('#confirmLendBtn').addEventListener('click', async (e) => {
      e.preventDefault();
      const form = $('#lendForm');
      const id = Number(form.id.value);
      const book = state.books.find(b => b.id === id);
      if (!book) return;
      const lentTo = form.lentTo.value.trim();
      if (!lentTo) { form.lentTo.focus(); return; }
      const lendDate = form.lendDate.value ? new Date(form.lendDate.value).toISOString() : null;
      const dueDate = form.dueDate.value ? new Date(form.dueDate.value).toISOString() : null;
      const updated = { ...book, status: 'lent', lentTo, lendDate, dueDate, updatedAt: new Date().toISOString() };
      await dbAPI.put(updated);
      $('#lendModal').close();
      await refresh();
    });
  }

  async function returnBook(book) {
    const updated = { ...book, status: 'available', lentTo: null, lendDate: null, dueDate: null, updatedAt: new Date().toISOString() };
    await dbAPI.put(updated);
    await refresh();
  }

  async function deleteBook(book) {
    const ok = confirm(`Delete "${book.title}"? This can’t be undone.`);
    if (!ok) return;
    await dbAPI.delete(book.id);
    await refresh();
  }

  // ---------- Import / Export ----------
  function exportData() {
    const data = JSON.stringify(state.books, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const date = new Date().toISOString().slice(0,10);
    a.href = url;
    a.download = `home-library-${date}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  }

  async function importData(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const arr = JSON.parse(text);
      if (!Array.isArray(arr)) throw new Error('Invalid format');
      // Merge strategy: if object has id that matches, overwrite; otherwise add new.
      // To avoid id collisions, ignore provided id for new entries.
      const byId = new Map((await dbAPI.getAll()).map(b => [b.id, b]));
      for (const raw of arr) {
        const { id, ...rest } = raw || {};
        if (id && byId.has(id)) {
          await dbAPI.put({ ...byId.get(id), ...rest, id, updatedAt: new Date().toISOString() });
        } else {
          await dbAPI.add({ ...rest, status: rest.status || 'available', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
        }
      }
      await refresh();
      alert('Import complete');
    } catch (err) {
      console.error(err);
      alert('Failed to import: ' + err.message);
    } finally {
      e.target.value = '';
    }
  }

  // ---------- ISBN/EAN Lookup (manual) ----------
  function wireLookupModal() {
    $('#closeScanBtn').addEventListener('click', closeLookupModal);
    $('#lookupBtn').addEventListener('click', async (e) => {
      e.preventDefault();
      const raw = $('#isbnManual').value;
      const isbn = sanitizeISBN(raw);
      if (!isbn) { $('#isbnManual').focus(); return; }
      await handleISBNLookup(isbn);
    });
  }

  function openLookupModal() {
    $('#scanStatus').textContent = 'Enter ISBN-10 or ISBN-13/EAN-13 for books.';
    $('#isbnManual').value = '';
    $('#scanModal').showModal();
  }

  function closeLookupModal() {
    $('#scanModal').close();
  }

  function sanitizeISBN(raw) {
    const s = (raw || '').replace(/[^0-9Xx]/g, '').toUpperCase();
    if (!s) return '';
    if (s.length === 10 || s.length === 13) return s;
    return '';
  }

  async function handleISBNLookup(isbn) {
    try {
      const meta = await lookupByISBN(isbn);
      if (!meta) { $('#scanStatus').textContent = 'Not found. Try manual entry.'; return; }
      closeLookupModal();
      openBookModal({
        title: meta.title || '',
        author: (meta.authors || []).join(', '),
        isbn: meta.isbn || isbn,
        coverUrl: meta.coverUrl || null,
        tags: [],
        notes: meta.notes || ''
      });
    } catch (err) {
      console.error(err);
      $('#scanStatus').textContent = 'Lookup failed. Check connection or try again.';
    }
  }

  async function lookupByISBN(isbn) {
    const key = `ISBN:${isbn}`;
    try {
      const url = `https://openlibrary.org/api/books?bibkeys=${encodeURIComponent(key)}&jscmd=data&format=json`;
      const res = await fetch(url, { mode: 'cors' });
      if (!res.ok) throw new Error('Lookup error');
      const data = await res.json();
      const rec = data[key];
      if (!rec) return null;
      const title = rec.title || '';
      const authors = (rec.authors || []).map(a => a.name).filter(Boolean);
      // Prefer explicit cover, else fall back to generic cover URL by ISBN (may 404; UI layers placeholder under it)
      const coverUrl = rec.cover?.medium || rec.cover?.large || rec.cover?.small || `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg`;
      return { title, authors, coverUrl, isbn };
    } catch (e) {
      try {
        const res2 = await fetch(`https://openlibrary.org/isbn/${isbn}.json`, { mode: 'cors' });
        if (!res2.ok) return null;
        const b = await res2.json();
        const title = b.title || '';
        // Use generic cover URL; UI provides placeholder fallback if it 404s
        return { title, authors: [], coverUrl: `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg`, isbn };
      } catch {
        return null;
      }
    }
  }

  // ---------- Init ----------
  async function init() {
    try {
      state.db = await openDB();
    } catch (err) {
      alert('IndexedDB not available. Your browser may not support it.');
      throw err;
    }
    wireTopbar();
    wireListActions();
    wireBookModal();
    wireLendModal();
    wireLookupModal();
    await refresh();
  }

  document.addEventListener('DOMContentLoaded', init);
})();

// ---------- Helpers: Sorting ----------
function normalizeTitle(t) {
  const s = (t || '').trim();
  const low = s.toLowerCase();
  if (low.startsWith('the ')) return s.slice(4);
  if (low.startsWith('a ')) return s.slice(2);
  if (low.startsWith('an ')) return s.slice(3);
  return s;
}

function compareByTitle(a, b) {
  const ta = normalizeTitle(a.title);
  const tb = normalizeTitle(b.title);
  if (!ta && !tb) return 0;
  if (!ta) return 1;
  if (!tb) return -1;
  return ta.localeCompare(tb, undefined, { sensitivity: 'base' });
}
