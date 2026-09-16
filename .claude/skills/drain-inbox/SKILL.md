---
name: drain-inbox
description: Pull the in-game review notes (pnpm inbox:pull → .review/inbox/), read every note with its screenshot, ledger each one in docs/tasks/ASKS.md, then dispatch to the owning area or fix. Use when the user says "drain the inbox", "process my notes", "act on my feedback", or after a phone review session.
---

# Drain the review inbox

The user plays on the phone with `?review=1` and taps **✎ Note** (`src/ui/inbox.ts`). Each note lands in
Vercel Blob through `api/inbox.ts` and `pnpm inbox:pull` brings it down as `.review/inbox/<id>.json` +
`<id>.jpg` (gitignored; the password comes from `.env.local` — `vercel env pull` if it is missing).

The notes are the user's own words with the repro state attached: authoritative about *what looks wrong*, a hypothesis about *why*.

## 1. Pull and read

```bash
pnpm inbox:pull && ls .review/inbox/*.json | wc -l     # table: time, track, tick, id, first 80 chars
```

Read every `.json` and **look at its `.jpg` with the Read tool** — a note is only actionable next to
its picture. Each carries `note` and `context`: `trackId`, `tick`, `runTime`, `faults`, `phase`, `checkpoint`,
`bike`, `seed`, `device`, `quality`/`tier`/`deviceClass`/`dpr`/`canvas`, `riderModel`/`riderOutfit`/`bikeModel`,
`version` + `build` (git sha), `ua`, `viewport`, `url`.

**Check `build` first** against `git log --oneline`: a note filed on an older sha may already be fixed
— verify before spending an agent. `riderModel` / `quality` say which path the user was on; reproduce on
that path (`?rider=…`, `?quality=…`), never on the default.

## 2. Ledger, then reproduce

Append **one row per note** to the day's table in `docs/tasks/ASKS.md` (the asks ledger — its rules are
at the top of the file): the note's words shortened, status **open**, and `.review/inbox/<id>` as the
evidence pointer. The ledger row exists before any work starts.

Reproduce headless (never a real browser): the harness's `openGame` + `HookClient`, load `trackId` with `seed`,
drive to `tick` (a golden replay for that track gets close), capture a clip (`pnpm harness:clip`) — WebKit at
932×430 for anything filed from iOS. Dismiss what you cannot reproduce and say so.

## 3. Group by owning area and dispatch

Dispatch by **who owns the files** (`docs/design/CONTRACT.md` §0), one owner per area, never two in
one directory: physics `src/physics/**` · render `src/render/**` (camera, hero, biomes, post) · ui
`src/ui/**`, `src/game/**`, `src/main.ts` (HUD, menus, garage, touch, quality governor) · tracks
`src/tracks/**` · audio `src/audio/**` · harness `harness/**`. Read `docs/plans/README.md` for who is
already live; route a note to a live owner with `SendMessage` rather than spawning a second one.

Each brief carries: the verbatim note + the `.jpg` path, the repro (track, seed, tick, rider/quality
path), the ownership list, the standing gates (`pnpm typecheck`, `pnpm test`, the area's harness
command, `pnpm harness:determinism` for anything near physics) and "clips, not stills".

## 4. Close the loop

```bash
mkdir -p .review/handled && mv .review/inbox/<id>.* .review/handled/
```

Move a note only after the fix is seen moving (a clip). Update its ASKS.md row to **done** (commit + evidence),
**dropped** (not reproducible — say why) or **in flight** with the owner named. Report per note: fixed /
not reproducible / already fixed at `<sha>` / deferred with a reason.
