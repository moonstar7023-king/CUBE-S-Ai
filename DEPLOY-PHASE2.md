# Deploying CUBE-S-AI Cloud (Phase 2) — step by step

**Nothing in this repo deploys itself or spends money.** You run each step yourself. Never paste an API key into a chat, an issue or a file in the repo: keys go only into `wrangler secret put` (hidden prompt).

## Decision points that need YOUR approval
| # | Decision | Where |
|---|---|---|
| A | Create/use a Cloudflare account and deploy the Worker | step 2, 7 |
| B | Which models to offer and their prices (you must check the provider's official pricing page) | step 4 |
| C | Monthly budget and daily allowance | step 3 |
| D | Add real provider keys (spending becomes possible) | step 5 |
| E | Switch Cloud AI on (`CLOUD_ENABLED="true"`) | step 10 |

## Before you start (verify these yourself, they change over time)
- Workers **Free** has a very small CPU limit per request. Streaming long answers may hit it. **Workers Paid** (a small monthly fee) is the safe choice. Durable Objects with SQLite storage should be available on Free too. Check Cloudflare's current limits and pricing page before relying on either.
- Check every model id and price on the provider's official pricing page. The catalog ships with ids but **no prices** on purpose.
- This Worker was tested on a Workers-compatible fake runtime (33 automated tests), not on Cloudflare itself. Step 6 is your first real run: do it before step 7.

## Steps
1. **Install tools:** Node 18+ and, inside `worker/`, `npm install`.
2. **Log in:** `npx wrangler login` opens your browser to authorise. You never share credentials with anyone.
3. **Edit `worker/wrangler.toml`** `[vars]`:
   - `ALLOWED_ORIGINS` = your site origin only (default `https://moonstar7023-king.github.io`). Add `http://localhost:8000` only while testing locally.
   - `MONTHLY_BUDGET_USD` = the most you will ever pay for AI per month. Start small. Optionally `PROVIDER_MONTHLY_CAPS_USD`.
   - `FREE_DAILY_REQUESTS` (default 20), `FREE_DAILY_COST_USD` (default 0.05), `DAY_RESET_UTC_OFFSET_HOURS` (5 = Pakistan).
   - Alerts: `ALERT_PCTS`, `ALERT_FORMAT` (`discord` | `slack` | `ntfy` | `json`).
4. **Edit `worker/src/models.js`:** for each model you want, set `inUsdPerM` and `outUsdPerM` (USD per 1,000,000 tokens) from the official price page and `enabled: true`. Start with ONE cheap `free`-tier model. Keep premium models disabled until you have a paid plan to sell.
5. **Add secrets** (hidden prompt, nothing is echoed). Only for providers you enabled:
   ```
   npx wrangler secret put OPENAI_API_KEY
   npx wrangler secret put ANTHROPIC_API_KEY
   npx wrangler secret put GEMINI_API_KEY
   npx wrangler secret put ADMIN_TOKEN        # make one with: openssl rand -hex 32  (keep it private)
   npx wrangler secret put IP_SALT            # any long random string
   npx wrangler secret put ALERT_WEBHOOK_URL  # Discord/Slack webhook or an ntfy topic URL
   ```
   **Also set spend limits inside each provider's own dashboard** (project budget / usage limit / billing alerts). That is a second, independent safety net. Some providers' alerts are warnings, not hard stops, so keep the Worker cap low.
6. **Local test:** copy `worker/.dev.vars.example` to `.dev.vars`, fill test values, set `CLOUD_ENABLED="true"` temporarily, run `npx wrangler dev`. Check:
   `curl http://localhost:8787/v1/health` -> `{"ok":true}`; unauthenticated `curl .../v1/me` -> 401.
   To test with a real login, open the live app, press F12 and run `auth.currentUser.getIdToken().then(console.log)`. The token lasts about an hour. **Treat it like a password and never share it.** Then:
   `curl -H "Authorization: Bearer <token>" http://localhost:8787/v1/me`
7. **Deploy (inert):** keep `CLOUD_ENABLED = "false"` and run `npx wrangler deploy`. Wrangler prints your URL, e.g. `https://cubes-ai-proxy.<you>.workers.dev`. With the switch off the Worker spends nothing.
8. **Connect the app:** put that URL in `ai/config.js` (`window.CS_CLOUD_URL = '...'`), commit and push to GitHub Pages. Users now see a Cloud AI card that says it is not switched on.
9. **Test alerts:** `curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" -d '{"paused":true}' https://<worker>/v1/admin/pause`. Your webhook must receive a message. Then send `{"paused":false}`.
10. **Switch on (decision E):** set `CLOUD_ENABLED = "true"`, `npx wrangler deploy`. In the app: Settings > AI providers > Cloud AI. Send a message, then check spending:
    `curl -H "Authorization: Bearer $ADMIN_TOKEN" https://<worker>/v1/admin/budget`
11. **Watch it:** `npx wrangler tail` shows live logs (set `LOG_USAGE="true"` for hashed-user usage lines; message text is never logged).

## Operating
| Task | Command |
|---|---|
| Budget status | `GET /v1/admin/budget` |
| Emergency stop | `POST /v1/admin/pause {"paused":true}` |
| Resume | `POST /v1/admin/pause {"paused":false}` |
| Give a user Premium for 30 days | `POST /v1/admin/plan {"uid":"<firebase uid>","plan":"premium","days":30}` |
| Back to free | `POST /v1/admin/plan {"uid":"...","plan":"free"}` |
| New plan tier | add `PLANS_JSON` in `wrangler.toml`, redeploy |
All admin calls use `Authorization: Bearer $ADMIN_TOKEN` and only work from curl (never from a browser).

## Rollback
Pause with the endpoint, or set `CLOUD_ENABLED="false"` and redeploy, or empty `CS_CLOUD_URL` in `ai/config.js` and push (the Cloud card disappears; free Puter and your own keys keep working).

## Adding Meta Llama later
Meta has no public chat API for this app directly. If you use an **official** Llama host that is OpenAI-compatible, edit the `llama` entry in `models.js` (real model id, price, `enabled:true`), set `LLAMA_BASE_URL` in `[vars]`, `npx wrangler secret put LLAMA_API_KEY`, and fill in `privacyUrl`. The app shows the company name and asks consent automatically.

## Known limits
- Cost control relies on provider-reported usage; when missing, a pessimistic estimate is charged. Keep provider-side limits on as well.
- Reading text from images and image generation still use Puter, not Cloud AI.
- Payments are not connected: premium plans are granted manually for now.
- Cloudflare Workers Free CPU limits may be too small for long streams (see top).
