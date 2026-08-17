# Meet Dual-Stream Transcription

Chrome MV3 extension + FastAPI backend that captures **microphone** and **Google Meet tab audio** as separate stereo channels, transcribes them live via Deepgram multichannel streaming, and generates a Gemini meeting summary.

## Architecture

```mermaid
flowchart TB
  ext[Chrome Extension] -->|stereo PCM 16kHz| api[FastAPI WebSocket]
  api --> dg[Deepgram nova-3 multichannel]
  api --> pg[(Postgres)]
  panel[Side Panel UI] --> ext
  api --> gemini[Gemini Flash summary]
```



- **Channel 0 (left):** local microphone
- **Channel 1 (right):** Meet tab audio (remote participants)
- One Deepgram WebSocket with `multichannel=true&channels=2` keeps a shared timeline for natural ordering.

## Prerequisites

- Docker + Docker Compose
- Node.js 20+ and pnpm
- Python 3.12+ (optional for local backend dev)
- API keys:
  - [Deepgram](https://console.deepgram.com/)
  - [Google AI Studio / Gemini](https://aistudio.google.com/apikey)

> `LLM_MODEL` defaults to `gemini-3.5-flash-lite`. Older names such as
> `gemini-2.5-flash` return `404 NOT_FOUND` for newly created API keys.

## Quick start

```bash
git clone <repo-url>
cd meet-dual-stream-transcription
cp .env.example .env
# edit .env with your API keys

docker compose up --build
```

In another terminal:

```bash
cd extension
pnpm install
pnpm build
```

Load unpacked extension in Chrome from `extension/dist`.

### Live Meet workflow

1. Open a Google Meet call (`https://meet.google.com/...`).
2. Click the extension's toolbar icon to open the popup.
3. Click **Enable microphone**. A dedicated tab opens — click **Allow** when Chrome
  asks. Wait for the green "Microphone enabled" message before closing the tab.
   The side panel cannot show this prompt; if you skip Allow, Start will fail
   with "Permission dismissed".
4. **Join the call** (not the lobby or Meet home page). The Start button stays
  disabled until the extension detects in-call controls (Leave call / End call).
5. Open the side panel or popup and press **Start capture**.
   Capture only starts when `meet.google.com` is your **active** tab and you are
   **in an active meeting**.
6. The side panel shows live transcripts once capture is running.
7. Click **Summarize** when done. Capture stops automatically when you leave the
  call, navigate away from Meet, or close the Meet tab.

After any `pnpm build`, press the reload icon on the extension card in  
`chrome://extensions`. Chrome keeps serving the previously loaded bundle.

## Extension controls


| Control                      | Description                                                      |
| ---------------------------- | ---------------------------------------------------------------- |
| Popup → Enable microphone    | Primes mic permission for offscreen capture                      |
| Popup → Start/Stop capture   | Begins/ends dual-stream session                                  |
| Side panel mute toggle       | Authoritative mic mute (Ctrl/Cmd+Shift+M)                        |
| Toolbar badge `REC` / `MUTE` | Visible capture indicator (offscreen docs show no tab indicator) |
| Meet mute observer           | Best-effort sync; can degrade if Meet DOM changes                |


## Backend endpoints


| Method | Path                           | Purpose                                         |
| ------ | ------------------------------ | ----------------------------------------------- |
| POST   | `/api/sessions`                | Create session                                  |
| GET    | `/api/sessions/{id}`           | Snapshot (utterances + events + latest summary) |
| POST   | `/api/sessions/{id}/stop`      | Stop session                                    |
| POST   | `/api/sessions/{id}/summarize` | Generate/cache Gemini summary                   |
| WS     | `/api/sessions/{id}/stream`    | Binary PCM in, transcript JSON out              |
| GET    | `/health`                      | Health check                                    |


## Development

### Backend tests

Install editable (`-e`), otherwise `pytest` imports a stale copy of `app/` from
site-packages instead of your working tree:

```bash
cd backend
python3.12 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
pytest
ruff check . && mypy app
```

### Extension tests

```bash
cd extension
pnpm test
```