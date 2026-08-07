import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const dataPath = path.join(root, "data/card-prices.json");
const port = Number(process.env.PORT || 8080);
const host = process.env.HOST || "127.0.0.1";
const usdCny = Number(process.env.USD_CNY || 7.2);
const ebayClientId = process.env.EBAY_CLIENT_ID || "";
const ebayClientSecret = process.env.EBAY_CLIENT_SECRET || "";
const pokemonTcgApiKey = process.env.POKEMONTCG_API_KEY || "";
const researchCacheMs = Math.max(1000, Number(process.env.RESEARCH_CACHE_MS || 5 * 60 * 1000));
const researchSourceTimeoutMs = Math.max(3000, Number(process.env.RESEARCH_SOURCE_TIMEOUT_MS || 15000));
const researchConcurrency = Math.max(1, Number(process.env.RESEARCH_CONCURRENCY || 2));

const pokemonAliases = new Map([
  ["月亮伊布", "Umbreon"],
  ["月布", "Umbreon"],
  ["太阳伊布", "Espeon"],
  ["仙子伊布", "Sylveon"],
  ["冰伊布", "Glaceon"],
  ["叶伊布", "Leafeon"],
  ["火伊布", "Flareon"],
  ["水伊布", "Vaporeon"],
  ["雷伊布", "Jolteon"],
  ["伊布", "Eevee"],
  ["皮卡丘", "Pikachu"],
  ["喷火龙", "Charizard"],
  ["耿鬼", "Gengar"],
  ["裂空坐", "Rayquaza"],
  ["梦幻", "Mew"],
  ["超梦", "Mewtwo"],
  ["路卡利欧", "Lucario"],
  ["莉莉艾", "Lillie"],
  ["玛俐", "Marnie"],
]);

const pokemonEnglishNames = new Set([...pokemonAliases.values()].map((name) => name.toLowerCase()));

export function classifyResearchQuery(query) {
  const raw = String(query || "").trim().toLowerCase();
  if (!raw) return "generic";
  if ([...pokemonAliases.keys()].some((name) => raw.includes(name))) return "pokemon";
  if ([...pokemonEnglishNames].some((name) => new RegExp(`\\b${name}\\b`, "i").test(raw))) return "pokemon";
  if (/\b(?:pokemon|pokémon|evolving skies|scarlet|violet|fusion strike|shining legends)\b/i.test(raw)) return "pokemon";
  if (/\b(?:mtg|magic(?:\s*:\s*the gathering)?|black lotus|planeswalker|mox)\b/i.test(raw)) return "magic";
  if (/游戏王|\b(?:yu-?gi-?oh|yugioh|blue[ -]eyes|dark magician)\b/i.test(raw)) return "yugioh";
  if (/海贼王|航海王|\b(?:one piece|luffy|zoro|nami|portgas|op\d{2})\b/i.test(raw)) return "onepiece";
  if (/\b(?:basketball|football|baseball|nba|nfl|mlb|topps|panini|prizm|bowman|lebron|kobe|luka|wembanyama|mahomes|brady|stroud)\b/i.test(raw)) return "sports";
  return "generic";
}

function skippedCatalog(provider, category) {
  return {
    ok: true,
    skipped: true,
    provider,
    message: `当前识别为 ${category}，已跳过不相关图鉴。`,
    query: "",
    totalCount: 0,
    cards: [],
    quotes: [],
  };
}

const accessLabels = {
  free: "免费直达",
  login: "可能需要登录",
  subscription: "需要订阅",
  api: "需要 API",
};

const mime = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "application/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".svg", "image/svg+xml"],
]);

let ebayTokenCache = null;
let tcgdexCardCache = null;

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function usdQuote(platform, label, usd, sampleCount = 1) {
  const value = numberOrNull(usd);
  if (!value) return null;
  return {
    platform,
    label,
    priceCny: Math.round(value * usdCny),
    sampleCount,
  };
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function withTimeout(promise, timeoutMs, label) {
  let timeout;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timeout = setTimeout(() => reject(new Error(`${label} timeout after ${timeoutMs}ms`)), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timeout));
}

export function createConcurrencyLimiter(limit) {
  let active = 0;
  const queue = [];
  const runNext = () => {
    if (active >= limit || !queue.length) return;
    const { task, resolve, reject } = queue.shift();
    active += 1;
    Promise.resolve()
      .then(task)
      .then(resolve, reject)
      .finally(() => {
        active -= 1;
        runNext();
      });
  };
  return (task) => new Promise((resolve, reject) => {
    queue.push({ task, resolve, reject });
    runNext();
  });
}

export function createCachedLoader(loader, { ttlMs = 300000, maxEntries = 100, now = Date.now } = {}) {
  const cache = new Map();
  const inflight = new Map();
  return async (key) => {
    const cached = cache.get(key);
    if (cached && now() - cached.storedAt < ttlMs) return cached.value;
    if (inflight.has(key)) return inflight.get(key);
    const request = Promise.resolve()
      .then(() => loader(key))
      .then((value) => {
        cache.set(key, { value, storedAt: now() });
        while (cache.size > maxEntries) cache.delete(cache.keys().next().value);
        return value;
      })
      .finally(() => inflight.delete(key));
    inflight.set(key, request);
    return request;
  };
}

