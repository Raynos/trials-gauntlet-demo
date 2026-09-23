# Store answers: the forms, filled in

Answers for every compliance form in App Store Connect and the Play Console, following the plan's decisions:

- D1: free, no ads, no IAP, no data
- D2: individual / personal accounts
- D12: iPhone only
- D16/D17: `com.jakeverbaten.rockhop`, "Rockhop: Dirt Bike Physics"

The listing text lives in `metadata/` in fastlane layout, checked by `node scripts/store-metadata.mjs`. **Before each submission**, check every answer here against the build being submitted. It is the build that makes these answers true.

## Both stores

| field | answer |
|---|---|
| App / package ID | `com.jakeverbaten.rockhop` (permanent) |
| Name | Rockhop: Dirt Bike Physics |
| Category | Games › Racing (iOS secondary: Sports) |
| Price | Free. No in-app purchases, no ads, no subscriptions |
| Privacy policy URL | https://rockhop.vercel.app/legal/privacy.html |
| Support / marketing URL | https://rockhop.vercel.app/legal/support.html · https://rockhop.vercel.app/ |
| Support email | **HR: the user picks the address to publish** (it goes on the support page and the privacy policy; `scripts/store-site.mjs --email`) |
| Copyright | 2026 Jake Verbaten |
| Languages | English |

## App Store Connect

**App Privacy → Data collection:** "No, we do not collect data from this app." The label reads **Data Not Collected**.

- Why this is true: there are no analytics, crash reporters, ads SDKs or accounts, and the store build makes no network requests. The service worker, update probe, review inbox and run log are compiled out; `src/store-build.test.ts` proves it.
- Progress is kept on the device only (`@capacitor/preferences` → UserDefaults). Apple does not count data that never leaves the device.
- `ios/App/App/PrivacyInfo.xcprivacy` agrees: `NSPrivacyTracking` is false, there are no tracking domains and no collected data types. The required-reason APIs declared are UserDefaults `CA92.1` and file timestamps `C617.1`.

**Age rating questionnaire** (the 2025 questionnaire; expected result **4+**):

- Violence (cartoon/fantasy, realistic, prolonged/graphic): **None**. A rider falling off a bike is not violence. There is no blood, no injury shown and no weapons.
- Sexual content / nudity, profanity / crude humour, horror / fear themes: **None**.
- Alcohol, tobacco, drugs; mature / suggestive themes: **None**.
- Simulated gambling, real gambling, contests, loot boxes: **None / No**.
- Medical / treatment information: **None**.
- Unrestricted web access: **No** (the WebView loads only the bundled game).
- User-generated content, messaging / chat, social: **No**.
- Advertising: **No**. In-app purchases: **No**.
- Age assurance, parental controls: **No** (none needed; nothing is collected).

**Content rights:** "Does your app contain, show, or access third-party content?" → **No**.

- Everything is our own: the art is our AI generations, and the rider and bike are our Blender work.
- The music comes from ACE-Step 1.5, whose MIT weights and model card clear its output for commercial use (`assets/audio/LEDGER.md`). The sound effects are synthesised in code.
- The fonts are SIL OFL (licences ship with them).
- If a royalty-free library track is ever added, the answer becomes **Yes, and I have the rights**, with the licence recorded in the ledger.

**Export compliance:** `ITSAppUsesNonExemptEncryption = NO` is in `Info.plist`, so App Store Connect asks nothing per build. The app uses no encryption beyond what iOS itself provides (HTTPS is not even used).

**EU Digital Services Act trader status:** **Non-trader**. The app is free with no monetisation, from an individual who is not trading.

**Devices:** iPhone only (`TARGETED_DEVICE_FAMILY = 1`). iPad runs it in compatibility mode, so no iPad screenshots are needed.

**Screenshots:** 6.9" iPhone, landscape **2868 × 1320**, 3–10 images from played runs (`harness/native/screens.ts ios --final` → `screenshots/app-store-6.9/`). Apple scales these for the smaller iPhones.

**App Review notes** (paste as-is):

> Rockhop is an offline single-player game. There is no account, no sign-in, no network use, no data collection and nothing to purchase.
> Controls (landscape): the bottom touch strip is split in two. The left side leans the rider back and forward, and the right side is gas and brake. The top-right button restarts at the last checkpoint (hold it to restart the track), and the top-left button pauses.
> The first track teaches the controls. Every track is available from the world map as it unlocks. There is nothing to sign in to.

## Google Play Console

**Data safety:**

- "Does your app collect or share any of the required user data types?" → **No**.
- The store shows **No data collected · No data shared**.
- Encryption in transit and data deletion questions: not applicable, since nothing is collected.
- The only permission is `INTERNET`. Capacitor declares it and the WebView loader expects it. The game makes no request.

**Content rating (IARC questionnaire):**

- Category: Game.
- Violence, blood, sexuality, language, controlled substances, crude humour, fear: **No** to all.
- Gambling (real or simulated), loot boxes: **No**.
- Users interact or share content, shares location, digital purchases: **No**.
- Expected result: **Everyone / PEGI 3 / USK 0**.

**Target audience and content:**

- Age groups: **13–15, 16–17, 18+**. This deliberately leaves out the under-13 groups, which keeps the app out of the Families policy (plan Phase 6).
- "Could your store listing unintentionally appeal to children?" → No: it is a skill game with realistic art and no child-directed characters.

**Ads:** "Does your app contain ads?" → **No**.

**App access:** "All functionality is available without special access."

**Government app / financial features / health / news:** No.

**Graphics:**

| asset | spec | file |
|---|---|---|
| App icon | 512 × 512 PNG | `play/icon-512.png` |
| Feature graphic | 1024 × 500, no alpha | `play/feature-graphic-1024x500.png`, F1 cropped by `scripts/store-assets.mjs` |
| Phone screenshots | 16:9 at 1920 × 1080, 4–8 from played runs | `harness/native/screens.ts play --final` → `screenshots/play-phone/` |

**Release track sequence (D11):**

1. Internal testing: the user's own phone, the same day.
2. Closed testing: at least 12 testers opted in for 14 continuous days. This is required for personal accounts created after 2023-11-13.
3. Production application.

**Target API level:** 36 (Android 16). Play has required it for new apps and updates since 2026-08-31. See `android/variables.gradle`.

**App signing:** Play App Signing. The upload key lives only at `~/.config/rockhop/upload-keystore.jks` (HR-18: back it up).
