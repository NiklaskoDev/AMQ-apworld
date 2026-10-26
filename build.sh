#!/bin/sh
set -e
cd "$(dirname "$0")"
rm -f anime_music_quiz.apworld
zip -qr anime_music_quiz.apworld amq -x '*/__pycache__/*' '*/test/*'
echo built anime_music_quiz.apworld
