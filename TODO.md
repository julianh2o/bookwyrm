# BookWyrm - Implementation Plan

Book list webapp that interfaces with 4 Readarr instances to request and track books across formats.

## Architecture Decisions

### Core Concepts

**Book** - A single title (identified by ISBN, title/author, or external ID like GoodReads)
**BookRequest** - A request to a specific Readarr instance for a specific format
**ReadarrInstance** - One of 4 configured instances: `fiction-audio`, `nonfiction-audio`, `fiction-ebook`, `nonfiction-ebook`

### Routing Logic

Each book added triggers a routing function that determines which Readarr instance(s) to use:
- User selects category (fiction/nonfiction) when adding
- System creates requests for BOTH audio and ebook by default (configurable)
- Result: Each book maps to 2 BookRequests (one audio, one ebook)

### Status Tracking

BookRequest status progression:
```
pending → searching → found → downloading → available
                   ↘ not_found
```

### Database Schema Strategy

- `books` - Core book data (title, author, isbn, category, user notes)
- `readarr_instances` - Instance configs (name, url, api_key, type)
- `book_requests` - Join table with status (book_id, instance_id, status, external_id)

### API Design

REST endpoints following existing Express patterns:
- `GET/POST /api/books` - List/create books
- `GET/PATCH/DELETE /api/books/:id` - Individual book operations
- `POST /api/books/:id/request` - Trigger Readarr requests
- `GET /api/books/:id/requests` - Get request statuses
- `GET/POST /api/settings/readarr` - Manage Readarr configs

---

## Phase 1: Data Layer & Core API

Foundation: database schema, models, and basic CRUD operations.

### 1.0 Book Metadata Service

Modular service for fetching book metadata from external sources. Initial implementation uses rreading-glasses, but architecture supports swapping providers.

**Architecture:**
- `BookMetadataProvider` interface - contract for any metadata source
- `RReadingGlassesProvider` - implementation using rreading-glasses.julianverse.net
- Future providers: Open Library, Google Books, Hardcover, etc.

