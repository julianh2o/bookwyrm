# Architecture

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
