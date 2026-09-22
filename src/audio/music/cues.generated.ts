// Written by assets/audio/pipeline/publish.py — do not edit by hand.
import type { CueFile, MusicCue } from './cues';

export const CUE_FILES: Partial<Record<MusicCue, CueFile>> = {
  menu: { file: 'menu-c017aa05.m4a', loop: true, pre: 0.5, len: 71.111479, gainDb: 0, bpm: 108, bytes: 1458085 },
  map: { file: 'map-88c58de3.m4a', loop: true, pre: 0.5, len: 59.997854, gainDb: 0, bpm: 96, bytes: 1233707 },
  coast: { file: 'coast-4ec96bd3.m4a', loop: true, pre: 0.5, len: 60.954458, gainDb: 0, bpm: 126, bytes: 1253087 },
  alpine: { file: 'alpine-fa9271c0.m4a', loop: true, pre: 0.5, len: 49.655479, gainDb: 0, bpm: 116, bytes: 1024921 },
  quarry: { file: 'quarry-06f54be7.m4a', loop: true, pre: 0.5, len: 73.846292, gainDb: 0, bpm: 104, bytes: 1513210 },
  snowline: { file: 'snowline-9710fc81.m4a', loop: true, pre: 0.5, len: 60.945021, gainDb: 0, bpm: 126, bytes: 1252657 },
};