**rreading-glasses API** (https://rreading-glasses.julianverse.net):
- `GET /search?q={query}` - Search books by title/author
- `GET /book/isbn/{isbn}` - Lookup by ISBN
- `GET /book/{editionId}` - Get edition details
- `GET /work/{workId}` - Get work metadata (title, authors, genres, ratings)
- `GET /author/{authorId}` - Get author details

- [x] Define `BookMetadataProvider` interface with methods:
  - `search(query: string)` - Search for books
  - `getByIsbn(isbn: string)` - Lookup by ISBN
  - `getById(id: string)` - Get full details by provider-specific ID
- [x] Define shared types: `BookMetadata`, `AuthorMetadata`, `SearchResult`
- [x] Implement `RReadingGlassesProvider` class
- [x] Write unit tests against live rreading-glasses instance
- [x] Add provider configuration to environment variables

### 1.1 Database Schema & Configuration

- [x] Create JSON configuration for Readarr instances (`config/readarr.json`)
  - Instances: fiction-audio, fiction-ebook, nonfiction-audio, nonfiction-ebook
  - Fields: id, name, url, apiKey, type (audio/ebook), category (fiction/nonfiction), enabled
- [x] Design and implement `books` table in Prisma schema
  - id, title, author, isbn (optional), category (fiction/nonfiction)
  - dateAdded, notes, coverUrl (optional), metadataId (provider ID)
- [x] Design and implement `book_requests` table
  - id, bookId, instanceId (references config), status, externalId (Readarr's ID)
  - createdAt, updatedAt, lastChecked, errorMessage
- [x] Run migrations and verify schema

### 1.2 Server-Side Models & Validation

- [x] Create Zod schemas for input validation (book creation, instance config)
- [x] Create TypeScript types shared between client/server (`src/types/`)
- [x] Write unit tests for validation schemas

### 1.3 Books CRUD API

- [x] `GET /api/books` - List all books with their request statuses
- [x] `POST /api/books` - Create book (triggers routing logic)
- [x] `GET /api/books/:id` - Get single book with all requests
- [x] `PATCH /api/books/:id` - Update book metadata
- [x] `DELETE /api/books/:id` - Remove book and associated requests
- [x] Write integration tests for each endpoint using supertest

### 1.4 Readarr Instance Configuration API

- [x] `GET /api/settings/readarr` - List configured instances (from JSON config)
- [x] `POST /api/settings/readarr/:id/test` - Test connection to instance
- [x] Create config loader with validation and caching
- [x] Write integration tests

---

## Phase 2: Readarr Integration

Service layer for communicating with Readarr APIs.

**Simplified approach:** Add book to Readarr, trigger search, check if file exists (no download queue monitoring).

### 2.1 Readarr API Client

- [x] Research Readarr API endpoints needed:
  - `GET /api/v1/book/lookup` - Search for book by term
  - `GET /api/v1/author/lookup` - Search for author by name
  - `POST /api/v1/author` - Add author to library
  - `PUT /api/v1/book/{id}` - Update book (set monitored=true)
  - `POST /api/v1/command` - Trigger book search
  - `GET /api/v1/book/{id}` - Get book status (check if file exists via statistics.bookFileCount)
- [x] Create `ReadarrClient` class with typed methods
- [x] Write unit tests with mocked HTTP responses (15 tests)

### 2.2 Request Processing Service

- [x] Implement `RequestProcessor` service
  - Search for book in Readarr by title/author
  - Add author/book to Readarr library
  - Set book monitored and trigger search command
  - Update request status in database
- [x] Handle errors gracefully (instance offline, book not found, etc.)
- [x] Write integration tests with mocked Readarr responses (11 tests)

### 2.3 Status Sync Service

- [x] Implement status check that queries Readarr for book file status
- [x] Update `book_requests` based on whether files exist
- [x] Add endpoints to manually refresh status:
  - `POST /api/books/:id/request` - Process pending requests
  - `POST /api/books/:id/sync` - Sync status with Readarr
  - `POST /api/books/requests/:requestId/retry` - Retry failed requests
- [x] Write tests for status transitions (10 tests)

---

## Phase 3: Frontend - Book Management

Single-table UI with inline editing. No separate detail pages or modals.

### 3.1 API Client Layer

- [x] Create typed API client functions in `src/api/`
  - `getBooks()`, `createBook()`, `updateBook()`, `deleteBook()`
  - `getInstances()`, `testConnection()`
  - `processRequests()`, `syncStatus()`, `retryRequest()`
- [x] Implement error handling with typed responses (ApiError class)
- [ ] Write tests for API client (deferred)

### 3.2 Book Table Component

Single table with all functionality:
- [x] Table columns: Title, Author, Category, Instances (checkboxes), Status, Actions
- [x] Inline editing for title/author (click to edit with EditableCell)
- [x] Category toggle (fiction/nonfiction chip)
- [x] Instance checkboxes with status indicators:
  - Checkbox per instance (FA, FE, NFA, NFE labels)
  - Shows status icon next to checkbox (pending/searching/available/error)
- [x] Action buttons: Request, Sync, Delete
- [ ] Row expansion for notes field (optional, deferred)
- [ ] Write component tests (deferred)

### 3.3 Add Book Row

Inline "add row" at top of table:
- [x] Book search autocomplete with rreading-glasses integration
  - Debounced search as you type
  - Shows book cover thumbnails and authors
  - Auto-fills title and author from selection
  - Manual entry option if book not found
- [x] Category selector (fiction/nonfiction toggle buttons)
- [x] Instance checkboxes (auto-select based on category)
- [x] Add button to submit
- [ ] Write component tests (deferred)

### 3.4 Filtering & Sorting

- [ ] Filter bar above table (deferred)
- [ ] Column header sorting (deferred)
- [ ] Persist filter/sort state in URL params (deferred)

### 3.5 Main Page Integration

- [x] Single page at `/` with full table
- [x] Loading states (spinner while loading)
- [x] Empty state message
- [x] Error handling with Alert component
- [x] Snackbar notifications for actions
- [ ] Auto-refresh option for status updates (deferred)

---

## Phase 4: Settings (Simplified)

Settings integrated into header/toolbar rather than separate page.

### 4.1 Instance Status Display

- [ ] Header shows connection status for all instances
- [ ] Click to test connection
- [ ] Tooltip shows instance details

### 4.2 Preferences (if needed)

- [ ] Auto-request on add toggle
- [ ] Auto-sync interval setting
- [ ] Persist to localStorage

---

## Phase 5: Background Processing & Polish

### 5.1 Background Status Updates

- [ ] Implement server-side cron/interval for status polling
- [ ] Or: Client-side polling with configurable interval
- [ ] Notification when book becomes available (optional)

### 5.2 Error Handling & Resilience

- [ ] Retry logic for failed Readarr requests
- [ ] Graceful handling of offline instances
- [ ] User-friendly error messages
- [ ] Request timeout handling

### 5.3 UI Polish

- [ ] Loading skeletons for async data
- [ ] Toast notifications for actions
- [ ] Empty states
- [ ] Mobile-responsive layout
- [ ] Keyboard navigation

### 5.4 Dashboard/Home Page

- [ ] Overview stats (total books, pending, available)
- [ ] Recent activity
- [ ] Quick add functionality

---

## Phase 6: Extended Features (Future)

- [ ] Book search via external APIs (Open Library, Google Books)
- [ ] Import from Goodreads/other services
- [ ] Reading list organization (shelves, tags)
- [ ] Download progress tracking
- [ ] Notifications (email, push) when books are ready
- [ ] Multi-user support with authentication
- [ ] Bulk operations (import CSV, mass request)

---

## Testing Strategy

### Unit Tests
- Validation schemas
- Routing logic
- API client methods
- React hooks

### Integration Tests
- API endpoints (supertest)
- Database operations
- Readarr client (with mocked HTTP)

### Component Tests
- Individual React components
- User interactions
- Form submissions

### E2E Tests (Optional)
- Full workflows with Playwright/Cypress
- Add book → Request → Track status

---

## Development Order

Recommended sequence for incremental progress:

1. **Phase 1.0** - Book metadata service (rreading-glasses integration)
2. **Phase 1.1-1.3** - Get books CRUD working end-to-end
3. **Phase 3.1-3.4** - Basic UI to add and list books (with book search)
4. **Phase 1.4** - Readarr instance configuration
5. **Phase 4.2** - UI for managing instances
6. **Phase 2.1-2.3** - Actual Readarr integration
7. **Phase 3.5** - Book detail view with statuses
8. **Phase 2.4 + 5.1** - Background status sync
9. **Phase 5.2-5.4** - Polish and error handling
