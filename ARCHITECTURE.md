# Architecture

## BookWyrm in one paragraph

BookWyrm keeps one list of every book across the four Readarr instances (fiction/nonfiction × audio/ebook).
Each `Book` has one `BookRequest` per instance, and each request moves through
`add → search → download → import → available`. The UI shows one badge per instance: hover for the phase,
the last error and recent history (`RequestEvent`), click to retry just that phase.

### Background checker (`server/services/tracker/`)
- `LibraryTracker` polls every instance every `POLL_INTERVAL_MS` (default 5 min) and right after any add/retry.
  Per instance it reads `/book`, `/author`, `/queue` and the grab history (`/history?eventType=1`).
- It imports books Readarr has that BookWyrm doesn't (monitored or downloaded only; the unmonitored author
  backlog is skipped), matching across instances by `foreignBookId`, then normalized title + overlapping author.
- Queue items Readarr couldn't match (`bookId: null`) are tied to a book through the grab history's
  `downloadId`. Items with no grab in that instance are counted as `foreignQueueItems` in `/api/sync/status`
  (usually another instance's downloads sharing a download-client category).
- `state.ts#computeState` is the pure mapping from Readarr data to `{status, phase, errorMessage, progress}`.
- `actions.ts`: the add queue (one add at a time per instance, run in the background) and `retryRequest`:
  - add: run the whole add again
  - search: monitor (if needed) and trigger `BookSearch`
  - download: remove the queue item from the client, blocklist it, search again
  - import: `ManualImport` the downloaded files as the grabbed book (ignoring "couldn't find similar book"
    rejections); if nothing is importable, drop the queue row (keeping files) and search again
- Set `DISABLE_POLLER=true` to turn the checker off.

### Mousehole banner (`server/services/mousehole/`, `src/components/MouseholeBanner/`)
Mousehole keeps the MyAnonaMouse cookie and seedbox IP fresh. When its cookie is missing or rejected, MAM torrents
sit "stalled with no connections", so BookWyrm reads `GET {MOUSEHOLE_URL}/state` (cached 1 min, never passes
the cookie on) and shows a red banner above the page when: no cookie, MAM unreachable, MAM rejected the IP
update, or Mousehole itself is unreachable. Unset `MOUSEHOLE_URL` turns it off.
- `GET /api/mousehole/status[?refresh=1]`: `{configured, ok, problem, message, url, lastContactAt, checkedAt}`

### Request statuses
`pending` (queued) · `adding` · `searching` (just searched) · `wanted` (monitored, nothing grabbed yet) ·
`downloading` · `importing` · `available` · `error` (with `phase` saying where it failed).

### API additions
- `POST /api/books`: `category` optional when `metadataId` is given (guessed from genres); `instanceIds`
  defaults to audio + ebook for the category; `autoRequest` (default true) sends it to Readarr in the background.
  Re-adding a tracked book returns it with `existing: true` (200) and only adds missing instances.
- `GET /api/books?status=&search=&category=&sort=recent|activity|title|author`
- `POST /api/books/requests/:id/retry`, `GET /api/books/requests/:id/events`
- `POST /api/sync/library` (check all instances now), `GET /api/sync/status` (health + counts)
- `GET /api/metadata/book/:id` includes `suggestedCategory`

### Tests
Server tests run against `data/test.db` and `server/test-fixtures/readarr.json` (set in `server/test-setup.ts`),
never the real DB or real Readarr. `client.integration.test.ts` only runs with `READARR_INTEGRATION=1`.
Note: `yarn dev:server` runs `prisma migrate dev`; production runs `prisma migrate deploy` on container start.

## Overview

This is a minimal application template built with a React/TypeScript frontend and Express backend. It provides a basic foundation for building web applications with modern tooling.

## System Architecture

### Frontend (React/TypeScript)

**Stack:**
- React 19
- TypeScript
- Material-UI v7
- React Router v7
- Emotion (CSS-in-JS)

**Entry Point:** `src/index.tsx` → `src/App.tsx`

**Directory Structure:**
- `src/components/` - Reusable UI components (Layout, ErrorBoundary)
- `src/pages/` - Route-based page components (Home)
- `src/contexts/` - React context providers (ThemeModeContext, AppContext)
- `src/utils/` - Utility functions and helpers
- `src/config/` - Configuration files (currently empty, ready for your configs)
- `src/types/` - TypeScript type definitions
- `src/styles/` - Theme and styling configuration

**Current Implementation:**
- Single home page with Material-UI components
- Basic routing setup with React Router
- Error boundary for error handling
- Responsive layout with Container/Box components
- Dark theme by default (can be customized in `src/styles/theme.ts`)

### Backend (Express/TypeScript)

**Stack:**
- Express 5
- TypeScript
- Prisma ORM (v7)
- SQLite database

**Entry Point:** `server/index.ts`

**Database:**
- SQLite via Prisma
- Location: `data/db.db` (configured in `.env`)
- Schema: `prisma/schema.prisma` (currently empty, ready for your models)
- Configuration: `prisma.config.ts` (Prisma 7 format)

**API Endpoints:**
- The API router is mounted at `/api` but currently has no routes
- Add your routes in `server/api/index.ts`

### Environment Configuration

**Development:**
- Frontend: `http://localhost:2998`
- Backend: `http://localhost:2999`
- Separate servers with CORS enabled
- Hot reloading for both frontend and backend

**Production:**
- Same-origin serving (backend serves static build from `/build/public`)
- Environment detection in `src/utils/api.ts` uses `window.location.hostname`

**Environment Variables (.env):**
```
PORT=2999                   # Optional, defaults to 2999
DATABASE_URL=...            # SQLite file path (e.g., "file:./data/db.db")
```

**Twilio and JWT Configuration (Optional):**
The template includes Twilio and JWT configuration in the `.env.example` file, but these are not required for the basic template to run. Remove these if you don't need them:
```
TWILIO_ACCOUNT_SID=...      # Optional: For SMS functionality
TWILIO_AUTH_TOKEN=...       # Optional: For SMS functionality
TWILIO_PHONE_NUMBER=...     # Optional: For SMS functionality
JWT_SECRET=...              # Optional: For JWT authentication
APP_BASE_URL=...            # Optional: Base URL for your app
```

## Key Files

### Frontend
- `src/index.tsx` - Application entry point
- `src/App.tsx` - Main app component with routing
- `src/pages/Home.tsx` - Home page
- `src/components/Layout/Layout.tsx` - Page layout wrapper
- `src/components/ErrorBoundary/ErrorBoundary.tsx` - Error boundary
- `src/styles/theme.ts` - Material-UI theme configuration
- `src/utils/constants.ts` - Application constants

### Backend
- `server/index.ts` - Express server setup
- `server/api/index.ts` - API routes (empty, ready for your endpoints)
- `server/config.ts` - Server configuration
- `server/db.ts` - Prisma client initialization
- `prisma/schema.prisma` - Database schema
- `prisma.config.ts` - Prisma configuration (Prisma 7)

### Configuration
- `package.json` - Dependencies and scripts
- `tsconfig.json` - TypeScript configuration for frontend
- `server/tsconfig.json` - TypeScript configuration for backend
- `.env` - Environment variables
- `.env.example` - Example environment variables

## Directory Structure

```
template-app/
├── src/                    # Frontend source
│   ├── components/         # Reusable components
│   │   ├── Layout/        # Layout component
│   │   └── ErrorBoundary/ # Error boundary
│   ├── pages/             # Page components
│   │   └── Home.tsx       # Home page
│   ├── contexts/          # React contexts
│   ├── utils/             # Utilities
│   ├── config/            # Configuration files (empty)
│   ├── types/             # TypeScript types
│   └── styles/            # Styling and theme
├── server/                # Backend source
│   ├── index.ts           # Express server
│   ├── api/               # API routes
│   ├── config.ts          # Server config
│   └── db.ts              # Database client
├── prisma/                # Database
│   └── schema.prisma      # Schema definition
├── data/                  # Runtime data
│   └── db.db      # SQLite database (created on first run)
├── build/                 # Production build output
│   ├── public/            # Built frontend
│   └── *.js               # Built backend
└── public/                # Static assets
```

## Getting Started

1. **Install dependencies:**
   ```bash
   yarn install
   ```

2. **Set up environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Run development servers:**
   ```bash
   yarn dev
   ```
   This will start both frontend (port 2998) and backend (port 2999)

4. **Add your database models:**
   - Edit `prisma/schema.prisma` to add your models
   - Run `yarn prisma:migrate` to create migrations
   - The Prisma client will be auto-generated

5. **Add your API routes:**
   - Edit `server/api/index.ts` to add your endpoints
   - Use the Express router to define routes

6. **Add your pages:**
   - Create new page components in `src/pages/`
   - Add routes in `src/App.tsx`

## Building for Production

```bash
# Build both frontend and backend
yarn build:server && yarn build

# Run production server
yarn start
```

The production server will serve the built frontend from the backend and handle all API requests.
