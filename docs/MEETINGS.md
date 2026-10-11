# ARJUN Meet — Setup Guide

ARJUN Meet provides instant and scheduled video meetings between traders, with a
lobby, host controls, screen share, and messenger invites. It runs on
**LiveKit** (open-source WebRTC SFU — use LiveKit Cloud or self-host).

## Without LiveKit

If `LIVEKIT_URL` / `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` are unset:

- Meetings can still be **created** (lobby, scheduling, invites work).
- Joining a room returns `503 SETUP_REQUIRED` with a clear message; the room page
  shows the setup-required state plus any **external link** the host provided
  (e.g. a Google Meet link) as a fallback.
- No call is ever fabricated.

## Configuration

### Fastest path — LiveKit Cloud (free tier: 10,000 participant-minutes/month)

1. Sign up at [cloud.livekit.io](https://cloud.livekit.io) (free).
2. Create a project → copy **Project URL** (`wss://…`), **API Key**, **API Secret**.
3. Set them on your host (Railway: Variables tab):

   ```bash
   LIVEKIT_URL=wss://your-project.livekit.cloud
   LIVEKIT_API_KEY=APIxxxxxxxx
   LIVEKIT_API_SECRET=…
   ```
4. Redeploy — real video meetings work immediately (LiveKit Cloud includes
   TURN + global edge, so media flows even behind restrictive networks).

### Self-hosted alternative

Run `livekit-server` (binary or Docker) and point `LIVEKIT_URL` at it
(`ws://livekit.yourhost:7880`). Note: WebRTC media needs UDP (or a TURN
server) — TCP-only hosts (some PaaS free tiers) will connect but not pass
audio/video. LiveKit Cloud avoids this entirely.

## How it works

1. **Create** a meeting (instant or scheduled) from `/meetings` — a unique room
   name `arjun-<id>` is generated.
2. **Join** (`POST /api/meetings/[id]/join`) — the server checks host/participant
   authorization, mints a **LiveKit AccessToken** (identity = user id, grants for
   the room), and returns `{ token, url, roomName }`.
3. The room page (`/meetings/[id]`) dynamically imports `livekit-client`,
   connects, and renders mic/cam/screen-share controls. The token never leaves
   the server-to-client boundary as anything but a scoped, expiring JWT.
4. **Leave** disconnects the room and notifies the server (`POST …/leave`).

## Features

- Instant meetings + scheduled meetings with reminders (background job)
- Lobby listing with status badges (scheduled / live / ended)
- Mic / camera / screen-share toggles, participant list
- Host controls (mute, remove — via LiveKit moderation grants)
- Invite from the messenger (meeting link messages)
- External URL fallback (Google Meet or any other provider) — clearly labeled
  as external
- **Recordings only with consent**: recording is opt-in per meeting and requires
  explicit participant consent; ARJUN stores only the resulting URL.

## Roles

- **Host**: full control (created the meeting).
- **Participant**: join/leave, media controls.
- Anyone else: `403` on join (server-side check against the participant list).

## Messenger integration

Sending a meeting invite in the messenger creates a rich message card with a
**Join** button that deep-links into `/meetings/[id]`.

## Privacy notes

- Meeting metadata (title, schedule, participants) is visible to participants only.
- Chat inside the meeting uses LiveKit data channels (not persisted by ARJUN).
- If you enable recording, disclose it to participants and comply with local
  consent laws (GDPR two-party consent etc.) — ARJUN surfaces a consent prompt
  but legal compliance is the operator's responsibility.
