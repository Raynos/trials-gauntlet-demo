---
name: prepare-to-exit
description: Checkpoint the session and prepare to exit — commit your own paths, flip the ledgers, queue every leftover, push (which deploys) and confirm the CI run went live, report, then print the BYE / OOPS banner. User-invoked only.
disable-model-invocation: true
---

# Prepare to exit

Ported from `house` / `kami-kakushi` on 2026-09-17; the steps are this repo's (AGENTS.md is canon). Execute in
order; don't paraphrase or shortcut. The push in step 5 deploys (CI, since ask 84); a pin is its own ask.

## Steps

1. **Commit by path, only yours.** The tree is shared by several sessions and their owners. `git status`; stage
   **only the paths your owners touched** (never `git add -A`, never `git commit` with no pathspec); if a shared
   file (`docs/tasks/ASKS.md`, `docs/plans/README.md`, `harness/e2e/touch.mts`…) carries someone else's hunks,
   commit only your hunks through a temporary index (`GIT_INDEX_FILE` → `read-tree HEAD` → `apply --cached` your
   hunk → `write-tree` → `commit-tree` → `update-ref refs/heads/main <new> <old>`, then `git reset -q -- <paths>`).
   One commit per round; the subject states the finding; typecheck (`pnpm typecheck`), lint and `vitest` green on
   what you touched — say plainly what is red and whose it is. The md-budget hook refuses a > 40 % markdown commit
   unless the subject starts `Docs:` / `Design:`.
