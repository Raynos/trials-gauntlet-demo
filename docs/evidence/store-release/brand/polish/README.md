# UI polish (store release, after D17–D23)

Headless, silent captures (`navigator.webdriver`: no AudioContext) of a `git archive` build, never the shared
working tree: Chromium on Metal and WebKit at 932×430 and 844×390 (DPR 2, touch) and 1280×720 (DPR 1). The rides are played:
the clear holds full gas to the line on Low Tide, the bailed run loops out three times on gas + lean back first.

    TRIALS_BROWSER_BACKEND=metal pnpm exec tsx assets/brand/tools/polish-capture.mts --dist <dist> --out <dir> [--shots map,…] [--audit]

`before/` is 45bf4219 (every screen). `after/` holds the screens each round changed. `*-audit.json` lists every drawn,
pointer-taking button on a screen with the 34 px iPhone side insets forced on: `bad` is empty when each is ≥ 44 px both ways
and clear of both side strips.

## Round 1: the world map

- The zone names are painted on two lines (W-worldmap). The opening camera slides until the current zone's name clears
  the view edges, the side insets and the brand plate, as far as the focused marker allows. COASTAL SCRAPYARD was cut
  at the left edge on open. The coast frame also rose 40 map units, so the forest's name and sign stand inside a 390 px phone.
- A locked zone states its rule once, on a wooden sign under its name. The gate zone's sign also names the next unlock.
  Locked markers keep only the padlock. The rule is still in each marker's label, on the card and on the RIDE pill.
- The card picks the first of right-down, right-up, left-down and left-up that stays in the view and off the chrome.
  None clear, it takes the one that covers least. At 844×390 it sat on the progress chip.
- A marker in a side safe area is shaded and takes no pointer. A zone name under the badge or ‹ MENU fades back.
- The progress chip is W-worldmap's: the count, a rule, then each medal badge with its number.
- The forest FREE RIDE flag hangs its plate left, off the forest's name.
