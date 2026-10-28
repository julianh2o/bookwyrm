#!/usr/bin/env python3
"""bookwyrm: command line for Julian's BookWyrm (one list of books across all Readarr instances).

Talks only to BookWyrm's API; BookWyrm is the only thing that talks to Readarr.
Base URL: $BOOKWYRM_URL (default https://bookwyrm.julianverse.net).

  bookwyrm search "piranesi"                    metadata search (ids for add --id)
  bookwyrm add "piranesi susanna clarke"        add the best match (audio + ebook, category guessed)
  bookwyrm add --id 175280 --fiction --audio    add an exact work id, only the audiobook
  bookwyrm add "..." --dry-run                  show what would be added
  bookwyrm list [--status error] [--search q] [--category fiction] [--sort activity] [--limit 50]
  bookwyrm errors                               everything that needs attention, with the error text
  bookwyrm status <book id | title words>       badges + recent history for one book
  bookwyrm retry <book id | title words> [--instance NFA]   retry the phase each errored badge is stuck in
  bookwyrm health                               background checker health per instance
  bookwyrm check                                poll all Readarr instances now
Add --json to any command for machine-readable output.
"""

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

BASE = os.environ.get("BOOKWYRM_URL", "https://bookwyrm.julianverse.net").rstrip("/")
SHORT = {
    "fiction-audio": "FA",
    "fiction-ebook": "FE",
    "nonfiction-audio": "NFA",
    "nonfiction-ebook": "NFE",
}
SHORT_TO_ID = {v: k for k, v in SHORT.items()}
ICON = {
    "available": "✓",
    "downloading": "↓",
    "importing": "⇣",
    "searching": "…",
    "adding": "+",
    "pending": "·",
    "wanted": "?",
    "error": "✗",
    "not_found": "✗",
}


class ApiError(Exception):
    pass


def api(method, path, body=None, timeout=120):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        BASE + path,
        data=data,
        method=method,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        try:
            payload = json.loads(e.read())
        except Exception:
            payload = {}
        raise ApiError(f"{e.code}: {payload.get('error') or e.reason}") from None
    except urllib.error.URLError as e:
        raise ApiError(f"can't reach {BASE}: {e.reason}") from None


def short(instance_id):
    return SHORT.get(instance_id, instance_id)


def badge(r):
    s = f"{short(r['instanceId'])}{ICON.get(r['status'], '?')}"
    if r["status"] == "downloading" and r.get("progress") is not None:
        s += f"{round(r['progress'] * 100)}%"
    return s


def book_line(b):
    badges = " ".join(badge(r) for r in b.get("requests", []))
    return f"{b['title']} — {b['author']} [{b['category']}]  {badges}  (id {b['id']})"


def find_book(query):
    """A BookWyrm book id, or words from the title/author."""
    if re.fullmatch(r"c[a-z0-9]{20,}", query):
        return api("GET", f"/api/books/{query}")
    res = api("GET", "/api/books?" + urllib.parse.urlencode({"search": query, "limit": 10}))
    books = res["books"]
    if not books:
        raise ApiError(f'no book in BookWyrm matches "{query}"')
    exact = [b for b in books if b["title"].lower() == query.lower()]
    if len(exact) == 1 or len(books) == 1:
        return (exact or books)[0]
    raise ApiError(
        f'"{query}" matches {len(books)} books; use an id:\n' + "\n".join("  " + book_line(b) for b in books)
    )


def out(args, data, text):
    if args.json:
        print(json.dumps(data, indent=2))
    else:
        print(text)


def cmd_search(args):
    res = api("GET", "/api/metadata/search?" + urllib.parse.urlencode({"q": args.query, "limit": args.limit}))
    results = res.get("results", [])
    lines = [
        f"{r['id']:>9}  {r['title']} — {', '.join(r.get('authors', []))}" + (f" ({r['year']})" if r.get("year") else "")
        for r in results
    ]
    out(args, results, "\n".join(lines) or "no results")


def pick_result(query, results):
    """Prefer a result whose author words appear in the query, then the first one."""
    q = query.lower()
    for r in results:
        if any(a and a.split()[-1].lower() in q for a in r.get("authors", [])):
            return r
    return results[0] if results else None


