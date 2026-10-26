# Anime Music Quiz Setup Guide

## Requirements

* An account on [animemusicquiz.com](https://animemusicquiz.com)
* A userscript manager such as Tampermonkey or Violentmonkey
* `amq.apworld` installed in your Archipelago `custom_worlds` folder (needed by whoever generates the seed)

## Install the client

1. Install `client/amq_archipelago.user.js` from this project's repository in your userscript manager.
2. Open animemusicquiz.com and log in. An **AP** button appears in the bottom-right corner.
3. Click it and enter the server address (for example `archipelago.gg:38281`), your slot name and the password,
   then press Connect. Without `ws://` or `wss://` the client tries a secure connection first and falls back to an
   unencrypted one, which is what local servers need.

The client reconnects by itself if the connection drops, and keeps counting in the meantime: checks earned while
offline are sent once it is back. Progress, boosts and pending traps are saved on the Archipelago server, so you can
switch browsers without losing anything or getting traps twice. The panel's Backup section exports and imports
progress for when the server can't be reached at all.

## Playing

* Open the **Lobby settings** section of the panel. As the room host, press **Apply to room** (or type `/ap lobby` in
  chat) to set song types, vintage range, anime type, song difficulty, genres (as "optional"), guess time and
  sample point (when they are locked and the room's is not allowed) and, for `own_list`, song selection to match your
  unlocks. Only locked categories are changed. Anything it cannot set (for example two separate vintage ranges) is
  listed so you can set it by hand. Songs outside your unlocks still play but are ignored, and the client warns you
  in chat when most of a game's songs don't count.
* Type `/ap help` in AMQ's chat for the chat commands. `/ap !hint <item>` and other server commands work there.
  `/ap next` suggests what to play and `/ap lobby next` focuses the room on it.
* With `song_source: own_list` or `mixed`, link your anime list in AMQ and set the lobby's song selection to
  "watched" or a mix. The panel marks each song as "on list" or "off list".
* Play solo or with friends. Spectating does nothing.
* **Open checks** lists what is left, your progress, which stage still needs fragments and what each check holds.
* The panel shows each song's result, for example `Opening · 2010s · TV · Medium → counted` or
  `→ ignored (Ending locked)`.

## Generating

Generate a template with the Archipelago Launcher's "Generate Template Options", edit it and generate as usual.
The options page also has presets (Casual, Watched-only Strict, Sweaty, Short Async) to start from.
If your options produce more items than checks, `milestone_count` is raised automatically (a warning is logged).

## Tracking

[Universal Tracker](https://github.com/FarisTheAncient/Archipelago/releases) works with this world without your YAML:
connect it to your slot and it shows which checks are in logic.

## Troubleshooting

The client reads AMQ's in-page events. If nothing is counted after an update to the site, open the browser console
and inspect `AMQAP.state.lastPayload` (the last "answer results" event) and `AMQAP.extractSong(AMQAP.state.lastPayload)`.
All site-specific code lives in the "AMQ adapters" section at the top of the userscript.
