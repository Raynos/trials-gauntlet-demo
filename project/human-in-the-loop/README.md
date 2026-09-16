# human-in-the-loop/ — the human's queue

The inverse of the agents' work: items only the **user** can action. An agent files here **instead of blocking** —
pick a sensible default, apply it, queue the fork for override. Everything is in [QUEUE.md](QUEUE.md), two sections:

- **Decisions (HD-nn)** — forks that change what the game *is*. State the fork, the options, the default already applied, the reversal cost.
- **Reviews (HR-nn)** — look / feel / fun / taste verdicts a proxy cannot give. Point at exactly what to play or look at.

Every open item leads with **Waiting on: you — <the exact action + the exact place>**. The user answers inline or in chat; the agent
drains answers next session: the verdict goes into the item's home (the plan, `docs/tasks/ASKS.md` row, a design SPEC), the item is
struck through here with the date and moved under **Answered**. IDs are never reused. The session brief (`.claude/hooks/session-brief.sh`)
prints the open items at every session start. Ported from `games/kami-kakushi` via `vibe-demos/fe-shooter-prototype-fable` (the light version).
