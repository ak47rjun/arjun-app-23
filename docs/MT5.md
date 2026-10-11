# MT5 Analytics — Setup Guide

ARJUN imports your MetaTrader 5 trading history for analytics (equity, win rate,
per-instrument stats). It is **read-only by design**.

## Security model (read this first)

- ARJUN only accepts the **investor (read-only) password**. The **master trading
  password is rejected at the API** (`400 MASTER_PASSWORD_REJECTED`) — both as a
  `masterPassword` field and as a value containing "master".
- The investor password is encrypted at rest with **AES-256-GCM**
  (`ENCRYPTION_KEY`) and only ever sent to your MT5 bridge over TLS.
- Credentials are never returned by the API, never logged, and never shipped to
  the browser.
- If your broker exposes investor-password-only statements (HTML/CSV), you can
  also import manually in the journal — no bridge needed.

## Architecture

ARJUN supports **two read-only connection modes**:

### Mode 1 — Expert Advisor push (recommended, no server config needed)

An Expert Advisor (`ARJUN_EA.mq5`, downloadable from the MT5 page) runs **inside
your MT5 terminal** — which is already logged in to your broker — and pushes the
account snapshot + closed deals to `POST /api/mt5/ingest` over TLS.

```
MT5 terminal (your machine, EA attached)
   │  HTTPS + Bearer sync-token (per-connection, shown once)
   ▼
ARJUN /api/mt5/ingest ──▶ account snapshot + trade import (dedupe by deal id)
```

- **No investor password is collected or stored** — the terminal session is
  already authenticated. This is the most secure mode.
- The EA never opens/closes/modifies trades — it only reads and pushes.
- Setup: connect in ARJUN (MT5 → Connect account → Expert Advisor mode) → copy
  the one-time sync token → allow `https://<your-host>` in the terminal's
  WebRequest URL list (Tools → Options → Expert Advisors) → attach the EA to any
  chart and paste the token into `InpSyncToken`.
- The terminal must be online for pushes (normal for a trading setup). The
  connection shows ACTIVE after the first push.
- **Bot / robot trades are journaled too** — the EA reads the account's full
  deal history, so anything that trades on the account (your EAs, copy
  followers, manual trades) appears in your journal, with the same dedupe.
- Times are sent as broker server time (ISO-8601 with `Z`).

### Mode 2 — Bridge polling (server-side, needs MT5_BRIDGE_URL)

```
MT5 terminal ──(investor password, TLS)──▶ MT5 bridge service ──▶ ARJUN API
                                                            │
                                              Prisma (encrypted creds,
                                              dedupe by connectionRef:externalId)
                                                            │
                                              background sync jobs (MT5_SYNC /
                                              MT5_HISTORY), account snapshot,
                                              trade import with P&L
```

The bridge is a small service you run (it talks to the MT5 terminal via the
MetaTrader 5 Python API or by reading the terminal's exports). ARJUN expects:

- `MT5_BRIDGE_URL` — base URL of the bridge, e.g. `https://mt5-bridge.yourhost.com`
- `MT5_BRIDGE_API_KEY` — shared secret; ARJUN sends it as `Authorization: Bearer …`

### Bridge API contract (what ARJUN calls)

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/verify` | body `{ login, server, investorPassword }` → `{ ok, account: { balance, equity, currency, … } }` — used at connect time |
| `POST` | `/history` | body `{ login, server, investorPassword, since? }` → `{ deals: [{ id, symbol, direction, volume, openPrice, closePrice, openTime, closeTime, profit, commission, swap, … }] }` |
| `GET` | `/health` | liveness |

Deal `id` values are used for **idempotent import**: ARJUN stores
`connectionRef:externalId` with a unique constraint, so re-syncs never duplicate
trades.

## Without a bridge

If `MT5_BRIDGE_URL` is unset, **bridge mode** is unavailable (`503 SETUP_REQUIRED`
on `POST /api/mt5/connections` with `mode: "BRIDGE"`) — but **EA mode keeps
working with zero configuration**. Nothing is faked in either mode. Manual
journal entry keeps working regardless.

## EA ingest API contract (what the EA calls)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/api/mt5/ingest` | `Authorization: Bearer <syncToken>` | account snapshot + closed deals |

Body:

```json
{
  "account": { "login": "108518884", "balance": 10000.0, "equity": 10250.5,
               "margin": 120.0, "freeMargin": 10130.5, "currency": "USD", "leverage": 100 },
  "deals": [
    { "dealId": "123456", "symbol": "EURUSD", "direction": "LONG", "volume": 0.1,
      "openPrice": 1.085, "closePrice": 1.086,
      "openTime": "2026-10-09T10:00:00Z", "closeTime": "2026-10-09T11:00:00Z",
      "profit": 10.0, "commission": -0.7, "swap": 0.0 }
  ]
}
```

- The token is generated at connect time, returned **exactly once**, and stored
  only as a SHA-256 hash. Rate-limited to 30 pushes/minute per token.
- `account.login` must match the connected account (else `400 LOGIN_MISMATCH`).
- `dealId` is the dedupe key: re-pushes never duplicate trades.

## Sync behavior

- First sync is enqueued on connect (`MT5_HISTORY`), then periodic `MT5_SYNC`.
- Jobs run in the background job runner (`src/server/jobs.ts`); each connection
  shows recent jobs with status/errors/retries.
- On failure you get an in-app `SYNC_FAILURE` notification; the connection is
  marked `ERROR` with `lastError` (visible on the MT5 page).
- A connection starts as `DISCONNECTED` and becomes `ACTIVE` only after a
  successful sync — the UI never claims a connection that hasn't synced.

## Data mapping

MT5 deals are mapped to journal trades: direction (buy/sell → LONG/SHORT),
volume → quantity (lots), prices, times (UTC), profit → gross P&L, commission +
swap → costs. Instrument symbols are matched against the seeded instrument
catalog (`EURUSD`, `XAUUSD`, …); unknown symbols are kept with their raw symbol.

## Running your own bridge (example)

A minimal bridge can be a small Node/Python service on the machine where the MT5
terminal runs:

```python
# sketch — MetaTrader5 python package, investor login only
from flask import Flask, request
import MetaTrader5 as mt5

app = Flask(__name__)

@app.post("/verify")
def verify():
    b = request.json
    if not mt5.initialize(login=int(b["login"]), password=b["investorPassword"], server=b["server"]):
        return {"ok": False}, 400
    info = mt5.account_info()
    mt5.shutdown()
    return {"ok": True, "account": {"balance": info.balance, "equity": info.equity, "currency": info.currency}}
```

Deploy it anywhere reachable from ARJUN (localhost, VPS, Fly, Railway…), set
`MT5_BRIDGE_URL` + `MT5_BRIDGE_API_KEY`, restart, and connect an account from
**MT5 → Connect** in the app.
