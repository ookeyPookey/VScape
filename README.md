# VScape: Severed Floor

Quick multiplayer browser escape room inspired by office-thriller vibes.

## Run

1. `npm install`
2. `npm start`
3. Open `http://localhost:3000`

## Host for other devices on same Wi-Fi

1. Find your local IP (example `192.168.1.44`): `ipconfig getifaddr en0`
2. Share: `http://YOUR_IP:3000`
3. One player creates a session and shares the 6-character Game ID.

## Gameplay

- Players join with name + Game ID.
- Everyone sees shared progress in real time.
- Solve 4 stations to unlock the elevator and escape.
- 30-minute shared countdown timer.
- Progressive hints (up to 3 per puzzle).
- Host controls to skip a stuck puzzle if needed.
- Host start controls: Start Now, Auto-Start (15s), and full Reset Session.
- Per-puzzle timer warnings to keep teams on pace.
- Exploration gameplay: search station hotspots to reveal clue fragments before answers unlock.

## Deploy (Render, fastest)

This project needs a Node server, so GitHub Pages will not run the multiplayer game.

1. Go to [Render Dashboard](https://dashboard.render.com/) and click **New +** -> **Blueprint**.
2. Connect your `ookeyPookey/VScape` repo and deploy.
3. Render will detect `render.yaml` and set build/start automatically.
4. After deploy completes, share your `https://...onrender.com` URL.

Optional:

- Change timer length by setting `SESSION_MINUTES`.

## Deploy (Railway)

1. Go to [Railway](https://railway.app/) and click **New Project** -> **Deploy from GitHub repo**.
2. Select `ookeyPookey/VScape`.
3. Railway auto-runs `npm install` + `npm start`.
4. Add optional env var `SESSION_MINUTES=30`.
5. Share the generated Railway URL with players.
