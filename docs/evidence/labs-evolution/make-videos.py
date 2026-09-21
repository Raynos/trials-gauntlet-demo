"""Actual recorded play comparisons. Uniform crop/scale; no synthesized motion."""
from pathlib import Path
import subprocess as sp
R=Path.cwd(); O=R/'harness/out/labs-evolution'; P=R/'harness/out/pose-motion-review'
def run(*args):sp.run([str(a) for a in args],check=True,stdout=sp.DEVNULL)
def header(file,text,w,h=56):run('magick','-size',f'{w}x{h}','xc:#101923','-font','/System/Library/Fonts/Supplemental/Arial.ttf','-fill','white','-pointsize','24','-gravity','center','-annotate','+0+0',text,file)
# Complete reference plays above complete local clears. Shorter side holds its final frame.
for name,ref,ours in [('container-step','05-a-license-obstacle-climb-wheelie','box-final'),('timber-launch','02-d-license-log-ramps-wheelie','ramp-final')]:
 header(O/f'{name}-top.png','TRIALS EVOLUTION — original gameplay',960)
 header(O/f'{name}-middle.png','OUR GAME — '+name.replace('-',' ').upper(),960)
 header(O/f'{name}-foot.png','Independent timelines / real speed / end frames held',960,48)
 filt='[0:v]fps=30,scale=960:540,setsar=1,setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration=8[a];[1:v]fps=30,scale=960:540,setsar=1,setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration=8[b];[2:v][a][3:v][b][4:v]vstack=inputs=5:shortest=1[out]'
 run('ffmpeg','-hide_banner','-loglevel','error','-y','-i',R/f'reference/evolution-gameplay/clips/{ref}.mp4','-i',O/ours/'clip.mp4','-loop','1','-i',O/f'{name}-top.png','-loop','1','-i',O/f'{name}-middle.png','-loop','1','-i',O/f'{name}-foot.png','-filter_complex',filt,'-map','[out]','-t','7' if name=='container-step' else '6.534','-an','-c:v','libx264','-crf','19','-pix_fmt','yuv420p','-movflags','+faststart',O/f'{name}-evolution-vs-ours.mp4')
 run('ffmpeg','-hide_banner','-loglevel','error','-y','-ss','2.6','-i',O/f'{name}-evolution-vs-ours.mp4','-frames:v','1',O/f'{name}-poster.jpg')
# Three versions share the exact same input at each instant.
for name,start in [('forward',0),('backward',2)]:
 for mode,mult in [('realtime',1),('slow',2)]:
  header(P/f'{name}-{mode}-three-top.png',f'BEFORE                 REJECTED FORWARD                 REVISED\n{name.upper()} — '+('REAL TIME' if mult==1 else 'HALF SPEED'),1200,72)
  header(P/f'{name}-{mode}-three-foot.png','Identical inputs: neutral 1s > hold lean 1s > release 1s',1200,48)
  f=';'.join(f'[{i}:v]trim=start={start}:duration=3,setpts=(PTS-STARTPTS)*{mult},crop=460:460:320:110,scale=400:400,setsar=1[v{i}]' for i in range(3))
  f+=';[v0][v1][v2]hstack=inputs=3[pair];[3:v][pair][4:v]vstack=inputs=3:shortest=1[out]'
  args=[]
  for folder in ['before','current','stand-revised']:args+=['-i',P/folder/'clip.mp4']
  run('ffmpeg','-hide_banner','-loglevel','error','-y',*args,'-loop','1','-i',P/f'{name}-{mode}-three-top.png','-loop','1','-i',P/f'{name}-{mode}-three-foot.png','-filter_complex',f,'-map','[out]','-t',3*mult,'-r','30','-an','-c:v','libx264','-crf','18','-pix_fmt','yuv420p',P/f'{name}-three-{mode}.mp4')
 concat=P/f'{name}-three.txt';concat.write_text(f"file '{name}-three-realtime.mp4'\nfile '{name}-three-slow.mp4'\n")
 run('ffmpeg','-hide_banner','-loglevel','error','-y','-f','concat','-safe','0','-i',concat,'-c','copy','-movflags','+faststart',P/f'{name}-three-versions.mp4')
 run('ffmpeg','-hide_banner','-loglevel','error','-y','-ss','1.8','-i',P/f'{name}-three-versions.mp4','-frames:v','1',P/f'{name}-three-poster.jpg')
