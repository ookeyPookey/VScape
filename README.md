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
