---
name: toon-live-dev
description: >
  Toon Live monorepo dev workflow — starting the local dev stack, live-verifying
  a change via Playwright against the real running app (not guessing from
  reading code), and the multi-repo (submodule) commit/push discipline this
  project uses. Use whenever working in /root/git/toon-live: fixing a bug,
  adding a feature, or before claiming something works.
---

Read `docs/ai-context.md` first for architecture/API/schema — this skill is
the day-to-day workflow, not a reference.

## Repo shape

10 git repos: root (`toon-live`, superproject with real git submodules — NOT
Bun workspace symlinks) + `game-core`, `game-avatar`, `game-types`,
`game-socket`, `game-web`, `game-admin`, `game-api`, `game-server-java`,
`game-assets`. Each has its own remote, own history, own `main` branch.

## Dev stack

```
docker compose -f docker-compose.dev.yml up -d   # postgres :5432, adminer :8888, game-assets :3001
cd game-api        && ./gradlew bootRun            # :8080, log /tmp/game-api-dev.log
cd game-server-java && ./gradlew bootRun            # :8081, log /tmp/game-server-dev.log
cd game-web         && bun run start                # :4200 (vite), log /tmp/game-web-dev.log
cd game-admin       && bun run start                # :4201
```
All four (api/server/web dev builds) have **live-reload on file save** — edit,
wait a few seconds, check the log for `Started ...Application` (Java) or
`Application bundle generation complete` (Angular/vite) before testing. A
build error shows as `vite-error-overlay intercepts pointer events` in
Playwright — check the log, not the symptom, and retry once it's fixed; it's
almost always a transient error from mid-edit, not a real failure.

Test account: `pwtestuser1` / `TestPass123!`. Jardin room = `rooms.id=1`.

## Live-verify before claiming a fix works

This codebase's convention: **never** conclude "should work now" from reading
code alone for anything touching rendering, collision, or network sync —
verify live. Playwright pattern used throughout this project's history:

```python
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1280, "height": 800})
    page.on("pageerror", lambda e: errs.append(str(e)))
    page.goto("http://localhost:4200/login")
    page.wait_for_timeout(1000)
    page.locator('input[formcontrolname="username"]').nth(0).fill("pwtestuser1")
    page.locator('input[formcontrolname="password"]').nth(0).fill("TestPass123!")
    page.locator('button[type="submit"]').nth(0).click()
    page.wait_for_timeout(2000)
    page.click('img[alt="Navigateur"]')
    page.wait_for_timeout(500)
    page.click('text=Jardin')
    page.wait_for_url("**/room/1", timeout=10000)
    page.wait_for_timeout(7000)   # asset loading is slow, don't shortcut this
```
(duplicate login/register form fields in the DOM — always `.nth(0)`.)

To inspect/drive the live PixiJS scene (GameCore, HouseView, FurnitureView,
collision, z-order) rather than only pixels: temporarily add
`(window as any).__gc = this.gc;` right after `gc.setCameraPosition(...)` in
`game-canvas.component.ts`, drive it via `page.evaluate(...)`, **then remove
the hook before committing** — grep `git diff` for `__gc` before every commit
in that file, it's easy to forget.

Prefer asserting on **data** (DB row via `docker exec -i toonlive-dev-postgres
psql ...`, a captured websocket frame, a value read back through the `__gc`
hook) over eyeballing a screenshot — screenshots are for the cases (visual
alignment, aliasing, z-order) where pixels are literally what's being tested.

To see raw STOMP traffic:
```python
def on_ws(ws):
    ws.on("framesent", lambda p: frames.append(("SENT", p)))
    ws.on("framereceived", lambda p: frames.append(("RECV", p)))
page.on("websocket", on_ws)
```

Clean up test data (`docker exec ... psql`) and test-only asset files before
finishing — this project's rooms/inventories are shared dev-account state,
not disposable fixtures.

## Commit & push discipline

Work on `main` directly, no feature branches, no PRs. For a change spanning
N repos: one commit per repo (full rationale in the body — what broke, how
it was found, what the fix does, what live-verification confirmed), **then**
one more commit in the root repo bumping the submodule pointers (`git add
game-core game-web ...` — only the repos that actually changed — `git
commit`). Never touch `.angular/cache`, `dist/`, or `bin/**/*.class` — those
are pre-existing stale build artifacts in several repos, not real changes;
leave them out of every commit.

Push order: every leaf repo first, root last (root's gitlinks must resolve on
the remote).

```bash
for d in game-core game-avatar game-types game-socket game-web game-admin game-api game-server-java game-assets; do
  git -C "$d" push origin main
done
git push origin main   # root, last
```

Verify nothing is left uncommitted/unpushed in any repo before reporting done:
```bash
for d in . game-core game-avatar game-types game-socket game-web game-admin game-api game-server-java game-assets; do
  git -C "$d" status --short --branch | head -1   # want "## main...origin/main" with no ahead/behind
done
```

## Known gotchas (don't rediscover these)

- **`ZOrder.ts` is duplicated** at `game-core/src/modules/common/ZOrder.ts` AND
  `game-avatar/src/modules/common/ZOrder.ts` (game-avatar can't import
  game-core — GameCore imports Avatar FROM game-avatar). Any change to
  isometric depth-sort weights must be applied to **both** files by hand, or
  every remote player's z-order silently drifts from the local player's.
- **Isometric projection** (`game-core/src/utils/project.ts`): angle -45°,
  `depthFactor = Math.sqrt(2)` — not an arbitrary tuning constant, it's
  forced by the geometry (see the file's own comment, derived from the
  original Flash game's `Maison.as`). Furniture/avatar z-order weight
  (`ZOrder.ISO_X_WEIGHT = 2/9`) is likewise derived from that same original
  engine, not picked by eye.
- **Furniture ground-anchor `points`** (collision + z-order footprint) are
  raw atlas-pixel offsets baked by `swf_to_furniture.py`, added to
  `Furniture.x/y` — must be divided by the sheet's `meta.scale` and put
  through a convex hull (`convexHull()` in `collision.ts`) before use; the
  artist's marker order in the source SWF is not a valid polygon winding.
- **PixiJS `Application.destroy(true, ...)`** (literal boolean, not `{}`) —
  the boolean form releases a **page-global** resource registry shared by
  every PixiJS canvas on the page, corrupting every other live canvas.
  Always pass an object: `destroy({}, {...})`.
- Doors are structural walls for collision (no gap) — a room has no
  "outside" to walk into; entering only ever happens via a server-computed
  spawn at the door center (`HouseGeometry.java` in game-server-java, ported
  from `HouseParser.ts`'s own pipeline — keep both in sync by hand, same
  problem as ZOrder.ts above).
