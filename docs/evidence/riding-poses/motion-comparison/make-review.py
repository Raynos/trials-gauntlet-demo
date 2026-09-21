"""Assemble actual recorded motion; no interpolation or pose edits."""
import subprocess as sp
from pathlib import Path
ROOT = Path.cwd()
OUT = ROOT / 'harness/out/pose-motion-review'
FONT = '/System/Library/Fonts/Supplemental/Arial.ttf'
def run(*args):
    sp.run([str(a) for a in args], check=True, stdout=sp.DEVNULL)
def label(path, text, width=1040, height=76, size=24):
    run('magick', '-size', f'{width}x{height}', 'xc:#101923', '-font', FONT, '-fill', 'white', '-pointsize', size, '-gravity', 'center', '-annotate', '+0+0', text, path)
def make(name, start, duration, description, speed=1):
    top = OUT / f'{name}-header.png'
    bottom = OUT / f'{name}-footer.png'
    label(top, f'BEFORE                                      CURRENT\n{description} | '+('REAL TIME' if speed==1 else 'HALF SPEED'))
    label(bottom, 'Identical controls / Rookie / Street mustard / High / 1280 x 720\nNeutral 1s > hold lean 1s > release 1s (game time)', height=64, size=20)
    filt = ';'.join([f'[{i}:v]trim=start={start}:duration={duration},setpts=(PTS-STARTPTS)*{1/speed},crop=460:460:320:110,scale=520:520,setsar=1[v{i}]' for i in (0,1)])
    filt += ';[v0][v1]hstack=inputs=2[pair];[2:v][pair][3:v]vstack=inputs=3:shortest=1[out]'
    run('ffmpeg','-hide_banner','-loglevel','error','-y','-i',OUT/'before/clip.mp4','-i',OUT/'current/clip.mp4','-loop','1','-i',top,'-loop','1','-i',bottom,'-filter_complex',filt,'-map','[out]','-t',str(duration/speed),'-r','30','-an','-c:v','libx264','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',OUT/f'{name}.mp4')
for name,start,desc in [('forward',0,'NEUTRAL > FORWARD > RELEASE'),('backward',2,'NEUTRAL > BACKWARD > RELEASE')]:
    make(name+'-realtime',start,3,desc)
    make(name+'-slow',start,3,desc,.5)
    concat = OUT/f'{name}-concat.txt'
    concat.write_text(f"file '{name}-realtime.mp4'\nfile '{name}-slow.mp4'\n")
    run('ffmpeg','-hide_banner','-loglevel','error','-y','-f','concat','-safe','0','-i',concat,'-c','copy','-movflags','+faststart',OUT/f'{name}-before-after.mp4')
    run('ffmpeg','-hide_banner','-loglevel','error','-y','-ss','1.8','-i',OUT/f'{name}-realtime.mp4','-frames:v','1',OUT/f'{name}-poster.jpg')
# Whole sequence stays available, without cuts or time scaling.
run('ffmpeg','-hide_banner','-loglevel','error','-y','-i',OUT/'before/clip.mp4','-i',OUT/'current/clip.mp4','-filter_complex','[0:v]crop=460:460:320:110,scale=520:520[a];[1:v]crop=460:460:320:110,scale=520:520[b];[a][b]hstack[out]','-map','[out]','-an','-c:v','libx264','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',OUT/'full-sequence-before-after.mp4')
