"""ROCKHOP cue prompts → an ACE-Step job list (store release Phase 4, LEDGER.md).

    python3 assets/audio/pipeline/jobs.py > jobs.json

Rules the prompts keep: instrumental only; the brand's mood (sunny expedition / survey kit, confident,
playful, outdoor — not dark neon, not metal); never an artist, a game, a soundtrack or a franchise.
Two prompt variants per cue × SEEDS seeds = the candidates. Keys sit around D (the stinger family's key)
so the results sting resolves into the menu theme.
"""
import json
import sys

SEEDS = [11, 23, 47]

CUES = {
    "menu": dict(bpm=108, key="D major", duration=100, variants=[
        "sunny upbeat instrumental adventure theme, bright acoustic and clean electric guitars, punchy live drums, "
        "handclaps, warm bass, glockenspiel and marimba melody, confident and playful, outdoor expedition, major key",
        "cheerful instrumental indie rock theme, jangly clean guitars, bouncy bass, tight live drums, bright marimba lead "
        "melody, optimistic sunlit outdoor adventure, playful and confident, major key",
    ]),
    "map": dict(bpm=96, key="G major", duration=84, variants=[
        "light exploratory instrumental, plucked acoustic guitar, marimba, soft shaker, warm upright bass, gentle brushed "
        "drums, curious and sunny, planning a summer expedition, major key",
        "laid-back instrumental travel groove, fingerpicked acoustic guitar, ukulele, glockenspiel accents, soft kick and "
        "shaker, warm and inviting, relaxed but curious, outdoor adventure, major key",
    ]),
    "coast": dict(bpm=126, key="E major", duration=100, variants=[
        "bright energetic instrumental surf rock, twangy reverb guitar, driving tom-heavy drums, handclaps, bouncy bass, "
        "salty seaside energy, sunny and rhythmic, major key",
        "upbeat instrumental beach rock, clean jangly guitars, steel drum accents, found-metal percussion hits, punchy "
        "snare, tambourine, busy bassline, sunny coastal scrapyard, rhythmic and playful",
    ]),
    "alpine": dict(bpm=116, key="A major", duration=100, variants=[
        "warm driving instrumental folk rock, strummed acoustic guitars, banjo, stomp and clap percussion, upright bass, "
        "fiddle melody, forest trail energy, uplifting and confident",
        "instrumental acoustic driving groove, fast strummed acoustic guitar, mandolin, kick drum and tambourine, warm "
        "cello bass line, sunny mountain forest trail, energetic and hopeful",
    ]),
    "quarry": dict(bpm=104, key="E minor", duration=100, variants=[
        "dusty desert rock instrumental, tremolo baritone guitar, big floor toms, shakers and frame drum, deep groove, "
        "sun-baked heat haze, percussive and confident",
        "instrumental desert groove, twangy slide guitar, hand percussion, djembe and cajon, rolling bass, dry dusty "
        "heat, rhythmic and driving, bright midday sun",
    ]),
    "snowline": dict(bpm=144, key="B minor", duration=100, variants=[
        "fast tense instrumental, crisp driving breakbeat, icy plucked synth arpeggios, glassy bells, pulsing bass, cold "
        "mountain air, urgent but bright, high energy",
        "fast crisp instrumental, pizzicato strings ostinato, tight snare rolls, glockenspiel, driving bass, cold clear "
        "winter morning on the ridge, tense and exciting",
    ]),
    "results": dict(bpm=120, key="D major", duration=12, variants=[
        "short triumphant instrumental fanfare, bright brass stabs and electric guitar flourish, snare roll into a big "
        "major chord, celebratory, ends on a ringing final chord",
        "short victorious instrumental jingle, bright horns and glockenspiel, quick drum fill, uplifting major key "
        "ending chord that rings out, celebratory and playful",
    ]),
}


def jobs(seeds=SEEDS):
    out = []
    for cue, c in CUES.items():
        for vi, caption in enumerate(c["variants"]):
            for seed in seeds:
                out.append(dict(cue=cue, id=f"{cue}-{'ab'[vi]}", caption=caption, bpm=c["bpm"], key=c["key"],
                                timesig="4", duration=c["duration"], seed=seed))
    return out


if __name__ == "__main__":
    only = sys.argv[1:]
    js = [j for j in jobs() if not only or j["cue"] in only]
    json.dump(js, sys.stdout, indent=1)
