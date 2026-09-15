#!/bin/bash
# Brand grep gate for the trailer: every frame's source (the built bundle, the track/render/audio/UI sources, the
# public art manifest names) must contain no real-world brand. Fictional set only (APEX / BOLT / VORTEX / NORDVIK ...).
#   harness/trailer/brand-gate.sh [export-root=.]
cd "${1:-.}" || exit 2
PAT='redlynx|ubisoft|red ?bull|monster energy|rockstar|\bktm\b|yamaha|honda|kawasaki|suzuki|husqvarna|\bgas ?gas\b|\bbeta\b bikes|gopro|fox racing|alpinestars|\bnike\b|adidas|coca.?cola|pepsi|\bshell\b oil|castrol|michelin|pirelli|bridgestone|dunlop|xbox|playstation|nintendo|trials fusion|trials evolution|trials rising|trials hd|monster jam|motul|\bnos\b energy|\bfmf\b|pro circuit|yoshimura|\bakrapovic|\bbell\b helmets|\barai\b|\bshoei\b|\boakley\b|\b100%\b goggles|\bmarlboro|\bcamel\b cig|lucky strike'
# Allowlist: the Credits panel's Thanks line names the games it learned the read-outs from (attribution, never in a
# captured frame). Anything else matching is a fail.
ALLOW='Thanks</dt><dd>Trials Evolution and Trials Rising for the read-outs'
hits() { grep -rIiEo --exclude=brand-gate.sh --exclude="*.md" "$PAT" "$@" 2>/dev/null; }
allowed() { grep -rIiEc --exclude=brand-gate.sh "$ALLOW" "$@" 2>/dev/null | awk -F: '{s+=$NF} END {print s+0}'; }
rc=0
echo "== bundle (dist/assets/*.js, index.html)"
n=$(hits dist/assets dist/index.html | grep -viE "trials (evolution|rising)" | sort | uniq -c); a=$(allowed dist/assets); [ -n "$n" ] && { echo "$n"; rc=1; } || echo "  clean (allowlisted credits Thanks line: $a)"
echo "== sources (src/tracks src/render src/audio src/ui src/game public/art/**/manifest*)"
n=$(hits src/tracks src/render src/audio src/ui src/game | grep -v "src/ui/front.ts:Trials \(Evolution\|Rising\)" | sort | uniq -c); [ -n "$n" ] && { echo "$n"; rc=1; } || echo "  clean (allowlisted credits Thanks line in src/ui/front.ts)"
echo "== art file names (public/art)"
n=$(find public/art -type f 2>/dev/null | grep -iE "$PAT" | head); [ -n "$n" ] && { echo "$n"; rc=1; } || echo "  clean"
echo "== trailer scripts + cards (harness/trailer)"
n=$(hits harness/trailer | sort | uniq -c); [ -n "$n" ] && { echo "$n"; rc=1; } || echo "  clean"
[ $rc = 0 ] && echo "BRAND GATE: PASS" || echo "BRAND GATE: FAIL"
exit $rc
