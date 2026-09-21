# Native third-party distribution record

The bundled, offline-readable notice is [`public/native-notices.txt`](../../public/native-notices.txt). It inventories the installed runtime npm packages and the resolved iOS/Android runtime libraries. Individual component terms remain distinct; this record does not declare the entire game MIT, Apache, MPL, or cleared for commercial distribution.

## Reproduce and package

Run `node scripts/native-notices.mjs` to regenerate the text from installed pinned npm packages and [`third-party-sources.json`](third-party-sources.json), then `node scripts/native-notices.mjs --check` to verify it. The ordinary generation/check performs no network requests and requires no Gradle or Xcode cache. It is deterministic: no timestamps or machine-specific paths enter the artifact. Identical complete license/notice bodies share a SHA-256-derived text ID and list every attributed component; unique upstream text is preserved in full.

The native build should run `--check` before bundling and ship the text as `dist-native/native-notices.txt` through Vite's public-directory copy. Credits should expose an expandable **Third-party notices** viewer that reads `./native-notices.txt` inside the current app, including offline; a native external-browser navigation is unnecessary. Changes to npm versions automatically change generated output; the updater source pointer has an explicit version guard. Changes to native Gradle inputs or the resolved Swift pins require a native refresh instead of silently reusing stale notices.

Refresh after native dependencies change:

1. Install the pinned JS dependencies and resolve/build both native projects using the documented native toolchain. Native dependency resolution alone is sufficient; no store credentials are needed.
2. From `android`, run `./gradlew --no-daemon :app:dependencies --configuration releaseRuntimeClasspath > ../.native-build/android-release-dependencies.txt`. Use the same Java/SDK environment as `scripts/native-android.sh`.
3. Ensure Swift checkouts exist under `.native-build/ios/SourcePackages/checkouts` and the checked-in `ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved` describes that build.
4. Run `node scripts/native-notices.mjs --refresh-native`. This explicitly reads the resolved Maven POMs, inherited POM licenses, AAR/JAR notice files (including nested `classes.jar`), Swift checkout licenses, and supplemental official license sources. It refreshes the captured JSON and generated text together.
5. Review dependency changes and source/license links, run `--check`, then rebuild/sync native assets so the delivered binary contains the new notice. Re-run the release dependency report after resolution even when Gradle inputs have not changed: transitive version ranges can resolve differently without an input-file change.

The snapshot intentionally contains license text and dependency metadata, never Gradle caches, credentials, signing material, or developer settings. It records 74 Android binary artifacts and excludes 13 resolved metadata-only coordinates (BOMs and multiplatform redirect modules); their selected JVM/Android binaries are listed separately. Google Play AARs supply three distinct, approximately 0.73–0.77 MB aggregate LICENSE bodies. They are not byte-identical, so all are retained. The uncompressed notice is about 2.32 MB, loaded only when requested; archive compression handles their repeated text.

## Runtime scope

| Component | Installed/resolved version | Recorded terms and source |
| --- | --- | --- |
| three.js | 0.186.0 | MIT; installed `LICENSE` |
| Meshopt decoder embedded in three.js | 1.1 | MIT; Arseny Kapoulkine copyright in the shipped decoder header; full MIT text from the installed meshoptimizer package |
| Capacitor core / Android / iOS | 8.5.2 | MIT; installed license files; bundled Cordova compatibility code retains Apache 2.0 headers |
| Capacitor App | 8.1.1 | MIT |
| Capacitor Filesystem | 8.1.3 | MIT |
| Capacitor Synapse | 1.0.4 | Package metadata declares ISC; supplied LICENSE contains MIT wording and is retained verbatim apart from line-end whitespace; runtime dependency of Filesystem |
| tslib | 2.8.1 | 0BSD; declared runtime dependency of Capacitor core, conservatively included even where bundling removes unused helpers |
| Capgo Capacitor Updater | 8.51.20 | MPL 2.0; installed complete license and pinned source availability notice |
| Alamofire | 5.12.2 | MIT; resolved Swift checkout license |
| capacitor-swift-pm | 8.5.2 | MIT; resolved Swift checkout license; includes Capacitor/Cordova products |
| ion-ios-filesystem | 1.1.4 | MIT; resolved Swift checkout license |
| Version | 0.8.0 | MIT; resolved Swift checkout license |
| ZIPFoundation | 0.9.20 | MIT; resolved Swift checkout license |
| Android runtime graph | 74 binary coordinates | Each selected version, POM license/source URL, and supplied archive notice is in the generated text and captured JSON |

