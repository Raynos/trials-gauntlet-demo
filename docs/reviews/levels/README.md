# Level reviews

One file per track, written from the game's **Level reviewer** (docs/design/game.md §21). The user reviews a level in
about two minutes; the parent files the result here and re-authors the course from it.

## Reviewing a level (2 minutes, phone or desktop)

1. Main menu → **REVIEW** → tap the track (the row shows how many of its six segments already carry a note).
2. The track opens held still with the bike parked at segment 1. **Drag** to pan along it, **pinch / wheel / − +** to
   zoom, tap **1–6** on the strip to jump to a segment, **FLY** to roll through it at 8 m/s, **RIDE** to drop the bike
   where you are and play from there (gas / brake / lean as usual; a crash puts you back at the segment start; **PARK**
   holds the world again).
3. For each segment worth a word: tap a **★ rating**, the **tags** that apply (`too hard` · `too easy` · `boring` ·
   `unreadable` · `camera` · `asset missing` · `fun`), and type a line in the box. Everything saves as you go
   (localStorage, per track and segment) — you can leave and come back.
4. **Copy review** (or **Share** on a phone) and paste it to the parent. That is the whole hand-off.

## What the parent gets

One string: a markdown table (segment · range · label · rating · tags · comment) and, under it, the same review as JSON:

```json
{"track":"b1-first-ride","name":"First Ride","build":"build d588b1a · 2026-09-15",
 "segments":[{"i":4,"from":236,"to":412,"label":"Second plateau (16 / 10 / 1.2), hump rows, the 42 m x 2.0 wave that used to launch",
              "rating":4,"tags":["too hard"],"comment":"kicker lands short, hold gas"}, "…"],
 "at":"2026-09-15T22:44:53.370Z"}
```

## How the parent consumes it

- File the pasted string as `docs/reviews/levels/<track>.md` verbatim (append a new dated section on a re-review; the
  `build` field says which build was reviewed).
- Route each noted segment to the tracks owner as one line: `<track> seg <i> [<from>–<to> m] <tags> — "<comment>"`.
  Segment ranges are the authored ones (`src/tracks/segments.ts` for the 15 ship tracks, `meta.segments` for the
  playgrounds), so `from`/`to` map straight onto the course builder's cursor.
- `camera` tags go to render; `asset missing` to render + tracks (the segment's `kinds` list in the reviewer says what
  IS placed there); `unreadable` is usually both.
- After the rebuild, the reviewer's stored notes still show on the strip (green dots) — the user re-walks only the
  segments that were noted, re-rates, and copies again; the diff of two dated sections is the round's finding.
