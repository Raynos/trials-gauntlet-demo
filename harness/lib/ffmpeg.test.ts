import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveFfmpeg, resolveFfprobe } from './ffmpeg';

describe('ffmpeg resolution', () => {
  it('finds an ffmpeg binary', () => {
    const p = resolveFfmpeg();
    expect(fs.existsSync(p)).toBe(true);
  });
  it('finds ffprobe next to system ffmpeg', () => {
    const p = resolveFfprobe();
    expect(p).not.toBeNull();
  });
});
