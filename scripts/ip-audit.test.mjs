// The IP audit's matching rules (scripts/ip-audit-rules.mjs): the cases that decide whether bar 1 means anything.
import { describe, expect, it } from 'vitest';
import { GENERIC_LEVEL_NAMES, auditText, franchiseHits, levelHits } from './ip-audit-rules.mjs';

describe('franchise terms: case-insensitive, whole words, strict', () => {
  it.each([
    ['Trials Gauntlet', 'trials', 1],
    ['TRIALS', 'trials', 1],
    ['trials-gauntlet-demo', 'trials', 1],
    ['trials-gauntlet-demo', 'gauntlet', 1],
    ['trials-gauntlet-demo', 'demo', 1],
    ['localStorage["trials.best"]', 'trials', 1],
    ['trials_key', 'trials', 1],
    ['isTrialsMode', 'trials', 1],
    ['trialsKey', 'trials', 1],
    ['x3-gauntlet', 'gauntlet', 1],
    ['Gauntlets', 'gauntlet', 1],
    ['demos', 'demo', 1],
    ['demo2', 'demo', 1],
    ['Trials Rising', 'rising', 1],
    ['The Rising Pillars', 'rising', 1],
    ['No Fear', 'no fear', 1],
    ['a RedLynx title', 'redlynx', 1],
    ['Ubisoft', 'ubisoft', 1],
  ])('%j counts %s', (text, term, n) => {
    expect(franchiseHits(text, term)).toBe(n);
  });

  it.each([
    // The OFL licence texts: "arising" is the licence's own word, not the franchise.
    ['OTHER DEALINGS IN THE FONT SOFTWARE ... ARISING FROM, OUT OF THE USE', 'rising'],
    ['or other liability, whether in an action of contract, tort or otherwise, arising from', 'rising'],
    ['demonstrate', 'demo'],
    ['prodemo', 'demo'],
    ['demolish', 'demo'],
    ['confusion', 'fusion'],
    ['revolution', 'evolution'],
    ['retrials', 'trials'],
  ])('%j does not count %s', (text, term) => {
    expect(franchiseHits(text, term)).toBe(0);
  });
});

describe('retired level names: case-sensitive; generic names only as a title', () => {
  it('the generic names are the riding-vocabulary curriculum names', () => {
    for (const n of ['Lean Back', 'See-Saw', 'Hop Up', 'Stairway', 'Uphill Weight', 'Rear Wheel First', 'First Ride', 'Kicker Row', 'Drum Roll']) expect(GENERIC_LEVEL_NAMES.has(n)).toBe(true);
    for (const n of ['The Stack', 'The Rolling Mill', 'Container Yard', 'Canyon Run']) expect(GENERIC_LEVEL_NAMES.has(n)).toBe(false);
  });

  it.each([
    // hints, tutorials and segment labels share the riding words: never a title
    ['Lean back if the nose drops', 'Lean Back'],
    ['"Lean back if the nose drops"', 'Lean Back'],
    ['hint("Lean Back to land the drop")', 'Lean Back'],
    ['LEAN BACK', 'Lean Back'],
    ['"LEAN BACK"', 'Lean Back'],
    ['the see-saw tips at its centre', 'See-Saw'],
    ['"Gap onto the see-saw"', 'See-Saw'],
    ['See-Saw ahead: slow down', 'See-Saw'],
    ['Stairway: hop each step', 'Stairway'],
    ['"hop up the ledge"', 'Hop Up'],
    ['first ride of the day', 'First Ride'],
    ['a drum roll plays', 'Drum Roll'],
    // distinctive names are title case: lower-case prose is not the name, nor a longer word
    ['Copy the stack trace', 'The Stack'],
    ['"the stack"', 'The Stack'],
    ['Snowline', 'Snow Line'],
    ['SNOWLINE', 'Snow Line'],
    ['The Stacks', 'The Stack'],
  ])('%j does not count %s', (text, name) => {
    expect(levelHits(text, name)).toBe(0);
  });

  it.each([
    // a title: the whole of a string literal, a JSON value or an HTML text node
    ['{name:"Lean Back",tier:"beginner"}', 'Lean Back', 1],
    ["course('b2-lean-back', 'Lean Back', 'beginner')", 'Lean Back', 1],
    ['<h2>See-Saw</h2>', 'See-Saw', 1],
    ['<b> Stairway </b>', 'Stairway', 1],
    ['`Hop Up`', 'Hop Up', 1],
    ['"name": "Rear Wheel First"', 'Rear Wheel First', 1],
    // distinctive names count anywhere, as authored or in capitals
    ['Next: The Stack', 'The Stack', 1],
    ['THE ROLLING MILL', 'The Rolling Mill', 1],
    ['"Container Yard"', 'Container Yard', 1],
    ['canyon: Canyon Run!', 'Canyon Run', 1],
    ['Flat 200m', 'Flat 200', 0],
  ])('%j counts %s ×%i', (text, name, n) => {
    expect(levelHits(text, name)).toBe(n);
  });
});

describe('auditText', () => {
  it('reports per term, a name that is a franchise term once, nothing for clean text', () => {
    expect(auditText('Trials Gauntlet: The Stack, "Lean Back"', ['The Stack', 'Lean Back', 'Gauntlet'])).toEqual({ trials: 1, gauntlet: 1, 'The Stack': 1, 'Lean Back': 1 });
    expect(auditText('ROCKHOP. Lean back if the nose drops. Licence: ARISING FROM', ['Lean Back'])).toEqual({});
  });
});
