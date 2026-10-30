#!/bin/bash
FF=$(python3 -c "import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())")
SRC=/app/backend/scripts/raw_videos; OUT=/app/frontend/public/videos
for f in $SRC/*.mp4; do n=$(basename $f .mp4)
  $FF -loglevel error -y -i $f -vf scale=480:480 -c:v libx264 -crf 30 -preset veryfast -an -movflags +faststart $OUT/sm/$n.mp4
  $FF -loglevel error -y -i $f -vf scale=720:720 -c:v libx264 -crf 26 -preset veryfast -an -movflags +faststart $OUT/hd/$n.mp4
  $FF -loglevel error -y -i $f -vf scale=480:480 -c:v libvpx-vp9 -b:v 0 -crf 42 -deadline realtime -cpu-used 8 -an $OUT/sm/$n.webm
  $FF -loglevel error -y -i $f -vf scale=720:720 -c:v libvpx-vp9 -b:v 0 -crf 36 -deadline realtime -cpu-used 8 -an $OUT/hd/$n.webm
  echo done $n
done
echo ALLDONE
