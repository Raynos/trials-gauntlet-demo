"""Archive a completed stranger, without reading any active session.

Usage: python3 <this-file> <completed-session-directory> <agent-path> <briefing-extra-line>
Run verify.mts separately against the archived recording; parent judges acceptance.
"""
import hashlib
import json
from pathlib import Path
import shutil
import sys

root = Path(__file__).resolve().parents[4]
out = Path(__file__).resolve().parent
source = root / sys.argv[1]
session = json.loads((source / "session.json").read_text())
state = json.loads((source / "state.json").read_text())
target = out / session["sessionId"]
target.mkdir(exist_ok=True)
for name in ("session.json", "state.json", "log.txt"):
    shutil.copyfile(source / name, target / name)
if (source / "attempts").exists():
    shutil.copytree(source / "attempts", target / "attempts", dirs_exist_ok=True)
shutil.copyfile(root / session["recordingFile"], target / "recording.json")
protocol = (out / "PROTOCOL.md").read_text()
prompt = protocol + "\n" + sys.argv[3] + "\n"
(target / "prompt.md").write_text(prompt)
events = state["events"]
latencies = []
for i, event in enumerate(events):
    if event["event"]["type"] != "fault":
        continue
    respawn = next((x for x in events[i + 1:] if x["event"]["type"] == "restart"), None)
    if respawn:
        ticks = respawn["runTick"] - event["runTick"]
        latencies.append({"faultTick": event["runTick"], "reason": event["event"].get("reason"), "respawnTick": respawn["runTick"], "ticks": ticks, "seconds": ticks / state["physicsHz"]})
provenance = {
    "agentPath": sys.argv[2], "forkTurns": "none",
    "briefing": "PROTOCOL.md verbatim plus one track/session/agent naming line",
    "protocolSha256": hashlib.sha256(protocol.encode()).hexdigest(),
    "sourceFingerprint": session["srcFingerprint"],
    "recordingSha256": hashlib.sha256((target / "recording.json").read_bytes()).hexdigest(),
    "coordinatorObservedCallsDuringPlay": False,
    "coordinatorProvidedAdvice": False,
    "faultToRespawn": latencies,
    "restartMetricLimit": "Simulation ticks only; not browser input-to-visible-ready wall latency.",
    "source": str(source.relative_to(root)),
}
(target / "provenance.json").write_text(json.dumps(provenance, indent=2) + "\n")
print(json.dumps({k: session.get(k) for k in ("sessionId", "trackId", "agent", "seed", "bike", "srcFingerprint", "cleared", "strangerAttempts", "finishTime", "calls", "budget", "forcedResets", "attemptsBand")}))
print(json.dumps({"faultToRespawn": latencies}))