def cmd_add(args):
    if args.id:
        meta = api("GET", f"/api/metadata/book/{urllib.parse.quote(args.id)}")
        chosen = {
            "id": meta["id"],
            "title": meta["title"],
            "authors": [a["name"] for a in meta.get("authors", [])],
            "coverUrl": meta.get("coverUrl"),
        }
        suggested = meta.get("suggestedCategory")
    else:
        if not args.query:
            raise ApiError("give a title (and ideally author) or --id")
        res = api("GET", "/api/metadata/search?" + urllib.parse.urlencode({"q": args.query, "limit": 8}))
        chosen = pick_result(args.query, res.get("results", []))
        if not chosen:
            raise ApiError(f'no metadata match for "{args.query}"; try `bookwyrm search`')
        suggested = api("GET", f"/api/metadata/book/{chosen['id']}").get("suggestedCategory")

    category = "fiction" if args.fiction else "nonfiction" if args.nonfiction else (suggested or {}).get("category")
    if not category:
        raise ApiError(f"couldn't guess fiction/nonfiction for \"{chosen['title']}\"; pass --fiction or --nonfiction")
    types = ["audio"] if args.audio else ["ebook"] if args.ebook else ["audio", "ebook"]
    instance_ids = [f"{category}-{t}" for t in types]

    plan = {
        "title": chosen["title"],
        "author": ", ".join(chosen.get("authors", [])) or "Unknown Author",
        "category": category,
        "categoryReason": None if (args.fiction or args.nonfiction) else (suggested or {}).get("reason"),
        "metadataId": chosen["id"],
        "metadataProvider": "rreading-glasses",
        "coverUrl": chosen.get("coverUrl") if (chosen.get("coverUrl") or "").startswith("http") else None,
        "instanceIds": instance_ids,
    }
    if args.dry_run:
        out(
            args,
            plan,
            f"would add: {plan['title']} — {plan['author']} [{category}"
            + (f", guessed from {plan['categoryReason']}" if plan["categoryReason"] else "")
            + f"] → {' '.join(short(i) for i in instance_ids)} (work {plan['metadataId']})",
        )
        return
    body = {k: v for k, v in plan.items() if k != "categoryReason"}
    book = api("POST", "/api/books", body)
    verb = "already tracked" if book.get("existing") else "added"
    out(args, book, f"{verb}: {book_line(book)}\nsending to Readarr in the background; `bookwyrm status {book['id']}` to follow")


def cmd_list(args):
    params = {"limit": args.limit, "sort": args.sort}
    for key in ("status", "search", "category"):
        if getattr(args, key):
            params[key] = getattr(args, key)
    res = api("GET", "/api/books?" + urllib.parse.urlencode(params))
    out(args, res, f"{res['total']} book(s)\n" + "\n".join(book_line(b) for b in res["books"]))


def cmd_errors(args):
    res = api("GET", "/api/books?" + urllib.parse.urlencode({"status": "error", "limit": 200}))
    lines = []
    for b in res["books"]:
        lines.append(book_line(b))
        for r in b["requests"]:
            if r["status"] == "error":
                lines.append(f"    {short(r['instanceId'])} [{r['phase']}] {r.get('errorMessage') or ''}")
    out(args, res, "\n".join(lines) or "nothing needs attention")


def cmd_status(args):
    book = find_book(args.book)
    lines = [book_line(book)]
    for r in book["requests"]:
        lines.append(
            f"  {short(r['instanceId']):<4} {r['phase']:<9} {r['status']:<11} checked {r.get('lastChecked') or 'never'}"
            + (f"  attempts {r['attempts']}" if r.get("attempts") else "")
        )
        if r.get("errorMessage"):
            lines.append(f"       error: {r['errorMessage']}")
        events = api("GET", f"/api/books/requests/{r['id']}/events")["events"][: args.events]
        r["events"] = events
        for e in events:
            lines.append(f"       {e['createdAt'][:16].replace('T', ' ')}  {e['message']}")
    out(args, book, "\n".join(lines))


