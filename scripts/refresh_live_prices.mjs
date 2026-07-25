import fs from "node:fs/promises";

const root = "/Users/be/Documents/宝可梦拍卖";
const outputPath = `${root}/data/live_market_quotes.json`;
const exchangeUsdCny = Number(process.env.USD_CNY || 7.2);
const ebayClientId = process.env.EBAY_CLIENT_ID;
const ebayClientSecret = process.env.EBAY_CLIENT_SECRET;

const watchItems = [
  { id: "P001", cardName: "Pikachu Promo PSA10", query: "Pikachu Promo PSA 10 SV-P" },
  { id: "P002", cardName: "Charizard ex SAR PSA10", query: "Charizard ex SAR PSA 10" },
  { id: "P003", cardName: "Lillie Full Art PSA10", query: "Lillie Full Art PSA 10" },
];

function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

async function getEbayToken() {
  if (!ebayClientId || !ebayClientSecret) {
    throw new Error("Missing EBAY_CLIENT_ID or EBAY_CLIENT_SECRET");
  }
  const basic = Buffer.from(`${ebayClientId}:${ebayClientSecret}`).toString("base64");
  const response = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      scope: "https://api.ebay.com/oauth/api_scope",
    }),
  });
  if (!response.ok) {
    throw new Error(`eBay token request failed: ${response.status} ${await response.text()}`);
  }
  const json = await response.json();
  return json.access_token;
}

async function searchEbay(token, item) {
  const url = new URL("https://api.ebay.com/buy/browse/v1/item_summary/search");
  url.searchParams.set("q", item.query);
  url.searchParams.set("limit", "50");
  url.searchParams.set("filter", "buyingOptions:{FIXED_PRICE|AUCTION}");
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
    },
  });
  if (!response.ok) {
    throw new Error(`eBay search failed for ${item.id}: ${response.status} ${await response.text()}`);
  }
  const json = await response.json();
  const prices = (json.itemSummaries ?? [])
    .map((entry) => {
      const value = Number(entry.price?.value ?? 0);
      const currency = entry.price?.currency ?? "USD";
      if (!value) return 0;
      return currency === "USD" ? value * exchangeUsdCny : value;
    })
    .filter((value) => value > 0);
  return {
    id: item.id,
    cardName: item.cardName,
    platform: "eBay",
    buyPriceCny: Math.round(percentile(prices, 10)),
    sellPriceCny: Math.round(percentile(prices, 60)),
    lowestAskCny: Math.round(Math.min(...prices, 0)),
    sampleCount: prices.length,
    updatedAt: new Date().toISOString(),
    status: prices.length ? "实时" : "无数据",
    dataMode: "API",
    query: item.query,
    sourceUrl: `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(item.query).replaceAll("%20", "+")}`,
    notes: prices.length ? "eBay Browse API 当前挂牌；非已成交价" : "eBay Browse API 未返回可用价格",
  };
}

const rows = [];
try {
  const token = await getEbayToken();
  for (const item of watchItems) {
    rows.push(await searchEbay(token, item));
  }
} catch (error) {
  for (const item of watchItems) {
    rows.push({
      id: item.id,
      cardName: item.cardName,
      platform: "eBay",
      buyPriceCny: 0,
      sellPriceCny: 0,
      lowestAskCny: 0,
      sampleCount: 0,
      updatedAt: new Date().toISOString(),
      status: "报错",
      dataMode: "API",
      query: item.query,
      sourceUrl: `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(item.query).replaceAll("%20", "+")}`,
      notes: error.message,
    });
  }
}

await fs.mkdir(`${root}/data`, { recursive: true });
await fs.writeFile(outputPath, JSON.stringify({ generatedAt: new Date().toISOString(), rows }, null, 2));
console.log(outputPath);
