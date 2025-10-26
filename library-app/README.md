Home Library App (No-Backend)

What it is
- A self-contained browser app to organize your books.
- Uses IndexedDB in your browser for storage (works offline).
- Features: add/edit/delete books, track loans, search/filter, JSON import/export.

Quick start
- Open `library-app/index.html` in a modern browser (Chrome, Edge, Firefox).
- No install or server required.
- Your data stays in your browser. Use Export to back up or move to another device.

Core concepts
- Book fields: title, author, ISBN, location (room), tags, notes, cover image, status (available/lent), loan info (lentTo, lendDate, dueDate).
- Rooms are free text (e.g., "Living Room Shelf A"). The Room filter lists every location you’ve used.

Workflows
- Add a book: Click Add Book, fill fields, optionally add a cover image, Save.
- Edit a book: Click Edit on a row, modify fields, Save.
- Lend a book: Click Lend, enter who you lent to and optional dates.
- Return a book: Click Return on a lent book.
- Delete a book: Click Delete and confirm.
- Search: Type in the search bar to match title/author/ISBN/tags.
- Filter: Use Room and Status dropdowns to narrow the list.
- Export: Click Export to download a JSON backup of all books.
- Import: Click Import and select a previously exported JSON file.

Data model (JSON shape)
- Stored per-book schema (keys are optional unless noted):
  - id: number (auto)
  - title: string (required)
  - author: string
  - isbn: string
  - location: string
  - tags: string[]
  - notes: string
  - status: 'available' | 'lent'
  - lentTo: string | null
  - lendDate: ISO string | null
  - dueDate: ISO string | null
  - coverUrl: data URL string | null
  - createdAt, updatedAt: ISO strings

Extending later
- Add a backend: Replace the IndexedDB calls in `library-app/app.js` (dbAPI usage) with API calls, keeping the UI intact.
- Add QR scanning or barcode lookup: Integrate a JS library and augment the Add/Edit flow.
- Add CSV import/export: Convert between CSV and the JSON structure.
- Add shelves per room: Add new fields, indexes, and filters; UI will adapt similarly to how rooms are handled.

Notes
- IndexedDB is available for `file://` in major browsers; if your browser blocks it, serve the folder with a simple local server (e.g., `python -m http.server` from the parent directory) and open `http://localhost:8000/library-app/`.
- Cover images are stored as data URLs inside the browser; large images increase storage size. Prefer smaller images.