The Android graph includes AndroidX, Kotlin/coroutines/serialization, Cordova, OkHttp/Okio, Brotli, versioncompare, Guava's ListenableFuture, and Ionic's filesystem library. The Brotli 0.1.2 source attribution is preserved from its matching Maven source JAR. OkHttp's public-suffix data notice remains included, alongside the MPL text already present for the updater.

Google Play Core (`app-update`, `app-update-ktx`, `core-common`) declares [Play Core SDK terms](https://developer.android.com/guide/playcore/license). Google Play services (`play-services-basement`, `play-services-tasks`) declares the [Android SDK license](https://developer.android.com/studio/terms.html). These are not relabelled as open-source Apache/MIT components. They are present because the updater compiles native in-app-update support, even when this game's configured update flow does not invoke it.

Excluded from runtime npm sections: Vite, TypeScript, ESLint, Vitest, Playwright, agent-browser, Capacitor CLI, test/type packages, and other development tools. `@vercel/blob` belongs to the hosted review API and is not imported into the native game. The meshoptimizer npm package is development tooling; only the decoder actually embedded in three.js is attributed as shipped runtime code. Test-scoped Gradle dependencies are excluded by selecting `releaseRuntimeClasspath`.

## MPL updater source availability

The installed updater native implementation is unmodified. The shipped notice points to the exact 8.51.20 upstream source commit, verified against its Git tag: [`189d2e28083af4b848b2dace85ed13e36c29e3b4`](https://github.com/Cap-go/capacitor-updater/tree/189d2e28083af4b848b2dace85ed13e36c29e3b4), with a direct corresponding source archive link and the complete MPL 2.0 license text. Application code calls its public plugin API.

A future distributor modifying covered updater files must provide the corresponding modified covered source under MPL 2.0 and update that source pointer; the current upstream link must not be reused to describe local modifications. This record does not apply MPL to unrelated game files or assert that an upstream source link discharges obligations for a modified fork.

## Existing game assets

The notice preserves the current Credits attributions and original provenance; it does not assign new licenses to assets:

- Barlow Condensed: the existing bundled font notice plus the complete upstream SIL OFL 1.1 text.
- Blender Human Base Meshes 1.4.1 (Dan Ulrich / Blender Studio), MakeHuman/MPFB generated assets and selected skin: recorded CC0 asset terms; tool/code licenses are separate.
- Poly Haven Cotton Jersey and Denim Fabric 03: colormass photography, Rico Cilliers processing, CC0; baked derivative use and source hashes remain in [R9 third-party provenance](../evidence/hero-r9-inputs/THIRD-PARTY.md).
- Daniel Bystedt's Hair Styles demo: CC BY-SA, with the version unspecified in the retained source evidence; the derivative curl shell attribution and share-alike scope are retained.
- grinsegold beard/moustache: official bodyparts06 pack says CC-BY, embedded MHCLO headers say AGPL3. The project's earlier human decision accepted shipping on the pack's CC-BY reading (ask 46 / plan-index decision); this notice preserves both pieces of evidence and does not rewrite that conflict as unambiguous clearance.
- Lee Perry-Smith's *Infinite, 3D Head Scan*: the preserved CC BY 3.0 attribution and source notice.
- Generated key art and repository-authored/procedural assets: existing provenance is retained; no third-party asset license is invented.

See [hero delivery provenance](../evidence/hero-art/delivery/ART_HANDOFF.md#source-terms-and-attribution) and [R9 provenance](../evidence/hero-r9-inputs/THIRD-PARTY.md) for the precise asset scope. The notice alone does not resolve the unspecified hair-license version or substitute for any required derivative source/share-alike delivery.

Generated notice bodies normalize trailing line whitespace; wording and paragraph indentation remain intact. Package metadata licence declarations and the actual supplied licence texts are both retained.
