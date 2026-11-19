# CUBE-S-AI Cloud — architecture (Phase 2)

Three ways to get an AI answer, always the user's explicit choice (Settings > AI providers). Nothing ever switches silently.

| Option | Who pays | Where the key lives | Data path |
|---|---|---|---|
| **Free AI (Puter)** default | Puter | none | browser -> Puter (and Pollinations if Puter has no credit) |
| **Your own key (BYOK)** | the user | encrypted on the user's device | browser -> OpenAI / Anthropic / Gemini |
| **CUBE-S-AI Cloud** | the app owner, within limits | Cloudflare Worker secrets only | browser -> Worker -> provider |

```
Browser ──(Firebase ID token)──▶ Cloudflare Worker ──(server-side key)──▶ OpenAI | Anthropic | Gemini | any OpenAI-compatible host (e.g. Llama)
                                   │  verifies token (RS256, Google keys)
                                   │  per-IP throttle -> per-user limits -> monthly budget reservation
                                   ├─ UserDO   (one per user): plan, daily/minute counters
                                   └─ BudgetDO (one, global):  month spend, reservations, alerts, pause switch
```

## What protects the owner's money
1. **Off by default.** `CLOUD_ENABLED="false"`, every model disabled and unpriced, no provider keys until you add them.
2. **Priced models only.** A model without `inUsdPerM` / `outUsdPerM` is refused, because its spend could not be metered.
3. **Hard monthly cap** (`MONTHLY_BUDGET_USD`; `<= 0` keeps paid AI off) plus optional per-provider caps.
4. **Reserve before call.** The worst-case cost of a request is reserved first, so parallel requests cannot overshoot the cap. Afterwards the reservation is replaced by the real cost from the provider's usage report (a pessimistic estimate is charged if none is reported). Reservations that never finish expire after 15 minutes.
5. **Alerts** at 50 / 80 / 95 / 100 % (configurable) and when the cap or a provider cap blocks requests, when a provider rejects the shared key, and on manual pause. Delivered to a webhook (Discord, Slack, ntfy or generic JSON).
6. **Per-user limits:** daily request allowance (free default 20), daily cost cap, per-minute rate, premium models only on premium plans.
7. **Abuse limits:** per-IP throttle before authentication, body size, message count, input length, output tokens, model allow-list, verified accounts only (no anonymous, no unverified email), exact-origin CORS.
8. **Kill switches:** `POST /v1/admin/pause` (instant), `CLOUD_ENABLED="false"` (redeploy), deleting a provider secret.

## Privacy
- Firebase tokens are verified on the server; the token is never forwarded to a provider.
- Messages, answers and file text are streamed through and **never stored or logged**. File contents reach the Worker only as text extracted in the browser, inside the message, limited by `MAX_INPUT_CHARS`.
- Stored per user: plan and counters (requests, tokens, cost). Per IP: a counter keyed by a salted hash, deleted after 48 h.
- The app shows the user which company receives their text (per model) and asks once per provider before first use.
- Responses carry `Cache-Control: no-store`. Provider error bodies are never forwarded to users.

## Subscriptions (prepared, not connected to payments)
Plans live in config (`free`, `premium`, and any extra tier via `PLANS_JSON`). A plan can have an expiry. Today the owner grants a plan with
`POST /v1/admin/plan {"uid","plan","days"}`. A payment provider webhook can call the same logic later without changing the app or the limits engine.

## Adding a provider
- OpenAI-compatible host (Llama on an official host, etc.): add a catalog entry with `adapter:"openai-compat"`, `keyEnv`, `baseUrl` or `baseUrlEnv`, a price, `enabled:true`, and set the secret.
- Something with its own API: add one adapter (`build` + `parser`) in `worker/src/providers.js`.
