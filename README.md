# MAX

A small living creature in a room of its own — a mobile-first, local-first PWA.
MAX is **not** a chatbot. The room, physics, time of day, mood, memory, events and presence all run on the device and
work offline with no AI. AI is only MAX's *brain* for conversation, reached through a tiny backend so keys never touch the client.

## Run & deploy (Cloudflare Workers)

The backend is a single Cloudflare Worker (`worker.js`); the PWA in `public/` is served as static assets. The Worker runs only for `/api/*`.

```bash
npm install
cp .dev.vars.example .dev.vars   # put ANTHROPIC_API_KEY=... for local testing (git-ignored)
npm run dev                      # wrangler dev -> http://localhost:8787

npx wrangler login
npx wrangler secret put ANTHROPIC_API_KEY      # the AI brain. Never in client code or wrangler.jsonc
# or for Groq: set "AI_PROVIDER": "groq" in wrangler.jsonc, then
# npx wrangler secret put GROQ_API_KEY
npm run deploy                                  # regenerates the precache list, then wrangler deploy
```

Without a key, `/api/chat` answers `503 ai_unavailable` and the client quietly uses its local simulation
(`public/js/sim/localVoice.js`, labelled "thinking on its own" in the UI).

### Secrets and settings

| Name | Kind | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | secret | AI brain when `AI_PROVIDER=anthropic` (default; model `claude-haiku-4-5`). |
| `GROQ_API_KEY` | secret | AI brain when `AI_PROVIDER=groq` (OpenAI-compatible `https://api.groq.com/openai/v1/chat/completions`; default model `llama-3.3-70b-versatile`). |
| `ADMIN_TOKEN` | secret, optional | Bearer token for `POST /api/admin/shared` (needs KV). |
| `MAX_SHARED_SECRET` | secret, optional | Enables the hidden schedule of rare shared events. Without it they are off. |
| `AI_PROVIDER` | var | `anthropic` (default) or `groq` (also `openai`, `gemini`, `openrouter`, `custom`). Set in `wrangler.jsonc`; swap with no client rebuild. |
| `AI_MODEL`, `AI_BASE_URL` | var, optional | Override the provider's default model / endpoint. Leave `AI_MODEL` unset unless it matches the provider. |
| `OPENAI_API_KEY` `GEMINI_API_KEY` `OPENROUTER_API_KEY` `AI_API_KEY` | secret | Alternative providers (`AI_PROVIDER=openai` etc.; `custom` + `AI_BASE_URL` for any OpenAI-compatible endpoint). |
| `MAX_CONFIG` | var, optional | JSON override of limits / ai / shared defaults in `worker.js`. |
| `MAX_FORCE_SHARED=1` | var | Force a shared event (testing). |

### Optional KV (`MAX_KV`)

Uncomment `kv_namespaces` in `wrangler.jsonc` after `npx wrangler kv namespace create MAX_KV`. It gives durable daily rate limits and a global cost budget, and
the admin override of the shared event (`POST /api/admin/shared {"minutes":10}` with the bearer token). Without KV the Worker still runs: burst and daily limits
are kept in memory per isolate and the admin override returns 501. The free KV plan allows 1,000 writes/day (2 per AI request), so use the paid plan for real traffic.

### Headers

Security headers/CSP for the static site live in `public/_headers` (Workers Static Assets); API responses set their own.

## Layout

```
worker.js          Cloudflare Worker: /api/health|config|chat|moment|shared, provider routing, rate limits, prompts
wrangler.jsonc     Worker + static assets config
public/
  index.html, manifest.webmanifest, sw.js, icons/
  css/app.css      design system
  js/core/         storage (IndexedDB + small localStorage prefs), state, defaults, adaptive performance
  js/brain/        time, personality, mood, memory, events, presence (life), guide, interactions
  js/render/       canvas room, light, sky, physics world, MAX drawing, particles
  js/device/       capability/permission registry, notifications, optional bridge client
  js/ai/           backend client (compact context, status)
  js/sim/          offline local voice
  js/i18n/         en ar zh hi es fr  (+ RTL)
  js/ui/           onboarding, HUD, chat, notebook, settings, share cards, install prompt …
bridge/max-bridge.js   OPTIONAL Termux helper (advanced)
tools/             icon generation, precache, i18n completeness check
```

## Principles implemented

- **Standalone-first.** No account. Structured state in IndexedDB; only small prefs in localStorage; in-memory fallback if storage is blocked.
- **Capabilities are real.** Memory, Notifications, Sound, Device info, Location, Microphone, Touch feedback, Advanced device features. Each has a state
  (available / enabled / disabled / denied / unavailable / advanced-unavailable); the OS prompt appears only after the user turns a capability on and reads an
  explanation; revoked permissions are detected and the capability switches off.
- **Privacy.** Settings → Privacy shows exactly what leaves the device and the last payload sent. Memories are structured, editable and deletable; MAX works with memory off.
  Share cards never include memories or chats. No ads, no tracking.
- **Ethics.** MAX never guilt-trips; notifications are rare (max 2/day, quiet hours); AI output can never trigger device actions.
- **Languages.** English, العربية (true RTL), 中文, हिन्दी, Español, Français — auto-detect, manual selector, instant switch.
  `node tools/i18n-check.mjs` verifies every pack has identical keys and `{placeholders}`.
- **Accessibility.** Text scaling, reduced motion, high contrast, keyboard operation, ARIA live regions.
- **Performance.** Auto/Low/Medium/High; Auto watches frame time and scales effects.

## Notifications

Standard Web Notifications via the service worker (+ periodic background sync where the browser supports it). Delivery while the app is closed
depends on the browser/OS — Settings says so honestly. No Termux is needed.

## Optional: advanced device layer (Termux)

Hidden from onboarding; lives in Settings → Advanced. In Termux with Termux:API installed:

```bash
pkg install nodejs termux-api
node bridge/max-bridge.js        # prints address + pairing code
```

Enter them in Settings → Advanced. The bridge listens on 127.0.0.1 only, requires the pairing code, exposes a fixed allow-list
(`vibrate`, `toast`, `torch`), never runs text from the page or AI, and `torch` asks for confirmation every time.

## Development

Open `/?dev=1` to expose `window.__max` (state, world, memory, events) for debugging.
