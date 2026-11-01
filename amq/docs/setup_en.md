# Anime Music Quiz Setup Guide

## Requirements

* An account on [animemusicquiz.com](https://animemusicquiz.com)
* A userscript manager such as Tampermonkey or Violentmonkey
* `amq.apworld` from the [latest release](https://github.com/niklaskodev/amq-apworld/releases/latest), installed in
  your Archipelago `custom_worlds` folder (needed by whoever generates the seed)

## Install the client

1. With your userscript manager installed, open
   [`amq_archipelago.user.js` from the latest release](https://github.com/niklaskodev/amq-apworld/releases/latest/download/amq_archipelago.user.js)
   and confirm the install. Your userscript manager checks that address for updates from then on.
2. Open animemusicquiz.com and log in. An **AP** button appears in the bottom-right corner. Its dot turns green
   while you are connected and yellow while connecting or offline.
3. Click it and enter the server address (for example `archipelago.gg:38281`), your slot name and the password,
   then press Connect (or Enter). Without `ws://` or `wss://` the client tries the encrypted `wss://` first and then `ws://`.
   Browsers allow `ws://` from AMQ only to a server on your own computer; see
   [Servers without wss://](#servers-without-wss) for the others.

The client reconnects by itself if the connection drops, and keeps counting in the meantime: checks earned while
offline are sent once it is back. Progress, boosts and pending traps are saved on the Archipelago server, so you can
switch browsers without losing anything or getting traps twice. The panel's Backup section exports and imports
progress for when the server can't be reached at all.

## Servers without wss://

AMQ is an https page, and browsers let https pages use unencrypted `ws://` only with a server on the same computer.
Rooms on archipelago.gg support `wss://` and work as they are. A server elsewhere that only speaks `ws://` (the
Archipelago MultiServer does unless it is given a certificate) fails with "your browser blocked ws://...". Either:

* **allow it in each player's browser**, once, then reload AMQ:
  * Chrome, Brave, Opera: on animemusicquiz.com, click the icon left of the address bar, open **Site settings** and
    set **Insecure content** to **Allow**. Edge calls it **Permissions for this site**. This only affects AMQ.
  * Firefox: open `about:config` and set `network.websocket.allowInsecureFromHTTPS` to `true`. This affects every
    site.
  * Safari has no such setting and needs a `wss://` server.
* **or encrypt the server**: start MultiServer with `--cert` and `--cert_key` pointing at a certificate for the
  server's domain that browsers trust (for example one from Let's Encrypt), or put a TLS reverse proxy such as Caddy
  in front of it. Players then connect with `wss://`. A self-signed certificate only works in browsers that were told
  to trust it.

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