function externalLinks(query) {
  const sourceQuery = translatedQuery(query);
  const q = encodeURIComponent(sourceQuery);
  const ebayQ = q.replaceAll("%20", "+");
  return [
    {
      label: "130 Point",
      group: "免费成交/在售聚合",
      coverage: "sports-tcg-collectibles",
      note: "免费 comps，聚合 eBay、Fanatics Collect、Goldin、MySlabs、Pristine、Heritage 等。",
      kind: "sold",
      access: accessLabels.free,
      url: `https://130point.com/sales/?search=${q}`,
    },
    {
      label: "eBay Sold",
      group: "免费成交/在售聚合",
      coverage: "all",
      note: "已成交搜索，适合核实真实成交价；Best Offer 仍可能不透明。",
      kind: "sold",
      access: accessLabels.free,
      url: `https://www.ebay.com/sch/i.html?_nkw=${ebayQ}&LH_Sold=1&LH_Complete=1`,
    },
    {
      label: "eBay Active",
      group: "免费成交/在售聚合",
      coverage: "all",
      note: "当前挂牌和拍卖，不等于成交价。",
      kind: "active",
      access: accessLabels.free,
      url: `https://www.ebay.com/sch/i.html?_nkw=${ebayQ}`,
    },
    {
      label: "Mavin",
      group: "免费成交/在售聚合",
      coverage: "sports-tcg",
      note: "按关键词看 sold comps 和估值范围。",
      kind: "sold",
      access: accessLabels.free,
      url: `https://mavin.io/search?q=${q}`,
    },
    {
      label: "PriceCharting / SportsCardsPro",
      group: "历史价格/价格曲线",
      coverage: "sports-tcg-games",
      note: "历史价格页，适合 PSA/BGS/Raw 节点对比；自动抓取可能被限制。",
      kind: "history",
      access: accessLabels.free,
      url: `https://www.pricecharting.com/search-products?q=${ebayQ}&type=prices`,
    },
    {
      label: "Beckett Price Guide",
      group: "Topps/Panini 体育卡价格库",
      coverage: "sports-non-sports-tcg",
      note: "体育卡核心价格库，覆盖 Topps、Panini、Bowman、Donruss 等；完整价格需要订阅。",
      kind: "history",
      access: accessLabels.subscription,
      loginUrl: "https://www.beckett.com/login",
      url: "https://www.beckett.com/online-price-guide",
    },
    {
      label: "Trading Card Database",
      group: "Topps/Panini 体育卡图鉴",
      coverage: "sports-non-sports",
      note: "TCDB 图鉴/checklist，适合确认 Topps/Panini 年份、系列、编号、平行版本。",
      kind: "catalog",
      access: accessLabels.free,
      url: `https://www.tcdb.com/Search.cfm?Search=${q}`,
    },
    {
      label: "Cardboard Connection",
      group: "Topps/Panini 体育卡图鉴",
      coverage: "sports-non-sports",
      note: "新品 checklist、配置、平行/签字/物料卡说明，适合先确认卡是哪一版。",
      kind: "catalog",
      access: accessLabels.free,
      url: `https://www.cardboardconnection.com/?s=${q}`,
    },
    {
      label: "Topps Checklists",
      group: "Topps/Panini 官方图鉴",
      coverage: "topps-bowman",
      note: "Topps 官方 checklist，适合查 Topps/Bowman 系列和编号；不是成交价。",
      kind: "catalog",
      access: accessLabels.free,
      url: "https://www.topps.com/pages/checklists",
    },
    {
      label: "Topps Search",
      group: "Topps/Panini 官方图鉴",
      coverage: "topps-bowman",
      note: "Topps 官方站内搜索，适合查产品页、NOW 卡和在售新品。",
      kind: "active",
      access: accessLabels.free,
      url: `https://www.topps.com/search?q=${q}`,
    },
    {
      label: "Panini Checklists",
      group: "Topps/Panini 官方图鉴",
      coverage: "panini-donruss-prizm-select",
      note: "Panini America 官方 checklist，适合查 Panini/Donruss/Prizm/Select 系列和编号；不是成交价。",
      kind: "catalog",
      access: accessLabels.free,
      url: "https://www.paniniamerica.net/checklist.html",
    },
    {
      label: "Panini Products",
      group: "Topps/Panini 官方图鉴",
      coverage: "panini-donruss-prizm-select",
      note: "Panini America 产品入口，可查发售产品、配置和官方资料。",
      kind: "catalog",
      access: accessLabels.free,
      url: `https://www.paniniamerica.net/catalogsearch/result/?q=${q}`,
    },
    {
      label: "PSA Price Guide",
      group: "分级价格/Pop",
      coverage: "psa-graded",
      note: "PSA 官方价格指南，覆盖 PSA 认证收藏品。",
      kind: "history",
      access: accessLabels.free,
      url: "https://www.psacard.com/priceguide",
    },
    {
      label: "PSA Pop Report",
      group: "分级价格/Pop",
      coverage: "psa-graded",
      note: "查 PSA 分级数量，判断供给压力。",
      kind: "population",
      access: accessLabels.free,
      url: "https://www.psacard.com/pop",
    },
    {
      label: "TCGplayer",
      group: "TCG 原始卡市场",
      coverage: "pokemon-mtg-yugioh-lorcana",
      note: "美国 TCG 市场价、低中高价；API 需要既有授权。",
      kind: "active",
      access: accessLabels.api,
      loginUrl: "https://seller.tcgplayer.com/",
      url: `https://www.tcgplayer.com/search/all/product?q=${q}`,
    },
    {
      label: "Scryfall API",
      group: "免费公开 API",
      coverage: "magic",
      note: "Magic: The Gathering 免费公开 API，自动读取图鉴、图片和 USD/EUR 价格字段。",
      kind: "catalog-price",
      access: accessLabels.free,
      url: `https://scryfall.com/search?q=${q}`,
    },
    {
      label: "YGOPRODeck API",
      group: "免费公开 API",
      coverage: "yugioh",
      note: "Yu-Gi-Oh! 免费公开 API，自动读取卡图和 TCGplayer/eBay/Cardmarket 价格字段。",
      kind: "catalog-price",
      access: accessLabels.free,
      url: `https://ygoprodeck.com/card-database/?&fname=${q}`,
    },
    {
      label: "Cardmarket",
      group: "TCG 原始卡市场",
      coverage: "pokemon-mtg-yugioh-europe",
      note: "欧洲 TCG 市场，适合 Pokémon/MTG/Yu-Gi-Oh! 欧元价格。",
      kind: "active",
      access: accessLabels.free,
      url: `https://www.cardmarket.com/en/Pokemon/Products/Search?searchString=${q}`,
    },
    {
      label: "Collectr",
      group: "TCG 原始卡市场",
      coverage: "pokemon-onepiece-mtg-yugioh-lorcana",
      note: "TCG 投资组合与价格指南，覆盖 Pokémon、One Piece、MTG 等。",
      kind: "portfolio",
      access: accessLabels.login,
      url: "https://www.getcollectr.com/",
    },
    {
      label: "Pokellector",
      group: "TCG 卡片图鉴",
      coverage: "pokemon",
      note: "Pokémon 图鉴和系列索引，适合确认卡名、编号、版本。",
      kind: "catalog",
      access: accessLabels.free,
      url: `https://www.pokellector.com/search?criteria=${q}`,
    },
    {
      label: "Card Ladder",
      group: "付费历史库/研究工具",
      coverage: "sports-tcg",
      note: "Sales History 覆盖大量销售记录，完整历史和 Pop 通常需要 Pro。",
      kind: "history",
      access: accessLabels.subscription,
      loginUrl: "https://app.cardladder.com/login",
      url: "https://cardladder.com/",
    },
    {
      label: "Market Movers",
      group: "付费历史库/研究工具",
      coverage: "sports-tcg",
      note: "体育卡和 TCG 销售历史、价格图表、市场趋势。",
      kind: "history",
      access: accessLabels.subscription,
      loginUrl: "https://www.marketmoversapp.com/login",
      url: "https://www.marketmoversapp.com/",
    },
    {
      label: "HobbyCardIndex",
      group: "付费历史库/研究工具",
      coverage: "sports-tcg",
      note: "覆盖大规模 sports/TCG 价格索引和来源说明。",
      kind: "history",
      access: accessLabels.login,
      url: `https://hobbycardindex.com/?s=${q}`,
    },
    {
      label: "SNKRDUNK",
      group: "亚洲/日本市场",
      coverage: "pokemon-sneakers",
      note: "日本/亚洲市场挂售和成交参考，常需要登录或地区限制。",
      kind: "active",
      access: accessLabels.login,
      url: `https://snkrdunk.com/en/search/result?keyword=${q}`,
    },
    {
      label: "Card Hobby",
      group: "亚洲/中国市场",
      coverage: "sports-tcg",
      note: "国内卡牌交易参考，很多数据依赖登录态。",
      kind: "active",
      access: accessLabels.login,
      url: "https://www.cardhobby.com.cn/",
    },
    {
      label: "Fanatics Collect",
      group: "高端拍卖/托管市场",
      coverage: "sports-tcg-memorabilia",
      note: "原 PWCC 生态，含 Buy Now、Weekly/Premier Auction、Card Ladder 集成。",
      kind: "auction",
      access: accessLabels.login,
      url: `https://www.fanaticscollect.com/search?q=${q}`,
    },
    {
      label: "Goldin",
      group: "高端拍卖/托管市场",
      coverage: "high-end-collectibles",
      note: "高端收藏品、Weekly/Elite Auction；适合高价卡确认拍卖成交。",
      kind: "auction",
      access: accessLabels.login,
      url: `https://goldin.co/search?q=${q}`,
    },
    {
      label: "ALT",
      group: "高端拍卖/托管市场",
      coverage: "graded-sports-tcg",
      note: "高端卡成交、保险库和组合管理参考。",
      kind: "sales",
      access: accessLabels.login,
      url: `https://www.alt.xyz/search?q=${q}`,
    },
    {
      label: "COMC",
      group: "当前在售/寄售",
      coverage: "sports-tcg",
      note: "低中端长尾卡库存多，适合查当前寄售价。",
      kind: "active",
      access: accessLabels.free,
      url: `https://www.comc.com/Cards,sr,=${q}`,
    },
  ];
}

