# Card Trading

PTCG PSA10 auction comparison website.

## Website

After GitHub Pages is enabled for this repository, the site is served from:

https://13928113907.github.io/Card-Trading/

The GitHub Pages frontend reads `https://card-trading-api.47-82-148-17.sslip.io` and reloads the API every 60 seconds. The API domain resolves to the Singapore collector without placing a raw HTTP IP address in the browser configuration. If the API is unavailable, the frontend clearly labels and displays the published static snapshot instead.

## Live collector

The collector runs Playwright every 60 seconds, keeps the previous verified listing snapshot, and adds `previousBidCny`, `priceChangeCny`, and `priceChangePct` to matching stable listing IDs. A manual refresh returns immediately and the frontend polls `/api/status` until the server-side collection finishes.

```bash
npm install
npx playwright install chromium
AUTO_REFRESH=1 ALLOWED_ORIGINS=https://13928113907.github.io npm start
```

For the Singapore server deployment, copy `deploy/.env.example` to `deploy/.env`, make sure Alibaba Cloud security-group inbound rules allow TCP 80 and 443, and run:

```bash
docker compose --env-file deploy/.env -f deploy/compose.yaml up -d --build
```

The default deployment domain is `card-trading-api.47-82-148-17.sslip.io`, which currently resolves to `47.82.148.17`. Caddy obtains and renews its HTTPS certificate automatically.

Authenticated browser states live only in `secrets/browser-state/*.json`. Docker mounts this directory read-only at `/app/secrets/browser-state`; it is excluded from Git and the Docker build context.

The persistent server Chromium desktop binds only to the server loopback interface. Open an SSH tunnel from the Mac before visiting it:

```bash
ssh -i ~/.ssh/codex_sever -N -L 33000:127.0.0.1:3000 admin@47.82.148.17
```

Then open `http://127.0.0.1:33000`. Its profile is stored in the ignored `secrets/session-browser` directory and is never exposed by Caddy.

The collector connects to this authenticated Chromium over CDP on the private Docker network. The loopback CDP endpoint is forwarded to internal port `9223`; neither port is published to the host or the Internet.

The live response contains verified rows only. Platforms that require a logged-in App or browser session appear under `sources` as disconnected and are not emitted as fake zero-price listings.

For reliable eBay data, set `EBAY_CLIENT_ID` and `EBAY_CLIENT_SECRET` from an eBay Developer application. The collector then uses the official Browse API for stable listing IDs, direct URLs, original images, current auction prices, end times, and item locations. Browser collection remains a strict fallback and rejects rows without a listing ID, image, and direct item URL.

## SNKRDUNK

SNKRDUNK TCG prices require an authenticated server-side collector. Never place its session or token in frontend files. Set `SNKRDUNK_FEED_URL` and, when required, `SNKRDUNK_FEED_TOKEN` on the server. The protected feed must return:

```json
{
  "listings": [
    {
      "targetId": "ptcg-umbreon-vmax-215",
      "listingId": "stable-platform-id",
      "grade": "PSA 10",
      "price": 500000,
      "currency": "JPY",
      "title": "Listing title",
      "url": "https://snkrdunk.com/...",
      "imageUrl": "https://...",
      "auctionStartAt": "2026-07-28T00:00:00Z",
      "auctionEndAt": "2026-07-29T00:00:00Z",
      "shippingFrom": "Japan",
      "capturedAt": "2026-07-28T00:05:00Z"
    }
  ]
}
```

## Local Preview

Open `web/index.html` directly in a browser, or serve the `web` folder with any static file server.

## Unified Website Modules

- `/` is the market monitor for live auctions, profit opportunities, PSA10 annual research, and the review queue.
- `/research/` is the independent card lookup module for catalog images, provider status, price samples, and external research sources.
- Both modules share one navigation and visual language while keeping their frontend code and API workflows isolated.
- The market frontend reads the latest server snapshot every 60 seconds. Collector freshness remains visible in the page status and is not presented as a live quote when stale.
- Run `npm run research` to use the template API at `http://127.0.0.1:8080/`.
- Any keyword can generate external lookup links. If `EBAY_CLIENT_ID` and `EBAY_CLIENT_SECRET` are set, `/api/research?q=...` also reads live eBay Browse API listing samples.
- The lookup panel groups broader sources: 130 Point, eBay, Mavin, PriceCharting/SportsCardsPro, PSA Price Guide, PSA Pop Report, TCGplayer, Scryfall, YGOPRODeck, Cardmarket, Collectr, Pokellector, TCDB, Cardboard Connection, Topps, Panini, Beckett, Card Ladder, Market Movers, HobbyCardIndex, SNKRDUNK, Card Hobby, Fanatics Collect, Goldin, ALT, and COMC.
- Pokémon/宝可梦中文关键词 are mapped to English catalog terms for the catalog layer. For example, `月亮伊布` maps to `Umbreon`; the backend queries Pokémon TCG API first and falls back to TCGdex when that API is unavailable.
- Free API catalog/price integrations are active for Pokémon TCG API/TCGdex, Scryfall, and YGOPRODeck. See `docs/ebay-developer-api.md` for the eBay Developer key setup and the current free/paid source split.
- Some sources are direct/paid/login-gated references rather than stable public APIs. PriceCharting/SportsCardsPro, PSA, Card Ladder, Market Movers, Card Hobby, SNKRDUNK, ALT, and auction houses should be treated as data sources to open, subscribe to, authorize, cache, or import before the template can automatically fill every historical chart.