2. **Ledgers.** Every ask you took this session is a row in `docs/tasks/ASKS.md` and its status is true
   (**done** with the commit / evidence path, **in flight** with the owner, or **dropped** with the user's words).
   `docs/plans/README.md` rows for any plan you moved are current; a closed plan carries its `Closed:` header and
   lives in `project/archive/`. `RELEASES.md` has the pin if you deployed.
3. **Leftover-work sweep — a QUEUE, not a record.** Anything this session **ruled, found, deferred or decided but
   did not build** must have a home an agent or the human starts from: an **open row in `docs/tasks/ASKS.md`**, a
   **plan in `docs/plans/`** (tracker row + file), or an **HR line in `project/human-in-the-loop/QUEUE.md`** (only
   the human can call it; say exactly what they must decide). A commit body, an evidence README, a chat message or
   a memory note is a RECORD, not a QUEUE — the session brief reads the queue and the open asks, nothing else, so
   work parked anywhere else is read once and never resumed. This is the step most likely to be skipped because
   everything *looks* clean; it is a banner precondition below.
4. **Subagents.** Don't kill running subagents to exit — a checkpoint resumes committed state; live work notifies
   when done. List every owner still alive with what it holds. Owners are idle by default when they have reported;
   say so. `TaskStop` only if the user asks.
5. **Push — and a push IS a deploy.** `.github/workflows/deploy.yml` runs typecheck → lint → unit tests → build on
   every push to `main` and, all green, ships that commit to https://trials-gauntlet-demo.vercel.app. So:
   `git push origin main` (rejected → `git fetch && git merge origin/main`, never rebase), then
   `gh run watch $(gh run list --limit 1 --json databaseId -q '.[0].databaseId') --exit-status` and confirm
   `curl -s https://trials-gauntlet-demo.vercel.app/version.json` names your HEAD's short SHA — put that build in
   the ASKS row. A red run on your push is your red: fix it before the banner. Work that must not reach players
   yet does not go on `main` (a preview deploy instead). Never `vercel deploy --prod` by hand while CI is healthy;
   `gh workflow run deploy` re-ships HEAD. An unpushed commit **is** an OOPS unless the queue names why.
6. **Memory.** If this session learned something the next one must know that the repo does not record (a tool
   gotcha, a user rule, a decision's why), write it to the memory directory and index it in `MEMORY.md`.
7. **Report**, then the banner. The report names: commits (SHAs + one line each), what is deployed and pinned,
   gates run and their results, what is left local, every live owner, every open ask and HR item this session
   touched — so the user knows whether it is safe to close.

Guardrails: never `rm -r` / `rm -rf` / `find -delete` (the `dcg` hook prompts the human) — `trash`. Never `git push
--force`, never rewrite history, never touch another session's dirty files. Don't `AskUserQuestion` on the way out —
the banner is the question's answer.

## Last step — the sign-off banner (MANDATORY, ALWAYS)

The **final thing in your final message**, after the report, is **one** of the two banners below — printed
**verbatim, inside a fenced code block**, as the last lines you emit. Nothing follows it: no sign-off prose,
no "let me know if…", no further tool calls.

**A banner ALWAYS prints. There is no path through this skill that ends without one.** Its job is to answer
*"did this session run prepare-to-exit?"* from across the room — the human reads the answer off the
**silhouette alone**. A silent failure looks exactly like a session that never ran the skill, which is the one
outcome that breaks the signal: a failed checkpoint doesn't *suppress* the banner, it **switches** it.

The two banners answer **one** question — not "did the git commands succeed" but:

> **Is it safe to KILL this pane right now?**

- **BYE — safe to close.** Your work is committed on `main`, your gates are green, the session is at a coherent
  stopping point, the push either succeeded or is blocked by a reason the queue names, **and the leftover-work
  sweep is done — every ruling, finding and deferral this session produced has a home in `docs/tasks/ASKS.md`,
  `docs/plans/` or `project/human-in-the-loop/QUEUE.md`**. A BYE is a claim that nothing here will be lost.
- **OOPS — do NOT close.** Any of these, and they weigh the same:
  1. **Something is wrong.** Not green, broken, a gate you couldn't fix, a stranded commit with no queued reason —
     or you simply **don't know** whether it's sound. Uncertainty is an OOPS: the banner is a safety signal, so
     it fails *loud*, not *optimistic*.
  2. **Leftover work has no queue.** Something this session ruled, found or deferred lives only in a commit body,
     an evidence README, a memory note or a chat message. Queue it (it is five minutes) and *then* BYE; if you
     cannot, OOPS and name it.
  3. **The session is half-built.** Run too early — mid-implementation, an owner mid-round with uncommitted edits
     that nobody else will finish, a feature wired but unreachable. **A clean `git status` does NOT mean done.**
     Ask it straight: *if this pane were killed right now, would anything be left half-implemented?* If yes →
     **OOPS**, and the report names exactly what's half-done and where to resume.

Never print BYE over either case — a BYE on a half-finished session is a false green, and it is the *report*, not
the banner, that carries the detail.

Both are **fixed, byte-stable signals**, not decoration — they only work if they are **always the same**. Copy
them character-for-character: don't retype from memory, don't restyle, don't personalize, don't append a run
summary inside the box, don't swap the block letters. The two are deliberately distinguishable when blurred or
squished: BYE is light-bordered and 4 glyphs, OOPS is heavy double-bordered and squarer.

**BYE — checkpoint clean:**

```
   ┌──────────────────────────────────────────────────────────────┐
   │  ██████╗ ██╗   ██╗███████╗██╗                                │
   │  ██╔══██╗╚██╗ ██╔╝██╔════╝██║  prepare-to-exit is complete.  │
   │  ██████╔╝ ╚████╔╝ █████╗  ██║  committed - verified - pushed │
   │  ██╔══██╗  ╚██╔╝  ██╔══╝  ╚═╝                                │
   │  ██████╔╝   ██║   ███████╗██╗  you may close this session.   │
   │  ╚═════╝    ╚═╝   ╚══════╝╚═╝                                │
   └──────────────────────────────────────────────────────────────┘
```

**OOPS — prepare-to-exit ran, but this session is NOT safe to close:**

```
   ╔═════════════════════════════════════════════════════════════════════╗
   ║   ██████╗  ██████╗ ██████╗ ███████╗                                 ║
   ║  ██╔═══██╗██╔═══██╗██╔══██╗██╔════╝  prepare-to-exit ran, but       ║
   ║  ██║   ██║██║   ██║██████╔╝███████╗  this session is NOT done.      ║
   ║  ██║   ██║██║   ██║██╔═══╝ ╚════██║                                 ║
   ║  ╚██████╔╝╚██████╔╝██║     ███████║  something is red or half-done  ║
   ║   ╚═════╝  ╚═════╝ ╚═╝     ╚══════╝  read the report; DON'T close.  ║
   ╚═════════════════════════════════════════════════════════════════════╝
```
