// The matching rules of the IP audit (scripts/ip-audit.mjs; docs/plans/STORE_RELEASE.md bar 1). Pure functions over a
// string, so scripts/ip-audit.test.mjs pins every tricky case.
//
// Two kinds of term, two rules:
//
// 1. FRANCHISE TERMS (`FRANCHISE_TERMS`: the Trials / Ubisoft / RedLynx names, "gauntlet", "no fear", "demo") are
//    strict. Case-insensitive, and a hit is any occurrence that is a WORD of the text, not a piece of a longer word:
//      - the character before is not a letter, or the text turns from lower to upper case there (`isTrialsMode`);
//      - the character after is not a letter, or the text turns from lower to upper case there (`trialsKey`), or it is
//        a plural `s` that itself ends the word (`demos`).
//    Digits, `_`, `-`, `.`, quotes and spaces all bound a word, so `trials_key`, `trials-bike`, `demo2`,
//    `"Trials"` and the plural "Gauntlets" count. Only a longer word is exempt: "ar(ising)" in the OFL licence
//    texts, "demo(nstrate)", "pro(demo)".
//
// 2. RETIRED LEVEL NAMES (the `name` of every track in src/tracks `RETIRED_TRACKS`: the curriculum, the `p<n>-*`
//    playgrounds and the Labs) are matched CASE-SENSITIVELY, as authored or in ALL CAPS, on word boundaries. A title is
//    written in title case ("The Rolling Mill"); the riding copy that shares its words is not ("the stack trace",
//    "Lean back if the nose drops"). Then:
//      - a DISTINCTIVE name (every name not in `GENERIC_LEVEL_NAMES`) counts wherever it occurs;
//      - a GENERIC name (`GENERIC_LEVEL_NAMES`: names made only of riding vocabulary, which hints, tutorials and
//        segment labels legitimately use: "Lean Back", "See-Saw", "Hop Up", "Stairway", ...) counts only in TITLE
//        CONTEXT: the exact name is the whole of a string literal or JSON value (`"Lean Back"`, `'See-Saw'`,
//        `` `Stairway` ``) or the whole of an HTML text node (`>Hop Up<`). That is how a level title ships (a track
//        def's `name:`, a card's label); "Lean Back to land" in a hint is not a title.
//    A name added to `RETIRED_TRACKS` later is DISTINCTIVE until someone lists it here: the default is strict.

/** Case-insensitive, whole-word (rule 1). */
export const FRANCHISE_TERMS = ['trials', 'gauntlet', 'ubisoft', 'redlynx', 'evolution', 'rising', 'fusion', 'no fear', 'demo'];

/** Retired level names made only of riding vocabulary: flagged in title context only (rule 2). */
export const GENERIC_LEVEL_NAMES = new Set([
  'First Ride',
  'Lean Back',
  'Kicker Row',
  'Uphill Weight',
  'Rear Wheel First',
  'Stairway',
  'Hop Up',
  'Drum Roll',
  'See-Saw',
]);

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isLetter = (c) => c !== undefined && c !== '' && c.toLowerCase() !== c.toUpperCase();
const isLower = (c) => isLetter(c) && c === c.toLowerCase();
const isUpper = (c) => isLetter(c) && c === c.toUpperCase();

/** Hits of one franchise term in `text` (rule 1). */
export function franchiseHits(text, term) {
  const re = new RegExp(escape(term), 'gi');
  let n = 0;
  for (const m of text.matchAll(re)) {
    const start = m.index;
    let end = start + m[0].length;
    const first = text[start];
    const last = text[end - 1];
    const before = text[start - 1];
    const startsWord = !isLetter(before) || (isLower(before) && isUpper(first));
    if (!startsWord) continue;
    // A plural `s` that ends the word is part of the term ("Trials" is already the term; "demos", "Gauntlets").
    if ((text[end] === 's' || text[end] === 'S') && !isLetter(text[end + 1])) end += 1;
    const after = text[end];
    const endsWord = !isLetter(after) || (isLower(text[end - 1] ?? last) && isUpper(after));
    if (endsWord) n += 1;
  }
  return n;
}

/** Hits of one retired level name in `text` (rule 2). */
export function levelHits(text, name) {
  const forms = [...new Set([name, name.toUpperCase()])];
  let n = 0;
  if (GENERIC_LEVEL_NAMES.has(name)) {
    const re = new RegExp(`(["'\`])(${forms.map(escape).join('|')})\\1|>\\s*(?:${forms.map(escape).join('|')})\\s*<`, 'g');
    // The generic case is the authored form only: an ALL-CAPS "LEAN BACK" literal is a control label, not a title.
    for (const m of text.matchAll(re)) if ((m[2] ?? m[0].replace(/^>\s*|\s*<$/g, '')) === name) n += 1;
    return n;
  }
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(?:${forms.map(escape).join('|')})(?![\\p{L}\\p{N}])`, 'gu');
  for (const _ of text.matchAll(re)) n += 1;
  return n;
}

/** Every term's hits in `text`: franchise terms first, then the level names (a name that IS a franchise term is counted once, as the term). */
export function auditText(text, levelNames) {
  const out = {};
  for (const t of FRANCHISE_TERMS) {
    const n = franchiseHits(text, t);
    if (n) out[t] = n;
  }
  for (const name of levelNames) {
    if (FRANCHISE_TERMS.includes(name.toLowerCase())) continue;
    const n = levelHits(text, name);
    if (n) out[name] = n;
  }
  return out;
}
