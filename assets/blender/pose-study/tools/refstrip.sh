#!/bin/bash
# refstrip.sh <clip.mp4> <start_s> <dur_s> <fps> <cropW:cropH:x:y> <out.jpg> [everyN]
# extracts frames, crops, tiles every Nth frame into one row (360 px cells)
set -e
FF=/opt/homebrew/bin/ffmpeg
clip=$1; ss=$2; dur=$3; fps=$4; crop=$5; out=$6; every=${7:-1}
tmp=$(mktemp -d)
$FF -loglevel error -y -ss $ss -i "$clip" -t $dur -vf "fps=$fps,crop=$crop,scale=360:360" $tmp/f-%02d.png
files=$(ls $tmp/f-*.png | awk -v n=$every 'NR%n==1 || n==1')
n=$(echo "$files" | wc -l | tr -d ' ')
args=(); for f in $files; do args+=(-i $f); done
$FF -loglevel error -y "${args[@]}" -filter_complex "hstack=inputs=$n" -q:v 3 "$out"
echo "$out $n frames from $clip @ $ss+$dur s, crop $crop"
rm -f $tmp/f-*.png; rmdir $tmp
