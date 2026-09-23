# Rockhop release recipe: exact commands

Nothing in this recipe runs by itself.

- **User only:** anything that creates an account, uploads a build or presses *Submit* / *Release*.
- **Parent:** the website deploy.

The answers for every form are in `COMPLIANCE.md`, and the listing text is in `metadata/`. Run all commands from the repo root.

## 0. Version bump (every upload)

Each store refuses a build number it has already seen, so bump both platforms together.

| where | fields |
|---|---|
| `ios/App/App.xcodeproj/project.pbxproj` (Debug and Release) | `MARKETING_VERSION` (1.0 → 1.0.1 …) and `CURRENT_PROJECT_VERSION` (1 → 2 …) |
| `android/app/build.gradle` | `versionName` and `versionCode` (must strictly increase) |

## 1. Website: privacy + support on rockhop.vercel.app (parent)

The project must be **named before its first deploy**; see the global CLAUDE.md Vercel notes. Scope: `raynos-projects`.

```sh
vercel project add rockhop --scope raynos-projects                  # once: creates the named project
node scripts/store-site.mjs --email <support address>                # HR: the user picks the address; → store/build/site
cd store/build/site
vercel link --yes --project rockhop --scope raynos-projects          # once; .vercel/ survives rebuilds
vercel deploy --prod --yes --scope raynos-projects
cd -
curl -fsS https://rockhop.vercel.app/legal/privacy.html | grep -c 'Privacy Policy'   # 1
curl -fsS https://rockhop.vercel.app/legal/support.html | grep -c 'mailto:'          # ≥ 1
```

**If the project got a different domain** (`rockhop` was already taken): attach it with `POST /v10/projects/rockhop/domains` `{"name":"rockhop.vercel.app"}`, using the token in `~/Library/Application Support/com.vercel.cli/auth.json`. If Vercel refuses, put the domain it gave into both of these:

- `store/metadata/ios/en-US/{support,privacy,marketing}_url.txt`
- `COMPLIANCE.md`

Deployment protection only covers previews, so the production domain is public.

Phase 7 later moves the web game itself to this project (D10, the parent's call). When that happens, the game's deploy must keep serving `/legal/*`: copy `store/build/site/legal` and `site.css` into its output.

## 2. Android: signed App Bundle → Play internal testing (user)

The upload key is `~/.config/rockhop/upload-keystore.jks`, with its passwords in `keystore.properties` beside it (both chmod 600). HR-18: back that directory up. Its SHA-256 is:

`C3:61:7C:2E:AD:18:C9:47:62:63:7C:74:9F:EA:35:2C:19:04:4E:C8:ED:E2:E5:6F:B2:26:D2:C1:1A:25:1F:57`

```sh
node scripts/store-build.mjs release --android     # VITE_STORE=1 bundle, cap sync, gradlew bundleRelease
# → android/app/build/outputs/bundle/release/app-release.aab, signed with the upload key
/Users/raynos/Library/Java/JavaVirtualMachines/jdk-21.0.12.1+1/Contents/Home/bin/jarsigner -verify android/app/build/outputs/bundle/release/app-release.aab
```

Then in the Play Console, logged in as the user:

1. Create the app: name "Rockhop: Dirt Bike Physics", Game, Free.
2. Set up **Play App Signing**: let Google generate the app signing key. The file above is only the upload key.
3. Go to Testing → Internal testing → Create release, upload the `.aab`, add the user's Google account as a tester and roll it out.
4. Fill in App content from `COMPLIANCE.md` (Data safety, content rating, target audience, ads) and the store listing from `metadata/android/en-US/`.
5. Upload the graphics: `play/icon-512.png`, `play/feature-graphic-1024x500.png`, and the screenshots from `screenshots/play-phone/`.

The closed test (at least 12 testers for 14 continuous days, D11/D15) is the next track, on the same bundle.

**Once a Play service-account JSON exists** (Phase 6 credentials, stored outside the repo), later uploads can be scripted:

```sh
fastlane supply --aab android/app/build/outputs/bundle/release/app-release.aab --track internal \
  --json_key ~/.config/rockhop/play-service-account.json --package_name com.jakeverbaten.rockhop \
  --metadata_path store/metadata/android --skip_upload_images --skip_upload_screenshots
```

## 3. iOS: archive → TestFlight (user; needs the Apple Developer account, HR-16)

In App Store Connect:

1. Register the bundle ID `com.jakeverbaten.rockhop`.
2. Create the app "Rockhop: Dirt Bike Physics", iPhone only, primary language English (U.S.), SKU `rockhop`.
3. Find your Team ID under Membership. Then:

```sh
node scripts/store-build.mjs release --ios         # VITE_STORE=1 bundle, cap sync, Release build compile check
xcodebuild archive -project ios/App/App.xcodeproj -scheme App -configuration Release \
  -destination 'generic/platform=iOS' -archivePath store/build/Rockhop.xcarchive \
  DEVELOPMENT_TEAM=<TEAM_ID> CODE_SIGN_STYLE=Automatic -allowProvisioningUpdates
xcodebuild -exportArchive -archivePath store/build/Rockhop.xcarchive \
  -exportOptionsPlist store/app-store/ExportOptions.plist -exportPath store/build/ipa -allowProvisioningUpdates
# ExportOptions `destination = upload`: this uploads to App Store Connect with the Xcode-signed-in account.
# With an App Store Connect API key instead of an Xcode login, add:
#   -authenticationKeyPath ~/.config/rockhop/AuthKey_<KEY_ID>.p8 -authenticationKeyID <KEY_ID> -authenticationKeyIssuerID <ISSUER_ID>
```

After processing, the build appears in TestFlight. Add the user as an internal tester; internal builds need no review. Then, in App Store Connect, fill in these from `COMPLIANCE.md` (App Privacy, age rating, content rights, DSA) and `metadata/ios/en-US/`:

- the listing
- the screenshots from `screenshots/app-store-6.9/`
- the review notes

**Submit for Review is the user's click.**

**Once an API key exists**, the listing can be pushed from the repo:

```sh
fastlane deliver --api_key_path ~/.config/rockhop/asc-api-key.json --app_identifier com.jakeverbaten.rockhop \
  --metadata_path store/metadata/ios --skip_binary_upload --skip_screenshots --force
```

## 4. Checks before any upload

```sh
node scripts/store-metadata.mjs                    # listing lengths + denied terms
pnpm build:store && node scripts/ip-audit.mjs --strict dist ios android store   # bar 1 (strict from Phase 6)
node scripts/store-build.mjs debug --ios && npx tsx harness/native/gate.ts web,ios --evidence   # web leg on Metal: harness/native/README.md
```

The native gate has two rules:

- Run it only while `uptime` shows a load average under 12.
- The Android emulator stays off unless the user asks for it (harness/native/README.md).
