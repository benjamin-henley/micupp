# VoiceQueue — Valorant Voice Matchmaking

Find random Valorant teammates via voice chat. Talk, vibe check, queue together.

---

## Setup (5 minutes)

### 1. Install backend dependencies
```bash
npm install
```

### 2. Start the server
```bash
node server.js
# Server runs on http://localhost:3001
```

### 3. Open the frontend
Just open `index.html` in your browser directly (double-click it).

> For local testing with two people, both need to be on the same network,
> or you need to deploy the server (see Deployment below).

---

## How it works

1. User enters Valorant username, rank, role, region
2. Browser requests microphone permission
3. Socket.io connects to server and joins the matchmaking queue
4. Server matches two players in the same region (falls back to any region)
5. Both get a room ID — WebRTC peer connection is established directly between browsers
6. Audio flows peer-to-peer (doesn't go through your server = free)
7. Either player hits **QUEUE** or **SKIP**
8. If both hit QUEUE → both see each other's username to add in-game
9. If either skips → both re-enter the queue automatically

---

## File Structure

```
voicequeue/
├── server.js      ← Node.js backend (Express + Socket.io)
├── index.html     ← Frontend (single file, no build step needed)
├── package.json   ← Backend dependencies
└── README.md
```

---

## Deployment (free)

### Backend → Railway
1. Push to GitHub
2. Go to railway.app → New Project → Deploy from GitHub
3. It auto-detects Node.js and runs `npm start`
4. Copy the Railway URL (e.g. `https://voicequeue-production.up.railway.app`)

### Frontend → Vercel or Netlify
1. Update `SERVER_URL` in `index.html` to your Railway URL
2. Deploy the `index.html` to Vercel/Netlify (drag and drop)

### TURN server (for ~15% of users behind strict firewalls)
Sign up free at metered.ca, get TURN credentials, add to `ICE_SERVERS` in index.html:
```js
{ urls: "turn:your-turn-server.metered.live:80", username: "...", credential: "..." }
```

---

## Socket Events Reference

| Event | Direction | Description |
|-------|-----------|-------------|
| `join_queue` | client→server | Player joins matchmaking |
| `waiting` | server→client | No match yet, in queue |
| `match_found` | server→client | Match ready, room created |
| `webrtc_offer` | relayed | WebRTC offer (initiator→peer) |
| `webrtc_answer` | relayed | WebRTC answer (peer→initiator) |
| `webrtc_ice_candidate` | relayed | ICE candidates both ways |
| `vote_queue` | client→server | Player hit Queue button |
| `peer_voted_queue` | server→client | Other player hit Queue |
| `mutual_queue` | server→client | Both queued — reveal usernames |
| `vote_skip` | client→server | Player hit Skip |
| `peer_skipped` | server→client | Other player skipped |
| `cancel_queue` | client→server | Cancel search |
| `peer_disconnected` | server→client | Other player left |

---

## Next features to build

- [ ] Karma/reputation rating after each session
- [ ] Agent selector (not just role)
- [ ] "Looking for X players" (duo, trio, full team)
- [ ] CS2, Apex, Overwatch support
- [ ] Report system
- [ ] Premium tier: rank filtering, priority queue
