# **PRD — Micro-Watch-Party (Ultra-Minimal MVP)**

> *Goal: one bare-bones page that streams a hosted `.webm`, keeps up to five friends in lock-step with the admin’s controls, and is driven entirely by a drop-in config file. No lobby, chat, or styling.*

---

## 1 · Success Criteria

| ID | Metric | Pass Threshold |
|----|--------|----------------|
| **S-1** | Participants’ playback positions differ from the admin by **≤ 0.5 s** for ≥ 95 % of a 30-min test. |
| **S-2** | Fresh VPS install + config file + `node server.js` yields a working session in **< 10 min**. |
| **S-3** | Page loads and begins playing in **< 5 s** on desktop Chrome over 25 Mbps. |

---

## 2 · Scope & Assumptions

* ≤ 5 concurrent viewers (admin + 4).  
* Desktop **Chrome 124+** only.  
* Video file is a **public `.webm` with proper CORS** headers (e.g., S3).  
* Admin can SCP a JSON/YAML file to the server.  
* One room at a time; late joiners **refresh** to sync.

---

## 3 · Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| **F-1** | **Config file**: server reads a `session.json` containing `{ "videoUrl": "...", "slug": "abcd1234", "startTime": 0 }`. | Must |
| **F-2** | **Single URL**: clients hit `https://host/<slug>` and video autoplays. | Must |
| **F-3** | **Admin flag**: first connection with `?admin` query param becomes the authoritative clock. | Must |
| **F-4** | **Control propagation**: admin’s native **play / pause / seek** events broadcast via WebSocket ≤ 100 ms RTT. | Must |
| **F-5** | **Drift correction**: non-admin clients auto-seek if delta > 0.5 s. | Must |
| **F-6** | **Heartbeat**: admin emits `currentTime` every 3 s; others resync if needed. | Must |

---

## 4 · Non-Functional Requirements

| ID | Requirement | Target |
|----|-------------|--------|
| **NF-1** | **Server footprint**: ≤ 30 MB RAM, single `server.js` (~100 LOC). |
| **NF-2** | **Latency**: WebSocket echo ≤ 150 ms (US-West ↔ US-West). |
| **NF-3** | **Security**: force HTTPS; session URL uses a 10-char random slug from config. |

---

## 5 · Minimal Architecture
* Client (HTML + )  ⇆  Socket.IO  ⇆  Node.js (Express)  ← session.json
* **No database**—serve one static `index.html` and a tiny JS bundle.  
* **Routes**  
  * `GET /<slug>` → raw HTML (`<video src=... autoplay muted controls>` + inline JS).  
  * `GET /ws` → Socket.IO endpoint.

### 5.1 Key Files

| File | Purpose | Approx. Size |
|------|---------|--------------|
| `session.json` | `{ "videoUrl": "...", "slug": "abcd1234" }` | 1 KB |
| `server.js` | Reads config, hosts static files, relays WS msgs. | ~100 LOC |
| `player.js` | Hooks `<video>` events, handles sync. | ~120 LOC |
| `index.html` | Single-line markup. | < 20 LOC |

---

## 6 · Deployment & Ops

1. Provision any Ubuntu 24.04 VPS (256 MB RAM).  
2. `git clone` repo → `cp session.example.json session.json`; edit video URL & slug.  
3. `npm install && node server.js`.  
4. Share `https://host/<slug>?admin` with yourself; share `https://host/<slug>` with friends.  
5. For a new movie, SCP a new `session.json` and restart the process.

_No Docker or CI required._

---

## 7 · Acceptance Checklist

- [ ] Admin page loads video; play/pause/seek mirror to secondary browser within 0.5 s.  
- [ ] Drift remains ≤ 0.5 s for 30-min test.  
- [ ] Fresh VPS install documented in `README.md` (< 20 lines).  
- [ ] Killing admin tab drops control; reconnecting with `?admin` regains it.

---

## 8 · Out of Scope

* Lobby or ready state  
* Chat, captions, user names  
* Mobile support  
* Multiple simultaneous rooms  
* Playlists or automatic video selection  

---

**Owner:** You  
**Last updated:** 2025-07-01