def cmd_retry(args):
    book = find_book(args.book)
    targets = book["requests"]
    if args.instance:
        wanted = SHORT_TO_ID.get(args.instance.upper(), args.instance)
        targets = [r for r in targets if r["instanceId"] == wanted]
    else:
        targets = [r for r in targets if r["status"] in ("error", "not_found")]
    if not targets:
        raise ApiError("nothing to retry (no errored badges; pass --instance to retry a specific one)")
    results = []
    for r in targets:
        try:
            res = api("POST", f"/api/books/requests/{r['id']}/retry")
            results.append({"instance": r["instanceId"], "action": res["action"]})
        except ApiError as e:
            results.append({"instance": r["instanceId"], "error": str(e)})
    out(
        args,
        results,
        "\n".join(
            f"{short(x['instance'])}: " + (f"retrying ({x['action']})" if "action" in x else f"failed: {x['error']}")
            for x in results
        ),
    )


def cmd_health(args):
    res = api("GET", "/api/sync/status")
    lines = []
    for h in res["instances"]:
        state = "ok" if h["ok"] else f"DOWN: {h['error']}"
        lines.append(
            f"{short(h['instanceId']):<4} {state:<4} checked {h.get('lastPollAt') or 'never'}  "
            f"{h['booksTracked']}/{h['booksInLibrary']} tracked  queue {h['queueItems']}"
            + (f" ({h['foreignQueueItems']} not this instance's)" if h["foreignQueueItems"] else "")
        )
    counts = {}
    for c in res["counts"]:
        counts.setdefault(c["status"], 0)
        counts[c["status"]] += c["count"]
    lines.append("requests: " + ", ".join(f"{k} {v}" for k, v in sorted(counts.items())))
    out(args, res, "\n".join(lines))


def cmd_check(args):
    res = api("POST", "/api/sync/library", timeout=300)
    s = res["summary"]
    out(
        args,
        res,
        f"checked {s['totalInstances']} instances: {s['totalBooksCreated']} new books, "
        f"{s['totalRequestsChanged']} status changes, {s['totalErrors']} unreachable",
    )


def main():
    p = argparse.ArgumentParser(prog="bookwyrm", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--json", action="store_true", help="machine-readable output")
    sub = p.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("search", help="search book metadata")
    s.add_argument("query")
    s.add_argument("--limit", type=int, default=8)
    s.set_defaults(fn=cmd_search)

    s = sub.add_parser("add", help="add a book (audio + ebook by default)")
    s.add_argument("query", nargs="?")
    s.add_argument("--id", help="rreading-glasses work id (from `search`)")
    g = s.add_mutually_exclusive_group()
    g.add_argument("--fiction", action="store_true")
    g.add_argument("--nonfiction", action="store_true")
    g = s.add_mutually_exclusive_group()
    g.add_argument("--audio", action="store_true", help="audiobook only")
    g.add_argument("--ebook", action="store_true", help="ebook only")
    s.add_argument("--dry-run", action="store_true")
    s.set_defaults(fn=cmd_add)

    s = sub.add_parser("list", help="list books")
    s.add_argument("--status", help="pending|adding|searching|wanted|downloading|importing|available|error")
    s.add_argument("--search")
    s.add_argument("--category", choices=["fiction", "nonfiction"])
    s.add_argument("--sort", default="recent", choices=["recent", "activity", "title", "author"])
    s.add_argument("--limit", type=int, default=50)
    s.set_defaults(fn=cmd_list)

    s = sub.add_parser("errors", help="books that need attention")
    s.set_defaults(fn=cmd_errors)

    s = sub.add_parser("status", help="one book's badges and history")
    s.add_argument("book", help="BookWyrm id or title words")
    s.add_argument("--events", type=int, default=5)
    s.set_defaults(fn=cmd_status)

    s = sub.add_parser("retry", help="retry errored badges for a book")
    s.add_argument("book", help="BookWyrm id or title words")
    s.add_argument("--instance", help="FA, FE, NFA or NFE (default: every errored badge)")
    s.set_defaults(fn=cmd_retry)

    s = sub.add_parser("health", help="background checker health")
    s.set_defaults(fn=cmd_health)

    s = sub.add_parser("check", help="poll every Readarr instance now")
    s.set_defaults(fn=cmd_check)

    args = p.parse_args()
    try:
        args.fn(args)
    except ApiError as e:
        print(f"bookwyrm: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
