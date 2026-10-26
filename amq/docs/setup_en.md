# Anime Music Quiz Setup Guide

## Requirements

* An account on [animemusicquiz.com](https://animemusicquiz.com)
* A userscript manager such as Tampermonkey or Violentmonkey
* The `anime_music_quiz.apworld` file in your Archipelago install (host/generator only)

## Install the client

1. Install `client/amq_archipelago.user.js` from this project's repository in your userscript manager.
2. Open animemusicquiz.com and log in. An **AP** button appears in the corner.
3. Click it, enter server address (for example `archipelago.gg:38281`), slot name and password, then Connect.

## Playing

* Start any game (solo lobby, or a room with friends). Answer as usual.
* Only songs that match your unlocks count. Set the lobby filters (song types, vintage, genres, anime type,
  guess rate) to what you have unlocked to avoid wasted rounds.
* The panel shows your unlocks, progress and active traps.

## Generating

Run the Archipelago Launcher "Generate Template Options" to get a YAML template, then edit it as usual.