function accessRequirements() {
  return [
    {
      provider: "eBay Browse API",
      type: accessLabels.api,
      status: ebayClientId && ebayClientSecret ? "已配置，可自动读取当前挂牌样本" : "未配置，需要 EBAY_CLIENT_ID / EBAY_CLIENT_SECRET",
      action: "配置后端环境变量",
      url: "https://developer.ebay.com/api-docs/buy/browse/overview.html",
    },
    {
      provider: "Pokémon TCG API",
      type: accessLabels.api,
      status: pokemonTcgApiKey ? "已配置 API key" : "未配置 API key，当前仍可用公开额度/TCGdex 兜底",
      action: "可选配置 POKEMONTCG_API_KEY",
      url: "https://pokemontcg.io/",
    },
    {
      provider: "Scryfall API",
      type: accessLabels.free,
      status: "已接入免费公开 API；可自动返回 MTG 卡图和价格字段",
      action: "无需登录",
      url: "https://scryfall.com/docs/api",
    },
    {
      provider: "YGOPRODeck API",
      type: accessLabels.free,
      status: "已接入免费公开 API；可自动返回 Yu-Gi-Oh! 卡图和多个价格字段",
      action: "无需登录",
      url: "https://ygoprodeck.com/api-guide/",
    },
    {
      provider: "TCGplayer API",
      type: accessLabels.api,
      status: "需要 TCGplayer 授权，当前仅提供网页直达",
      action: "申请/接入 TCGplayer 授权",
      url: "https://seller.tcgplayer.com/",
    },
    {
      provider: "Beckett Online Price Guide",
      type: accessLabels.subscription,
      status: "完整 Topps/Panini 价格库需要登录和订阅",
      action: "登录或订阅 Beckett OPG",
      url: "https://www.beckett.com/online-price-guide",
    },
    {
      provider: "Card Ladder / Market Movers",
      type: accessLabels.subscription,
      status: "深度历史成交、走势图和指数通常需要付费账号",
      action: "登录订阅账号",
      url: "https://cardladder.com/",
    },
    {
      provider: "亚洲/拍卖市场",
      type: accessLabels.login,
      status: "SNKRDUNK、Card Hobby、Fanatics Collect、Goldin、ALT 的完整数据常依赖登录态",
      action: "在浏览器登录对应平台",
      url: "https://www.fanaticscollect.com/",
    },
  ];
}

