# UI polish (store release, after D17–D23)

Headless, silent captures (`navigator.webdriver`: no AudioContext) of a `git archive` build, never the shared
working tree: Chromium on Metal and WebKit at 932×430 and 844×390 (DPR 2, touch) and 1280×720 (DPR 1). The rides are played:
the clear holds full gas to the line on Low Tide, the bailed run loops out three times on gas + lean back first.

    TRIALS_BROWSER_BACKEND=metal pnpm exec tsx assets/brand/tools/polish-capture.mts --dist <dist> --out <dir> [--shots map,…] [--audit]

`before/` is 45bf4219 (every screen). `after/` is every screen after round 2. `compare-webkit-844x390.jpg` and
`compare-chromium-1280x720.jpg` put before (left) and after (right) side by side, one row per screen. `*-audit.json` lists every drawn,
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

## Round 2: every other screen in the ROCKHOP language

- **Map follow-ups (parent's review of 63ff07f4).** The focused marker's beam moved to its own layer under every
  marker, so no name plate is drawn behind it. Each plate hangs up-right, up-left, down-right or down-left, whichever
  meets the fewest diamonds, the beam, the ring and bike, the card, the chrome, zone names and plates already placed.
  "Harbour Yard" stayed under the focused C2. The card now avoids the other markers' targets. It shades a marker only
  when it covers the diamond itself: C3 had faded out.
- **Settings.** The page has the kicker with the survey marker (a vermilion triangle over its dot) and SETTINGS in
  cream display. Every row sits on one cream contour card with hairline rules between rows. The focused row carries the
  vermilion marker. Choices are teal segments, levels are vermilion bars, and RESET is a vermilion outline that fills
  when armed. Every row, the Music slider and the dev-only rows are unchanged, and so are their 44 px targets.
- **Garage.** The 3D bay is unchanged. The header is the cream wordmark with GARAGE in display type. The rail tags
  are cream contour cards. The chosen tag is teal and carries the survey dot. The bike sheet is a cream card with a
  vermilion marker, vermilion bars and a dashed teal rule. The build stamp shows on web builds only.
- **Results ticket against A-results.** The left edge is a perforated stamp edge, with two half-round ticket bites
  at the medal rule. The paper has a survey patch of dark contour lines under a larger route glyph. The medals are
  A-results' size and in colour, and the earned one stands in a gold laurel wreath. A run with bails no longer says
  CLEAN LINE: the ticket stamp and the finish call-out read CLEARED, and the bail count turns vermilion.
- **Pause.** The scrim is teal ink and the action cards are the home screen's cream cards, with the focused card in
  vermilion. The kicker is a tag, as on A-brand § 06: teal PAUSED, vermilion BAILED. It names the zone and code
  (COASTAL SCRAPYARD / C1), not the tier.
- **Credits.** The settings head sits over the finish plate, with the roll on a cream contour card.
- **Loading, error, first ride, update pill, rotate prompt.** The loader's odometer windows were black glass with
  italic white digits. They are now cream paper with teal digits. Its green check marks are now cream, and DETAILS is
  a 44 px pill (it was 28 px). The crash sheet was charcoal with an amber button. It is now the cream card with a
  vermilion tag, a teal heading, a teal-ink stack box and a vermilion RELOAD. The first-ride card and the update pill
  (slanted charcoal with an amber edge) are now cream and deep teal. The offline page was already on brand.
- Every tap target on the map, garage, settings, pause and both result tickets passes the 44 px and 34 px-inset
  audit in both engines at all three sizes (`after/*-audit.json`).
