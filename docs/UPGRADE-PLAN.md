# BookWyrm upgrade plan (Oct 2026)

Agreed with Julian in an interview with Iris. Supersedes the unfinished phases 4–5 in TODO.md.

## State before the upgrade
- Live at bookwyrm.julianverse.net (daphne, image `julianh2o/bookwyrm:latest`); all 4 Readarr instances reachable.
- Only 6 books in the DB: the library import (`POST /api/sync/library`) exists but was never run.
- No background polling: requests sit at `searching` forever.
- 3 nonfiction-audio requests failed with `This operation was aborted` (client timeout on a slow Readarr add), and the failures were only visible in the API.

## Decisions
- **Library view:** one row per book, one badge per instance (FA / FE / NFA / NFE) showing that request's status.
- **What gets imported:** monitored books or books with files (current `shouldImportBook` rule). Unmonitored author backlog is skipped.
- **Dedupe across instances:** by foreignBookId/foreignEditionId (shared rreading-glasses metadata), falling back to normalized title + author.
- **Errors live on the badge:** hover shows the phase, the last error in plain words, and when it was last checked. Click retries that phase only.
- **Polling:** every 5 min, plus right after any add/retry.
- **Quick add:** type-ahead search only (no barcode scanning or bulk import yet). Pick a result, then Enter adds it to audio + ebook; the category is guessed from genres and can be flipped with one click.
- **Iris integration:** a `bookwyrm` CLI plus a Hermes skill that talk only to BookWyrm's API. BookWyrm stays the only client of Readarr.
- **Out of scope for now:** friend requests, auth, Kindle, audiobookshelf links, mobile-first layout.
- **Workflow:** push straight to main (Julian's call). Deploy = build/push the image, then pull on daphne.

## Request phases
`add → search → download → import → available`

| Phase    | Source of truth                                           | Retry action                                                |
|----------|-----------------------------------------------------------|-------------------------------------------------------------|
| add      | author/book lookup + add; async with a longer timeout      | re-run lookup/add                                           |
| search   | BookSearch command result; no queue item after search     | trigger BookSearch again                                    |
| download | `/api/v1/queue` status / trackedDownloadState / warnings  | remove from client + blocklist + re-search                  |
| import   | `importBlocked` / `importPending` with sizeleft 0          | ManualImport when there are no rejections, else drop the row |
| available| `statistics.bookFileCount > 0`                            | none                                                        |

Schema: add `phase`, `lastError`, `lastErrorAt`, and `attempts` to BookRequest, plus a `RequestEvent` table (requestId, phase, level, message, createdAt) that backs the hover history.

## Build order
1. **Import + badges + checker**
   - Run and harden the library sync (dedupe, idempotent, re-runs on a timer).
   - Add the phase model, the poller (5 min plus on-demand), and the timeout fix with an async add.
   - Badges with hover details and click-to-retry per phase.
   - Retry the 3 errored requests through the new path.
2. **Quick add:** type-ahead with Enter-to-add, genre-based category guess, audio + ebook by default.
3. **Iris CLI + skill:** search / add / list / status / retry, with `--json` output.