function translatedQuery(query) {
  const raw = String(query || "").trim();
  for (const [cn, en] of pokemonAliases) {
    if (raw.includes(cn)) return en;
  }
  return raw;
}

function pokemonCatalogQuery(query) {
  const translated = translatedQuery(query)
    .replace(/\bpsa\s*10\b/gi, "")
    .replace(/\bbgs\s*(9\.5|10)\b/gi, "")
    .replace(/\bcgc\s*10\b/gi, "")
    .replace(/\braw\b/gi, "")
    .replace(/[#/]\d+[a-z]?/gi, " ")
    .replace(/\d+\/\d+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const alias = [...pokemonAliases.values()].find((name) => new RegExp(`\\b${name}\\b`, "i").test(translated));
  const name = alias || translated.split(/\s+/).slice(0, 3).join(" ");
  return name || translated || query;
}

export function pokemonCardNumber(query) {
  const raw = String(query || "");
  const fraction = raw.match(/\b(\d{1,4})\s*\/\s*\d{1,4}\b/);
  if (fraction) return fraction[1];
  const hash = raw.match(/#\s*(\d{1,4})\b/);
  if (hash) return hash[1];
  const trailing = raw.match(/\b(\d{1,4})\s*$/);
  return trailing?.[1] || "";
}

export function matchesPokemonNumber(cardNumber, expectedNumber) {
  if (!expectedNumber) return true;
  return String(Number.parseInt(cardNumber, 10)) === String(Number.parseInt(expectedNumber, 10));
}

function escapePokemonQuery(value) {
  return String(value || "").replaceAll('"', '\\"');
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

function amountToCny(price) {
  const value = Number(price?.value || 0);
  if (!value) return 0;
  if (price.currency === "USD") return Math.round(value * usdCny);
  if (price.currency === "CNY") return Math.round(value);
  return Math.round(value * usdCny);
}

async function readLocalCards() {
  const payload = JSON.parse(await fs.readFile(dataPath, "utf8"));
  return payload.cards || [];
}

function normalize(value) {
  return String(value || "").toLowerCase();
}

async function localMatches(query) {
  const q = normalize(query);
  if (!q) return [];
  const parts = q.split(/\s+/).filter(Boolean);
  const cards = await readLocalCards();
  return cards
    .map((card) => {
      const text = normalize([card.cnName, card.name, card.set, card.number, card.character, ...(card.keywords || [])].join(" "));
      const score = text.includes(q) ? 100 : parts.reduce((sum, part) => sum + (text.includes(part) ? 12 : 0), 0);
      return { ...card, matchScore: score };
    })
    .filter((card) => card.matchScore > 0)
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 8);
}

export async function fetchLocalCatalog(query) {
  const matches = await localMatches(query);
  return {
    ok: matches.length > 0,
    provider: "本地研究库兜底",
    message: matches.length
      ? `外部图鉴暂时无结果，已返回 ${matches.length} 条本地参考记录；该价格不是实时数据。`
      : "本地研究库也没有匹配记录。",
    query,
    totalCount: matches.length,
    cards: matches.map((card) => {
      const latestHistory = card.history?.at(-1);
      const sourceLink = (card.links || [])[0];
      return {
        id: `local-${card.id}`,
        name: [card.cnName, card.name].filter(Boolean).join(" / "),
        setName: card.set || "本地研究库",
        setSeries: card.category || "",
        releaseDate: latestHistory?.date || "",
        number: card.number || "",
        rarity: card.grade || "",
        imageSmall: "",
        imageLarge: "",
        sourceLabel: "本地估值，非实时",
        sourceUrl: sourceLink?.url || "",
        referencePriceCny: latestHistory?.priceCny || null,
      };
    }),
  };
}

async function getEbayToken() {
  if (!ebayClientId || !ebayClientSecret) {
    return { ok: false, message: "未配置 EBAY_CLIENT_ID / EBAY_CLIENT_SECRET，无法调用 eBay Browse API。" };
  }
  if (ebayTokenCache && ebayTokenCache.expiresAt > Date.now() + 60000) {
    return { ok: true, token: ebayTokenCache.token };
  }
  const basic = Buffer.from(`${ebayClientId}:${ebayClientSecret}`).toString("base64");
  const response = await fetchWithTimeout("https://api.ebay.com/identity/v1/oauth2/token", {
    method: "POST",
    headers: {
      authorization: `Basic ${basic}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      scope: "https://api.ebay.com/oauth/api_scope",
    }),
  });
  if (!response.ok) {
    return { ok: false, message: `eBay OAuth HTTP ${response.status}` };
  }
  const payload = await withTimeout(response.json(), 4000, "eBay OAuth JSON");
  ebayTokenCache = {
    token: payload.access_token,
    expiresAt: Date.now() + Number(payload.expires_in || 7200) * 1000,
  };
  return { ok: true, token: ebayTokenCache.token };
}

async function fetchEbayListings(query) {
  const tokenResult = await getEbayToken();
  if (!tokenResult.ok) {
    return {
      ok: false,
      provider: "eBay Browse API",
      message: tokenResult.message,
      quotes: [],
      samples: [],
    };
  }

  const url = new URL("https://api.ebay.com/buy/browse/v1/item_summary/search");
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "30");
  url.searchParams.set("filter", "buyingOptions:{FIXED_PRICE|AUCTION}");
  const response = await fetchWithTimeout(url, {
    headers: {
      authorization: `Bearer ${tokenResult.token}`,
      "x-ebay-c-marketplace-id": "EBAY_US",
    },
  });
  if (!response.ok) {
    return {
      ok: false,
      provider: "eBay Browse API",
      message: `eBay Browse API HTTP ${response.status}`,
      quotes: [],
      samples: [],
    };
  }

  const payload = await withTimeout(response.json(), 5000, "eBay listings JSON");
  const items = (payload.itemSummaries || [])
    .map((item) => {
      const price = item.currentBidPrice || item.price;
      const priceCny = amountToCny(price);
      return {
        title: item.title || "eBay listing",
        priceCny,
        currency: price?.currency || "USD",
        rawPrice: price?.value || "",
        url: item.itemWebUrl || "",
        imageUrl: item.image?.imageUrl || "",
        endAt: item.itemEndDate || null,
        location: [item.itemLocation?.city, item.itemLocation?.stateOrProvince, item.itemLocation?.country].filter(Boolean).join(", "),
      };
    })
    .filter((item) => item.priceCny > 0);

  const prices = items.map((item) => item.priceCny);
  return {
    ok: true,
    provider: "eBay Browse API",
    message: prices.length ? "已读取 eBay 当前挂牌/API 样本；这不是已成交价。" : "eBay API 没有返回可用价格。",
    quotes: prices.length
      ? [
          { platform: "eBay API", label: "当前最低挂牌", priceCny: Math.min(...prices), sampleCount: prices.length },
          { platform: "eBay API", label: "当前中位挂牌", priceCny: percentile(prices, 50), sampleCount: prices.length },
          { platform: "eBay API", label: "当前 75 分位", priceCny: percentile(prices, 75), sampleCount: prices.length },
        ]
      : [],
    samples: items.slice(0, 8).map((item) => ({
      date: item.endAt ? item.endAt.slice(0, 10) : new Date().toISOString().slice(0, 10),
      source: "eBay Active",
      priceCny: item.priceCny,
      note: item.title,
      url: item.url,
    })),
  };
}

async function fetchPriceChartingCandidates(query) {
  const url = externalLinks(query).find((link) => link.label.startsWith("PriceCharting")).url;
  try {
    const response = await fetchWithTimeout(url, {
      headers: {
        accept: "text/html",
        "user-agent": "Mozilla/5.0 CardResearchTemplate/1.0",
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await withTimeout(response.text(), 4000, "PriceCharting HTML");
    const candidates = [...html.matchAll(/href="(\/game\/[^"]+)">([^<]+)</g)]
      .map((match) => ({
        title: match[2].replace(/\s+/g, " ").trim(),
        url: `https://www.pricecharting.com${match[1]}`,
      }))
      .filter((item, index, arr) => item.title && arr.findIndex((other) => other.url === item.url) === index)
      .slice(0, 6);
    return {
      ok: true,
      provider: "PriceCharting",
      message: candidates.length
        ? "已解析 PriceCharting 搜索候选；点开候选可进入真实历史价格页。"
        : "PriceCharting 搜索页未解析到候选。",
      candidates,
    };
  } catch (error) {
    return {
      ok: false,
      provider: "PriceCharting",
      message: `PriceCharting 查询失败：${error.message}`,
      candidates: [],
    };
  }
}

function firstPrice(prices = {}) {
  const values = Object.values(prices).filter(Boolean);
  return values.find((price) => Number.isFinite(price.market)) || values.find((price) => Number.isFinite(price.mid)) || values[0] || null;
}

function cardSearchQuery(query) {
  return String(query || "")
    .replace(/\bpsa\s*10\b/gi, "")
    .replace(/\bbgs\s*(9\.5|10)\b/gi, "")
    .replace(/\bcgc\s*10\b/gi, "")
    .replace(/\braw\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchPokemonCatalog(query) {
  const name = pokemonCatalogQuery(query);
  const cardNumber = pokemonCardNumber(query);
  if (!name || /[\u4e00-\u9fff]/.test(name)) {
    return {
      ok: false,
      provider: "Pokémon TCG API",
      message: "暂未识别为可查询的英文宝可梦卡名；可以输入英文名、编号或补充中文别名。",
      query: name,
      cards: [],
    };
  }

  const url = new URL("https://api.pokemontcg.io/v2/cards");
  url.searchParams.set(
    "q",
    [`name:"${escapePokemonQuery(name)}"`, cardNumber ? `number:${cardNumber}` : ""].filter(Boolean).join(" ")
  );
  url.searchParams.set("page", "1");
  url.searchParams.set("pageSize", "80");
  url.searchParams.set("orderBy", "-set.releaseDate,number");
  url.searchParams.set(
    "select",
    "id,name,supertype,subtypes,set,number,rarity,images,tcgplayer,cardmarket"
  );

  const headers = { accept: "application/json" };
  if (pokemonTcgApiKey) headers["x-api-key"] = pokemonTcgApiKey;

  try {
    const response = await fetchWithTimeout(url, { headers });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await withTimeout(response.json(), 5000, "Pokémon TCG JSON");
    const cards = (payload.data || []).filter((card) => matchesPokemonNumber(card.number, cardNumber)).map((card) => {
      const tcgPrice = firstPrice(card.tcgplayer?.prices);
      return {
        id: card.id,
        name: card.name,
        supertype: card.supertype || "",
        subtypes: card.subtypes || [],
        setName: card.set?.name || "",
        setSeries: card.set?.series || "",
        releaseDate: card.set?.releaseDate || "",
        number: card.number || "",
        rarity: card.rarity || "",
        imageSmall: card.images?.small || "",
        imageLarge: card.images?.large || "",
        tcgplayerUrl: card.tcgplayer?.url || "",
        tcgplayerUpdatedAt: card.tcgplayer?.updatedAt || "",
        tcgplayerMarketUsd: tcgPrice?.market || null,
        tcgplayerMidUsd: tcgPrice?.mid || null,
        cardmarketUrl: card.cardmarket?.url || "",
        cardmarketUpdatedAt: card.cardmarket?.updatedAt || "",
        cardmarketTrendEur: card.cardmarket?.prices?.trendPrice || null,
        cardmarketAverageSellEur: card.cardmarket?.prices?.averageSellPrice || null,
      };
    });
    return {
      ok: true,
      provider: "Pokémon TCG API",
      message: `图鉴查询 ${name}，返回 ${cards.length}/${payload.totalCount || cards.length} 张。`,
      query: name,
      totalCount: payload.totalCount || cards.length,
      cards,
    };
  } catch (error) {
    const fallback = await fetchTcgdexCatalog(name, cardNumber);
    return {
      ...fallback,
      provider: fallback.ok ? "TCGdex 图鉴兜底" : "Pokémon TCG API / TCGdex",
      message: fallback.ok
        ? `Pokémon TCG API 返回 ${error.message}，已切到 TCGdex：${fallback.message}`
        : `Pokémon TCG API 返回 ${error.message}；${fallback.message}`,
    };
  }
}

async function getTcgdexCards() {
  if (tcgdexCardCache && Date.now() - tcgdexCardCache.fetchedAtMs < 12 * 60 * 60 * 1000) return tcgdexCardCache.cards;
  const response = await fetchWithTimeout("https://api.tcgdex.net/v2/en/cards", { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`TCGdex HTTP ${response.status}`);
  const cards = await withTimeout(response.json(), 15000, "TCGdex JSON");
  tcgdexCardCache = { cards, fetchedAtMs: Date.now() };
  return cards;
}

async function fetchTcgdexCatalog(name, cardNumber = "") {
  try {
    const allCards = await getTcgdexCards();
    const needle = normalize(name);
    const matches = allCards
      .filter((card) => normalize(card.name).includes(needle) && matchesPokemonNumber(card.localId, cardNumber))
      .sort((a, b) => String(b.id).localeCompare(String(a.id)))
      .slice(0, 120)
      .map((card) => ({
        id: card.id,
        name: card.name,
        supertype: "",
        subtypes: [],
        setName: `TCGdex ${String(card.id).split("-")[0] || ""}`,
        setSeries: "",
        releaseDate: "",
        number: card.localId || "",
        rarity: "",
        imageSmall: card.image ? `${card.image}/low.webp` : "",
        imageLarge: card.image ? `${card.image}/high.webp` : "",
        tcgplayerUrl: "",
        tcgplayerUpdatedAt: "",
        tcgplayerMarketUsd: null,
        tcgplayerMidUsd: null,
        cardmarketUrl: "",
        cardmarketUpdatedAt: "",
        cardmarketTrendEur: null,
        cardmarketAverageSellEur: null,
      }));
    return {
      ok: true,
      provider: "TCGdex",
      message: `图鉴查询 ${name}，返回 ${matches.length} 张匹配卡。`,
      query: name,
      totalCount: matches.length,
      cards: matches,
    };
  } catch (error) {
    return {
      ok: false,
      provider: "TCGdex",
      message: `TCGdex 图鉴查询失败：${error.message}`,
      query: name,
      totalCount: 0,
      cards: [],
    };
  }
}

function scryfallImage(card, size) {
  if (card.image_uris?.[size]) return card.image_uris[size];
  const face = (card.card_faces || []).find((item) => item.image_uris?.[size]);
  return face?.image_uris?.[size] || "";
}

async function fetchScryfallCatalog(query) {
  const clean = cardSearchQuery(query);
  if (!clean || /[\u4e00-\u9fff]/.test(clean)) {
    return {
      ok: false,
      provider: "Scryfall API",
      message: "未识别为英文 MTG 查询词，已跳过 Scryfall。",
      query: clean,
      totalCount: 0,
      cards: [],
      quotes: [],
    };
  }

  const url = new URL("https://api.scryfall.com/cards/search");
  url.searchParams.set("q", clean);
  url.searchParams.set("unique", "prints");
  url.searchParams.set("order", "released");
  try {
    const response = await fetchWithTimeout(url, {
      headers: {
        accept: "application/json",
        "user-agent": "CardResearchTemplate/1.0 (https://card-trading-api.47-82-148-17.sslip.io/card-research/)",
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await withTimeout(response.json(), 5000, "Scryfall JSON");
    const cards = (payload.data || []).slice(0, 80).map((card) => ({
      id: `scryfall-${card.id}`,
      sourceLabel: "Scryfall",
      name: card.name,
      supertype: "Magic",
      subtypes: [],
      setName: [card.set_name, card.set?.toUpperCase()].filter(Boolean).join(" · "),
      setSeries: "Magic: The Gathering",
      releaseDate: card.released_at || "",
      number: card.collector_number || "",
      rarity: card.rarity || "",
      imageSmall: scryfallImage(card, "small"),
      imageLarge: scryfallImage(card, "large") || scryfallImage(card, "normal"),
      sourceUrl: card.scryfall_uri || "",
      tcgplayerUrl: card.purchase_uris?.tcgplayer || "",
      cardmarketUrl: card.purchase_uris?.cardmarket || "",
      tcgplayerMarketUsd: numberOrNull(card.prices?.usd),
      cardmarketTrendEur: numberOrNull(card.prices?.eur),
    }));
    const prices = cards.map((card) => card.tcgplayerMarketUsd).filter(Number.isFinite);
    return {
      ok: true,
      provider: "Scryfall API",
      message: `MTG 图鉴/价格查询 ${clean}，返回 ${cards.length}/${payload.total_cards || cards.length} 张。`,
      query: clean,
      totalCount: payload.total_cards || cards.length,
      cards,
      quotes: prices.length
        ? [
            usdQuote("Scryfall", "MTG 最低 USD 价格", Math.min(...prices), prices.length),
            usdQuote("Scryfall", "MTG 中位 USD 价格", percentile(prices, 50), prices.length),
          ].filter(Boolean)
        : [],
    };
  } catch (error) {
    return {
      ok: false,
      provider: "Scryfall API",
      message: `Scryfall 查询失败：${error.message}`,
      query: clean,
      totalCount: 0,
      cards: [],
      quotes: [],
    };
  }
}

async function fetchYugiohCatalog(query) {
  const clean = cardSearchQuery(query);
  if (!clean || /[\u4e00-\u9fff]/.test(clean)) {
    return {
      ok: false,
      provider: "YGOPRODeck API",
      message: "未识别为英文 Yu-Gi-Oh! 查询词，已跳过 YGOPRODeck。",
      query: clean,
      totalCount: 0,
      cards: [],
      quotes: [],
    };
  }

  const url = new URL("https://db.ygoprodeck.com/api/v7/cardinfo.php");
  url.searchParams.set("fname", clean);
  try {
    const response = await fetchWithTimeout(url, { headers: { accept: "application/json" } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await withTimeout(response.json(), 5000, "YGOPRODeck JSON");
    const cards = (payload.data || []).slice(0, 80).map((card) => {
      const price = card.card_prices?.[0] || {};
      const image = card.card_images?.[0] || {};
      return {
        id: `ygoprodeck-${card.id}`,
        sourceLabel: "YGOPRODeck",
        name: card.name,
        supertype: "Yu-Gi-Oh!",
        subtypes: [card.type, card.race, card.attribute].filter(Boolean),
        setName: card.type || "Yu-Gi-Oh!",
        setSeries: "Yu-Gi-Oh!",
        releaseDate: "",
        number: String(card.id || ""),
        rarity: card.race || "",
        imageSmall: image.image_url_small || image.image_url || "",
        imageLarge: image.image_url || "",
        sourceUrl: card.ygoprodeck_url || "",
        tcgplayerMarketUsd: numberOrNull(price.tcgplayer_price),
        cardmarketTrendEur: numberOrNull(price.cardmarket_price),
        ebayMarketUsd: numberOrNull(price.ebay_price),
      };
    });
    const tcgPrices = cards.map((card) => card.tcgplayerMarketUsd).filter(Number.isFinite);
    const ebayPrices = cards.map((card) => card.ebayMarketUsd).filter(Number.isFinite);
    return {
      ok: true,
      provider: "YGOPRODeck API",
      message: `Yu-Gi-Oh! 图鉴/价格查询 ${clean}，返回 ${cards.length} 张。`,
      query: clean,
      totalCount: cards.length,
      cards,
      quotes: [
        tcgPrices.length ? usdQuote("YGOPRODeck", "TCGplayer 中位 USD", percentile(tcgPrices, 50), tcgPrices.length) : null,
        ebayPrices.length ? usdQuote("YGOPRODeck", "eBay 中位 USD", percentile(ebayPrices, 50), ebayPrices.length) : null,
      ].filter(Boolean),
    };
  } catch (error) {
    return {
      ok: false,
      provider: "YGOPRODeck API",
      message: `YGOPRODeck 查询失败：${error.message}`,
      query: clean,
      totalCount: 0,
      cards: [],
      quotes: [],
    };
  }
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "content-type",
  });
  res.end(JSON.stringify(body));
}

async function providerWithTimeout(promise, provider, category) {
  try {
    return await withTimeout(promise, researchSourceTimeoutMs, provider);
  } catch (error) {
    return {
      ok: false,
      provider,
      message: `${provider} 查询超时：${error.message}`,
      query: "",
      category,
      totalCount: 0,
      cards: [],
      quotes: [],
      candidates: [],
    };
  }
}

const limitResearch = createConcurrencyLimiter(researchConcurrency);

async function buildResearchPayload(query) {
  const checkedAt = new Date().toISOString();
  const category = classifyResearchQuery(query);
  const queryPokemon = category === "pokemon" || category === "generic";
  const queryMagic = category === "magic" || category === "generic";
  const queryYugioh = category === "yugioh" || category === "generic";
  const [ebay, priceCharting, pokemonCatalog, scryfallCatalog, yugiohCatalog] = await Promise.all([
    providerWithTimeout(fetchEbayListings(translatedQuery(query)), "eBay Browse API", category),
    providerWithTimeout(fetchPriceChartingCandidates(query), "PriceCharting", category),
    queryPokemon
      ? providerWithTimeout(fetchPokemonCatalog(query), "Pokémon TCG API", category)
      : Promise.resolve(skippedCatalog("Pokémon TCG API", category)),
    queryMagic
      ? providerWithTimeout(fetchScryfallCatalog(translatedQuery(query)), "Scryfall API", category)
      : Promise.resolve(skippedCatalog("Scryfall API", category)),
    queryYugioh
      ? providerWithTimeout(fetchYugiohCatalog(translatedQuery(query)), "YGOPRODeck API", category)
      : Promise.resolve(skippedCatalog("YGOPRODeck API", category)),
  ]);
  const localCatalog = queryPokemon && !(pokemonCatalog.cards || []).length
    ? await fetchLocalCatalog(query)
    : skippedCatalog("本地研究库兜底", category);
  const catalogCards = [
    ...(pokemonCatalog.cards || []),
    ...(localCatalog.cards || []),
    ...(scryfallCatalog.cards || []),
    ...(yugiohCatalog.cards || []),
  ];
  const catalogTotalCount =
    (pokemonCatalog.totalCount || 0) +
    (localCatalog.totalCount || 0) +
    (scryfallCatalog.totalCount || 0) +
    (yugiohCatalog.totalCount || 0);
  const providerQuotes = [
    ...(ebay.quotes || []),
    ...(scryfallCatalog.quotes || []),
    ...(yugiohCatalog.quotes || []),
  ];
  const providers = [pokemonCatalog, localCatalog, scryfallCatalog, yugiohCatalog, ebay, priceCharting];

  return {
    ok: true,
    query,
    category,
    checkedAt,
    links: externalLinks(query),
    requirements: accessRequirements(),
    providers,
    quotes: providerQuotes,
    samples: ebay.samples || [],
    catalogCards,
    catalogQuery: [pokemonCatalog.query, localCatalog.query, scryfallCatalog.query, yugiohCatalog.query]
      .filter(Boolean)
      .join(" / "),
    catalogTotalCount,
    priceChartingCandidates: priceCharting.candidates || [],
    notes: providers.map((provider) => provider.message),
  };
}

const loadResearch = createCachedLoader(
  (query) => limitResearch(() => buildResearchPayload(query)),
  { ttlMs: researchCacheMs, maxEntries: 100 }
);

export async function handleResearch(req, res, url) {
  const query = (url.searchParams.get("q") || "").trim();
  if (!query) {
    sendJson(res, 400, { ok: false, message: "Missing q" });
    return;
  }
  sendJson(res, 200, await loadResearch(query));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (req.method === "OPTIONS") {
        res.writeHead(204, {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET, OPTIONS",
          "access-control-allow-headers": "content-type",
        });
        res.end();
        return;
      }
      if (url.pathname === "/api/research") {
        await handleResearch(req, res, url);
        return;
      }

      const requested = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
      const filePath = path.normalize(path.join(root, requested));
      if (!filePath.startsWith(root)) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
      }
      const body = await fs.readFile(filePath);
      res.writeHead(200, {
        "content-type": mime.get(path.extname(filePath)) || "application/octet-stream",
        "cache-control": "no-store",
      });
      res.end(body);
    } catch (error) {
      if (error.code === "ENOENT") {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      res.writeHead(500);
      res.end(error.message);
    }
  });

  server.listen(port, host, () => {
    console.log(`Card research template running at http://${host}:${port}/`);
  });
}
