# Trials demo game (Trials Evolution inspired)

Build a 2.5D physics trials-bike game in **Three.js + TypeScript** strongly inspired
by the Trials Evolution game, but with the PS4 graphical quality of the latest
Trials Rising game. 
You ride a bike along a side-on obstacle course, balancing throttle, 
brake and rider weight over ramps, drums, planks and gaps — 
crashing constantly and instantly retrying. It should be utterly perfect, 
visually beautiful, with every single thing done at AAA quality, 
from textures to physics to sound to anything you can think of.

This is a one-shot brief. Nobody is watching. Make the calls yourself and keep
going.

## Scope

This repo and the internet only. Ignore everything else on this machine,
including earlier runs of this brief.

## The bar

Two halves, equal force.

**Feel.** The bike and the rider are separate masses. Weight-shift is a real
input with a real effect; a wheelie has a balance point you can hold and lose;
suspension compresses and rebounds; a landing is recoverable or not depending on
the angle you hit it at. Every obstacle has a technique that solves it, and the
player discovers it by failing.

**Tracks.** Hand-authored courses across escalating tiers — beginner through
extreme — each teaching one thing and then demanding it. A track is finished
when a stranger can clear it, and when the attempts it took are a number you
have measured and are happy with.

## How you work

- Fan out sub-agents and have each tackle one area individually so the game is
  utterly perfect. Favor teammates and sub-agents; avoid workflows. You stay at
  the big picture: integrate, check cohesion, judge.
- `/loop` on each item. Every iteration ends with a separate sub-agent checking
  it. That sub-agent is a really harsh critic; if it isn't triple-A, it keeps
  going.
- Always focus on broad perfection across all details. Never pigeonhole. When in
  doubt, zoom out. Work on the biggest, highest-impact levers for graphics,
  gameplay, fun factor and total cohesion. Never spend five rounds tweaking one
  tiny detail in one direction.
- `AGENTS.md` rules apply.

## How "done" is decided

Before writing game code, find and build a corpus of real Trials reference
material from the internet. To check quality, literally compare your game
against it side by side, blind: randomize the sides, hide the answer from the
critic, and have it say which one looks better, why, and what most makes the
game look non-AAA. Feed that back into the next loop. If an area stops
improving, change approach rather than polishing.

A still cannot see this game — a bike posed on a ramp looks right from the first
hour and will look the same in the last one. Compare in motion: clip against
clip, same obstacle, same manoeuvre.

Don't stop until you are absolutely wowed when compared with the actual Trials
game.

## Ground rules

- 60 fps, fast loads and bounded memory are MANDATORY at every stage — part of
  AAA, not polish.
- Deterministic physics: fixed timestep, no frame-rate coupling. Replays,
  ghosts and every measurement you make depend on it.
- This machine is headless only.
- Commit early and often.
- Look at your own work.

Keep this file as the brief.
