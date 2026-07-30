import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { collectSnkrdunk } from "./sources/snkrdunk.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const samplePath = path.join(root, "web/data/auctions.example.json");
const marketPath = path.join(root, "web/data/market-year.json");
const outputPath = path.resolve(process.env.LIVE_OUTPUT_PATH || path.join(root, "web/data/auctions.live.json"));
const docsOutputPath = path.join(root, "docs/data/auctions.live.json");
const captureDir = path.resolve(process.env.CAPTURE_DIR || path.join(root, "web/captures"));
const usdCny = Number(process.env.USD_CNY || 7.2);
const twdCny = Number(process.env.TWD_CNY || 0.22);
const jpyCny = Number(process.env.JPY_CNY || 0.049);
const maxPerQuery = Number(process.env.MAX_PER_QUERY || 8);
const minPsa10PriceCny = Number(process.env.MIN_PSA10_PRICE_CNY || 500);
const minOpportunityRoi = Number(process.env.MIN_OPPORTUNITY_ROI || 0.2);
const targetsPerRefresh = Math.max(1, Number(process.env.TARGETS_PER_REFRESH || 6));
const navigationTimeoutMs = Math.max(5000, Number(process.env.NAVIGATION_TIMEOUT_MS || 20000));
const captureSearchScreenshots = process.env.CAPTURE_SEARCH_SCREENSHOTS === "1";
const snapshotIntervalSeconds = Math.round(Number(process.env.REFRESH_MS || 60000) / 1000);
const browserStateDir = process.env.BROWSER_STATE_DIR
  ? path.resolve(process.env.BROWSER_STATE_DIR)
  : null;
const sessionBrowserCdpUrl = process.env.SESSION_BROWSER_CDP_URL || "";

const platformDefaults = {
  eBay: { feeRate: 0.13, paymentFeeRate: 0.03, shippingCny: 140 },
  ALT: { feeRate: 0.08, paymentFeeRate: 0.03, shippingCny: 120 },
  "Card Hobby": { feeRate: 0.05, paymentFeeRate: 0.01, shippingCny: 25 },
  "Fanatics Collect": { feeRate: 0.1, paymentFeeRate: 0.03, shippingCny: 140 },
  PokerColor: { feeRate: 0.03, paymentFeeRate: 0.01, shippingCny: 25 },
};

const targetOverrides = {
  "ptcg-mew-gold-star-101": {
    type: "热门宝可梦",
    category: "梦幻",
    cnName: "梦幻 Gold Star #101 PSA10",
    set: "Dragon Frontiers / 101/101",
    language: "英文",
    query: "Mew Gold Star 101/101 PSA 10 Dragon Frontiers",
    include: ["mew", "gold", "star"],
    anyNumber: ["101/101", "#101", " 101 "],
    exclude: ["mewtwo", "mew ex", "black star promo", "celebrations", "metal"],
  },
  "ptcg-umbreon-vmax-215": {
    type: "热门宝可梦",
    category: "月亮伊布",
    cnName: "月亮伊布 VMAX #215 异画 PSA10",
    set: "Evolving Skies / 215/203",
    language: "英文",
    query: "Umbreon VMAX 215/203 PSA 10 Evolving Skies",
    include: ["umbreon", "vmax"],
    anyNumber: ["215/203", "#215", " 215 "],
    exclude: ["v ", "vstar", "japanese", "korean", "chinese"],
  },
  "ptcg-gengar-vmax-271": {
    type: "热门宝可梦",
    category: "耿鬼",
    cnName: "耿鬼 VMAX #271 异画 PSA10",
    set: "Fusion Strike / 271/264",
    language: "英文",
    query: "Gengar VMAX 271/264 PSA 10 Fusion Strike",
    include: ["gengar", "vmax"],
    anyNumber: ["271/264", "#271", " 271 "],
    exclude: ["japanese", "korean", "chinese"],
  },
  "ptcg-rayquaza-vmax-218": {
    type: "热门宝可梦",
    category: "裂空坐",
    cnName: "裂空坐 VMAX #218 异画 PSA10",
    set: "Evolving Skies / 218/203",
    language: "英文",
    query: "Rayquaza VMAX 218/203 PSA 10 Evolving Skies",
    include: ["rayquaza", "vmax"],
    anyNumber: ["218/203", "#218", " 218 "],
    exclude: ["japanese", "korean", "chinese"],
  },
  "ptcg-pikachu-grey-felt-hat": {
    type: "热门宝可梦",
    category: "皮卡丘",
    cnName: "Pikachu with Grey Felt Hat #85 PSA10",
    set: "Pokemon Promo / 85",
    language: "英文",
    query: "Pikachu Grey Felt Hat 85 PSA 10 Van Gogh",
    include: ["pikachu", "grey", "felt", "hat"],
    anyNumber: ["#85", " 85 "],
    exclude: ["raw", "ungraded", "sealed", "poster"],
  },
  "ptcg-charizard-151-sar": {
    type: "热门宝可梦",
    category: "喷火龙",
    cnName: "喷火龙 ex SAR #201 日文 PSA10",
    set: "Japanese Scarlet & Violet 151 / 201/165",
    language: "日文",
    query: "Charizard ex 201/165 SAR PSA 10 Japanese 151",
    include: ["charizard", "ex"],
    anyNumber: ["201/165", "#201", " 201 "],
    exclude: ["english", "korean", "chinese", "promo"],
  },
  "ptcg-mew-ex-205-jp": {
    type: "热门宝可梦",
    category: "梦幻",
    cnName: "梦幻 ex SAR #205 日文 PSA10",
    set: "Japanese Scarlet & Violet 151 / 205/165",
    language: "日文",
    query: "Mew ex 205/165 SAR PSA 10 Japanese 151",
    include: ["mew", "ex"],
    anyNumber: ["205/165", "#205", " 205 "],
    exclude: ["mewtwo", "english", "korean", "chinese", "promo", "ultra-premium", "ultra premium", "metal", "en "],
  },
  "ptcg-leafeon-vmax-205": {
    type: "热门宝可梦",
    category: "叶伊布",
    cnName: "叶伊布 VMAX #205 异画 PSA10",
    set: "Evolving Skies / 205/203",
    language: "英文",
    query: "Leafeon VMAX 205/203 PSA 10 Evolving Skies",
    include: ["leafeon", "vmax"],
    anyNumber: ["205/203", "#205", " 205 "],
    exclude: ["japanese", "korean", "chinese"],
  },
  "ptcg-glaceon-vmax-209": {
    type: "热门宝可梦",
    category: "冰伊布",
    cnName: "冰伊布 VMAX #209 异画 PSA10",
    set: "Evolving Skies / 209/203",
    language: "英文",
    query: "Glaceon VMAX 209/203 PSA 10 Evolving Skies",
    include: ["glaceon", "vmax"],
    anyNumber: ["209/203", "#209", " 209 "],
    exclude: ["japanese", "korean", "chinese"],
  },
  "ptcg-sylveon-vmax-212": {
    type: "热门宝可梦",
    category: "仙子伊布",
    cnName: "仙子伊布 VMAX #212 异画 PSA10",
    set: "Evolving Skies / 212/203",
    language: "英文",
    query: "Sylveon VMAX 212/203 PSA 10 Evolving Skies",
    include: ["sylveon", "vmax"],
    anyNumber: ["212/203", "#212", " 212 "],
    exclude: ["japanese", "korean", "chinese"],
  },
  "ptcg-mewtwo-gx-76": {
    type: "热门宝可梦",
    category: "超梦",
    cnName: "超梦 GX Secret #76 PSA10",
    set: "Shining Legends / 76/73",
    language: "英文",
    query: "Mewtwo GX 76/73 Secret Rare PSA 10 Shining Legends",
    include: ["mewtwo", "gx"],
    anyNumber: ["76/73", "#76", " 76 "],
    exclude: ["mew & mewtwo", "tag team", "japanese", "korean", "chinese"],
  },
  "ptcg-espeon-vmax-270": {
    type: "热门宝可梦",
    category: "太阳伊布",
    cnName: "太阳伊布 VMAX #270 异画 PSA10",
    set: "Fusion Strike / 270/264",
    language: "英文",
    query: "Espeon VMAX 270/264 PSA 10 Fusion Strike",
    include: ["espeon", "vmax"],
    anyNumber: ["270/264", "#270", " 270 "],
    exclude: ["japanese", "korean", "chinese"],
  },
  "nba-wembanyama-topps-chrome-1": {
    type: "Basketball",
    category: "Wembanyama",
    cnName: "Wembanyama Topps Chrome #1 PSA10",
    set: "2023 Topps Chrome / 1",
    language: "英文",
    query: "2023 Topps Chrome Victor Wembanyama 1 PSA 10",
    include: ["wembanyama", "topps", "chrome"],
    anyNumber: ["#1", " 1 "],
    exclude: ["refractor", "sapphire", "pink", "blue", "green", "orange", "wave", "variation"],
  },
  "nba-lebron-topps-chrome-111": {
    type: "Basketball",
    category: "LeBron",
    cnName: "LeBron Topps Chrome #111 PSA10",
    set: "2003 Topps Chrome / 111",
    language: "英文",
    query: "2003 Topps Chrome LeBron James 111 PSA 10",
    include: ["lebron", "topps", "chrome"],
    anyNumber: ["#111", " 111 "],
    exclude: ["refractor", "black", "xfractor", "reprint", "tribute"],
  },
  "nba-kobe-topps-chrome-138": {
    type: "Basketball",
    category: "Kobe",
    cnName: "Kobe Topps Chrome #138 PSA10",
    set: "1996 Topps Chrome / 138",
    language: "英文",
    query: "1996 Topps Chrome Kobe Bryant 138 PSA 10",
    include: ["kobe", "topps", "chrome"],
    anyNumber: ["#138", " 138 "],
    exclude: ["refractor", "reprint", "finest", "stadium club"],
  },
  "nba-luka-prizm-280": {
    type: "Basketball",
    category: "Luka",
    cnName: "Luka Doncic Prizm #280 PSA10",
    set: "2018 Panini Prizm / 280",
    language: "英文",
    query: "2018 Panini Prizm Luka Doncic 280 PSA 10",
    include: ["luka", "prizm"],
    anyNumber: ["#280", " 280 "],
    exclude: ["silver", "green", "pink", "red", "blue", "optic", "select"],
  },
  "nfl-mahomes-prizm-269": {
    type: "Football",
    category: "Mahomes",
    cnName: "Mahomes Prizm #269 PSA10",
    set: "2017 Panini Prizm / 269",
    language: "英文",
    query: "2017 Panini Prizm Patrick Mahomes 269 PSA 10",
    include: ["mahomes", "prizm"],
    anyNumber: ["#269", " 269 "],
    exclude: ["silver", "green", "red", "blue", "optic", "select"],
  },
  "nfl-brady-bowman-chrome-236": {
    type: "Football",
    category: "Brady",
    cnName: "Tom Brady Bowman Chrome #236 PSA10",
    set: "2000 Bowman Chrome / 236",
    language: "英文",
    query: "2000 Bowman Chrome Tom Brady 236 PSA 10",
    include: ["brady", "bowman", "chrome"],
    anyNumber: ["#236", " 236 "],
    exclude: ["refractor", "preview", "reprint", "stadium"],
  },
  "nfl-josh-allen-prizm-205": {
    type: "Football",
    category: "Josh Allen",
    cnName: "Josh Allen Prizm #205 PSA10",
    set: "2018 Panini Prizm / 205",
    language: "英文",
    query: "2018 Panini Prizm Josh Allen 205 PSA 10",
    include: ["josh", "allen", "prizm"],
    anyNumber: ["#205", " 205 "],
    exclude: ["silver", "green", "red", "blue", "optic", "select"],
  },
  "nfl-cj-stroud-prizm-339": {
    type: "Football",
    category: "C.J. Stroud",
    cnName: "C.J. Stroud Prizm #339 PSA10",
    set: "2023 Panini Prizm / 339",
    language: "英文",
    query: "2023 Panini Prizm CJ Stroud 339 PSA 10",
    include: ["stroud", "prizm"],
    anyNumber: ["#339", " 339 "],
    exclude: ["silver", "green", "red", "blue", "orange", "pink", "disco", "ice", "lazer", "laser", "checker", "optic", "select", "variation"],
  },
  "op-nami-manga-op01-en": {
    type: "One Piece",
    category: "Nami",
    cnName: "Nami Manga OP01-016 英文 PSA10",
    set: "Romance Dawn / OP01-016",
    language: "英文",
    query: "Nami Manga OP01-016 English PSA 10 One Piece",
    include: ["nami", "manga"],
    anyNumber: ["op01-016", "op01 016", "016"],
    exclude: ["japanese", "jp", "chinese", "korean", "prb01", "premium booster", "premium bstr"],
  },
  "op-luffy-manga-op05-119": {
    type: "One Piece",
    category: "Luffy",
    cnName: "Luffy Manga OP05-119 PSA10",
    set: "Awakening of the New Era / OP05-119",
    language: "英文",
    query: "Monkey D Luffy Manga OP05-119 PSA 10 One Piece",
    include: ["luffy", "manga"],
    anyNumber: ["op05-119", "op05 119", "119"],
    exclude: ["don", "leader", "op09", "emperors", "japanese", "jp", "chinese", "korean"],
  },
  "op-zoro-manga-op06-118": {
    type: "One Piece",
    category: "Zoro",
    cnName: "Zoro Manga OP06-118 PSA10",
    set: "Wings of the Captain / OP06-118",
    language: "英文",
    query: "Roronoa Zoro Manga OP06-118 PSA 10 One Piece",
    include: ["zoro", "manga"],
    anyNumber: ["op06-118", "op06 118", "118"],
    exclude: ["japanese", "jp", "chinese", "korean", "prb01", "premium booster", "premium bstr"],
  },
  "op-ace-manga-op02-013": {
    type: "One Piece",
    category: "Ace",
    cnName: "Ace Manga OP02-013 PSA10",
    set: "Paramount War / OP02-013",
    language: "英文",
    query: "Portgas D Ace Manga OP02-013 PSA 10 One Piece",
    include: ["ace", "manga"],
    anyNumber: ["op02-013", "op02 013", "013"],
    exclude: ["japanese", "jp", "chinese", "korean"],
  },
};

function slug(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}

function stableHash(text) {
  let hash = 2166136261;
  for (const char of text) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function ebayListingId(url) {
  const itemId = String(url || "").match(/\/itm\/(?:[^/]+\/)?(\d{9,15})/)?.[1];
  return itemId ? `ebay:${itemId}` : null;
}

function ebaySearchUrl(query) {
  const url = new URL("https://www.ebay.com/sch/i.html");
  url.searchParams.set("_nkw", query);
  url.searchParams.set("_sop", "1");
  url.searchParams.set("LH_Auction", "1");
  return url.toString();
}

function expectedSaleCny(target) {
  return Math.round(target.currentUsd * usdCny * 0.92);
}

function parsePriceToCny(text) {
  if (!text) return 0;
  const cleaned = text.replace(/,/g, "");
  const match = cleaned.match(/(?:US\s*)?\$([\d.]+)|(?:JPY|JP¥)\s*([\d.]+)|[¥￥]\s*([\d.]+)|CNY\s*([\d.]+)|NT\$?\s*([\d.]+)|NTS\s*([\d.]+)/i);
  if (!match) return 0;
  if (match[1]) return Math.round(Number(match[1]) * usdCny);
  if (match[2]) return Math.round(Number(match[2]) * jpyCny);
  if (match[5] || match[6]) return Math.round(Number(match[5] || match[6] || 0) * twdCny);
  return Math.round(Number(match[3] || match[4] || 0));
}

function amountToCny(value, currency = "USD") {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  if (currency === "USD") return Math.round(amount * usdCny);
  if (currency === "JPY") return Math.round(amount * jpyCny);
  if (currency === "TWD") return Math.round(amount * twdCny);
  return Math.round(amount);
}

function parseAuctionEnd(text, capturedAt = Date.now()) {
  const value = String(text || "").toLowerCase();
  if (!value) return null;
  const days = Number(value.match(/(\d+)\s*(?:d|day|days|天)/)?.[1] || 0);
  const hours = Number(value.match(/(\d+)\s*(?:h|hr|hrs|hour|hours|小时|时)/)?.[1] || 0);
  const minutes = Number(value.match(/(\d+)\s*(?:m|min|mins|minute|minutes|分)/)?.[1] || 0);
  const durationMs = ((days * 24 + hours) * 60 + minutes) * 60000;
  return durationMs > 0 ? new Date(capturedAt + durationMs).toISOString() : null;
}

function titleMatchesTarget(title, target) {
  const lower = title.toLowerCase();
  if (lower.length < 32) return false;
  if (!/psa\s*(?:gem mint\s*)?10|psa10/i.test(title)) return false;
  if (/\b(?:cgc|bgs|sgc|ace|raw|ungraded|reprint|proxy|custom|digital)\b/i.test(title)) return false;
  if (target.exclude?.some((term) => lower.includes(term.toLowerCase()))) return false;
  if (!target.include?.every((term) => lower.includes(term.toLowerCase()))) return false;
  if (!target.anyNumber?.length) return true;
  return target.anyNumber.some((term) => lower.includes(term.toLowerCase()));
}

function enrichFinancials(item) {
  const fees =
    item.currentBidCny * item.feeRate +
    item.currentBidCny * item.paymentFeeRate +
    item.shippingCny +
    item.taxCny +
    item.otherCostCny;
  const totalCostCny = item.currentBidCny + fees;
  const actualProfitCny = item.expectedSaleCny - totalCostCny;
  const roi = totalCostCny > 0 ? actualProfitCny / totalCostCny : 0;
  return {
    ...item,
    feesCny: Math.round(fees),
    totalCostCny: Math.round(totalCostCny),
    actualProfitCny: Math.round(actualProfitCny),
    roi,
  };
}

async function launchBrowser() {
  if (sessionBrowserCdpUrl) {
    try {
      return {
        browser: await chromium.connectOverCDP(sessionBrowserCdpUrl),
        shared: true,
      };
    } catch {
      // Fall back to the isolated collector browser while the session desktop starts.
    }
  }
  try {
    return {
      browser: await chromium.launch({ channel: "chrome", headless: true }),
      shared: false,
    };
  } catch {
    return {
      browser: await chromium.launch({ headless: true }),
      shared: false,
    };
  }
}

async function newPlatformContext(browser, platform) {
  const options = { viewport: { width: 1440, height: 1100 } };
  if (!browserStateDir) return browser.newContext(options);
  const storageState = path.join(browserStateDir, `${platform}.json`);
  try {
    await fs.access(storageState);
    return await browser.newContext({ ...options, storageState });
  } catch {
    return browser.newContext(options);
  }
}

async function scrapeEbay(page, target) {
  const url = ebaySearchUrl(target.query);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: navigationTimeoutMs });
  await page.waitForTimeout(750);
  const capturePath = path.join(captureDir, `ebay-${slug(target.query)}.png`);
  if (captureSearchScreenshots) {
    await page.screenshot({ path: capturePath, fullPage: false });
  }
  let rows = await page.$$eval(".s-item, .s-card, [data-testid='item-card']", (items) =>
    items.slice(0, 10).map((item) => ({
      title:
        item.querySelector(".s-item__title, .s-card__title, [data-testid='item-title']")?.textContent?.trim() || "",
      price:
        item.querySelector(".s-item__price, .s-card__price, [data-testid='item-price']")?.textContent?.trim() || "",
      end:
        item.querySelector(".s-item__time-left, .s-card__time-left, [data-testid='item-time-left']")?.textContent?.trim() || "",
      url:
        item.querySelector("a.s-item__link, a.s-card__link, a[data-testid='item-link'], a[href*='/itm/']")?.href || "",
      imageUrl:
        item.querySelector(".s-item__image img, .s-card__image img, [data-testid='item-image'] img")?.currentSrc ||
        item.querySelector(".s-item__image img, .s-card__image img, [data-testid='item-image'] img")?.src ||
        "",
      shippingFrom:
        item.querySelector(".s-item__location")?.textContent?.replace(/^from\s+/i, "").trim() ||
        item.querySelector(".s-item__itemLocation")?.textContent?.replace(/^from\s+/i, "").trim() ||
        "",
    }))
  );
  if (rows.length === 0) {
    const text = await page.locator("body").innerText({ timeout: 10000 }).catch(() => "");
    const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
    const parsed = [];
    for (let i = 0; i < lines.length; i++) {
      const nearby = lines.slice(Math.max(0, i - 2), Math.min(lines.length, i + 4)).join(" ");
      const priceCny = parsePriceToCny(lines[i]);
      if (
        /^(?:NT\$|NTS|US\s*\$|\$|JPY|JP¥|¥|CNY)/i.test(lines[i]) &&
        priceCny >= minPsa10PriceCny &&
        !/delivery|shipping|estimated|postage|运费|配送/i.test(nearby)
      ) {
        const title = lines.slice(Math.max(0, i - 4), i).reverse().find((line) => /psa|pokemon|charizard|rayquaza|umbreon|gengar|mew|mewtwo|pikachu|leafeon|glaceon|sylveon|espeon|wembanyama|lebron|kobe|luka|mahomes|brady|josh allen|stroud|nami|luffy|zoro|ace|one piece/i.test(line)) || target.cardName;
        parsed.push({
          title,
          price: lines[i],
          end: lines.slice(i + 1, i + 4).join(" "),
          url,
        });
      }
    }
    rows = parsed;
  }
  const verified = [];
  const candidates = [];
  rows
    .filter((row) => titleMatchesTarget(row.title, target) && parsePriceToCny(row.price) >= minPsa10PriceCny)
    .slice(0, maxPerQuery)
    .forEach((row) => {
      const capturedAt = new Date();
      const currentBidCny = parsePriceToCny(row.price);
      const defaults = platformDefaults.eBay;
      const sourceListingId = ebayListingId(row.url || url);
      const verificationIssues = [
        !sourceListingId && "缺少商品 ID",
        (!row.url || row.url === url) && "缺少商品直达链接",
        !row.imageUrl && "缺少原图",
      ].filter(Boolean);
      const base = {
        ...target,
        sourceListingId,
        psaCert: "PSA 10",
        platform: "eBay",
        currentBidCny,
        expectedSaleCny: expectedSaleCny(target),
        feeRate: defaults.feeRate,
        paymentFeeRate: defaults.paymentFeeRate,
        shippingCny: defaults.shippingCny,
        taxCny: 0,
        otherCostCny: 30,
        holdingStartAt: capturedAt.toISOString(),
        auctionStartAt: null,
        auctionEndAt: parseAuctionEnd(row.end, capturedAt.getTime()),
        shippingFrom: row.shippingFrom || null,
        url: row.url || url,
        imageUrl: row.imageUrl,
        sourceTitle: row.title,
        sourcePriceText: row.price,
        sourceEndText: row.end,
        screenshot: captureSearchScreenshots ? `/captures/${path.basename(capturePath)}` : null,
        lastCapturedAt: capturedAt.toISOString(),
      };
      if (verificationIssues.length) {
        candidates.push({
          ...base,
          id: `${target.id}-ebay-candidate-${stableHash(`${row.title}|${row.price}|${row.end}`)}`,
          status: "待核验/eBay搜索结果",
          verificationIssues,
          searchUrl: url,
        });
      } else {
        verified.push({
          ...base,
          id: `${target.id}-${sourceListingId.replace(":", "-")}`,
          status: "实时/eBay商品页",
        });
      }
    });
  return { verified, candidates };
}

function fanaticsSearchUrl(query) {
  const url = new URL("https://www.fanaticscollect.com/marketplace");
  url.searchParams.set("type", "WEEKLY");
  url.searchParams.set("q", query);
  return url.toString();
}

function cardHobbyKeyword(query) {
  return [...query].map((char) => {
    if (/[A-Za-z0-9@*_+\-./]/.test(char)) return char;
    const code = char.charCodeAt(0);
    return code < 256
      ? `%${code.toString(16).toUpperCase().padStart(2, "0")}`
      : `%u${code.toString(16).toUpperCase().padStart(4, "0")}`;
  }).join("");
}

function cardHobbySearchUrl(query) {
  return `https://www.cardhobby.com.cn/market/search?keyword=${cardHobbyKeyword(query)}&searchtype=1`;
}

function marketplaceListing(target, platform, row, defaults) {
  const capturedAt = new Date();
  return {
    ...target,
    sourceListingId: row.sourceListingId,
    psaCert: "PSA 10",
    platform,
    currentBidCny: parsePriceToCny(row.price),
    expectedSaleCny: expectedSaleCny(target),
    feeRate: defaults.feeRate,
    paymentFeeRate: defaults.paymentFeeRate,
    shippingCny: row.shippingCny ?? defaults.shippingCny,
    taxCny: 0,
    otherCostCny: platform === "Card Hobby" ? 10 : 30,
    holdingStartAt: capturedAt.toISOString(),
    auctionStartAt: null,
    auctionEndAt: parseAuctionEnd(row.end, capturedAt.getTime()),
    shippingFrom: row.shippingFrom,
    url: row.url,
    imageUrl: row.imageUrl || "",
    sourceTitle: row.title,
    sourcePriceText: row.price,
    sourceEndText: row.end,
    bidCount: row.bidCount || null,
    lastCapturedAt: capturedAt.toISOString(),
  };
}

async function scrapeFanatics(page, target) {
  const searchUrl = fanaticsSearchUrl(target.query);
  await page.goto(searchUrl, {
    waitUntil: "domcontentloaded",
    timeout: navigationTimeoutMs,
  });
  await page.waitForTimeout(3000);
  const rows = await page.$$eval("a[href*='/weekly/']", (links) => {
    const seen = new Set();
    return links.flatMap((link) => {
      const url = link.href;
      if (!url || seen.has(url)) return [];
      seen.add(url);
      let box = link;
      for (let depth = 0; depth < 8 && box.parentElement; depth += 1) {
        box = box.parentElement;
        const text = box.innerText || "";
        if (/\$[\d,]+/.test(text) && /\d+\s*bids?/i.test(text)) break;
      }
      const text = (box.innerText || "").replace(/\s+/g, " ").trim();
      const image = box.querySelector("img");
      const listingId = new URL(url).pathname.split("/")[2] || "";
      return [{
        title: (link.textContent || "").replace(/\s+/g, " ").trim(),
        price: text.match(/\$[\d,.]+/)?.[0] || "",
        end: text.match(/\d+\s*d(?:ays?)?\s*\d+\s*h(?:ours?)?(?:\s*\d+\s*m(?:in(?:ute)?s?)?)?/i)?.[0] || "",
        bidCount: Number(text.match(/(\d+)\s*bids?/i)?.[1] || 0),
        sourceListingId: listingId ? `fanatics:${listingId}` : null,
        url,
        imageUrl:
          image?.currentSrc ||
          image?.src ||
          image?.getAttribute("data-src") ||
          "",
      }];
    });
  });
  return rows
    .filter((row) =>
      titleMatchesTarget(row.title, target) &&
      parsePriceToCny(row.price) >= minPsa10PriceCny
    )
    .slice(0, maxPerQuery)
    .map((row) => ({
      ...marketplaceListing(
        target,
        "Fanatics Collect",
        {
          ...row,
          shippingCny: platformDefaults["Fanatics Collect"].shippingCny,
          shippingFrom: "美国 / Fanatics Collect Vault",
        },
        platformDefaults["Fanatics Collect"]
      ),
      searchUrl,
    }));
}

async function scrapeCardHobby(page, target) {
  const queries = [target.query, target.cnName].filter(
    (query, index, values) => query && values.indexOf(query) === index
  );
  let rows = [];
  let searchUrl = cardHobbySearchUrl(queries[0]);
  for (const query of queries) {
    searchUrl = cardHobbySearchUrl(query);
    await page.goto(searchUrl, {
      waitUntil: "domcontentloaded",
      timeout: navigationTimeoutMs,
    });
    await page.waitForTimeout(1800);
    rows = await page.$$eval("a[href*='/market/item/']", (links) => {
      const seen = new Set();
      return links.flatMap((link) => {
        const url = link.href;
        if (!url || seen.has(url)) return [];
        seen.add(url);
        const box = link.closest(".el-card") || link.parentElement;
        const text = (box?.innerText || link.innerText || "")
          .replace(/\s+/g, " ")
          .trim();
        const image = box?.querySelector("img");
        const listingId = new URL(url).pathname.match(/\/market\/item\/(\d+)/)?.[1];
        const price = text.match(/[￥¥]\s*[\d,.]+/)?.[0] || "";
        const shipping = text.match(/运费[：:]\s*[￥¥]\s*([\d,.]+)/);
        const end =
          text.match(/(?:(?:\d+\s*天)?\s*(?:\d+\s*(?:小时|时))?\s*)?\d+\s*分(?:钟)?\s*\d+\s*秒/)?.[0] ||
          "";
        const title = text.split(/[￥¥]\s*[\d,.]+/)[0]?.trim() || "";
        return [{
          title,
          price,
          end,
          bidCount: Number(text.match(/(\d+)\s*次竞价/)?.[1] || 0),
          shippingCny: shipping ? Number(shipping[1].replace(/,/g, "")) : null,
          shippingFrom: "中国",
          sourceListingId: listingId ? `cardhobby:${listingId}` : null,
          url,
          imageUrl:
            image?.currentSrc ||
            image?.src ||
            image?.getAttribute("data-src") ||
            "",
        }];
      });
    });
    if (rows.some((row) => titleMatchesTarget(row.title, target))) break;
  }
  return rows
    .filter((row) =>
      titleMatchesTarget(row.title, target) &&
      parsePriceToCny(row.price) >= minPsa10PriceCny
    )
    .slice(0, maxPerQuery)
    .map((row) => ({
      ...marketplaceListing(
        target,
        "Card Hobby",
        row,
        platformDefaults["Card Hobby"]
      ),
      searchUrl,
    }));
}

async function collectLoggedMarketplaces(targets, existingBrowserSession = null) {
  const checkedAt = new Date().toISOString();
  const platforms = [
    {
      id: "fanatics",
      name: "Fanatics Collect",
      scrape: scrapeFanatics,
    },
    {
      id: "cardhobby",
      name: "Card Hobby",
      scrape: scrapeCardHobby,
    },
  ];
  const rows = [];
  const candidates = [];
  const errors = [];
  const browserSession = existingBrowserSession || await launchBrowser();
  const ownsBrowserSession = !existingBrowserSession;
  const context = browserSession.shared
    ? browserSession.browser.contexts()[0]
    : await browserSession.browser.newContext({
        viewport: { width: 1440, height: 1100 },
      });

  for (const platform of platforms) {
    const page = await context.newPage();
    await page.route("**/*", (route) => {
      const resourceType = route.request().resourceType();
      return ["image", "media", "font"].includes(resourceType)
        ? route.abort()
        : route.continue();
    });
    let completed = 0;
    for (const target of targets) {
      try {
        const listings = await platform.scrape(page, target);
        for (const listing of listings) {
          const verificationIssues = [
            !listing.sourceListingId && "缺少商品 ID",
            !listing.url && "缺少商品直达链接",
            !listing.imageUrl && "缺少原图",
            !listing.auctionEndAt && "缺少竞价结束时间",
            !listing.auctionStartAt && "缺少竞价开始时间",
          ].filter(Boolean);
          const listingId =
            listing.sourceListingId?.split(":").at(-1) ||
            stableHash(`${listing.sourceTitle}|${listing.currentBidCny}`);
          if (verificationIssues.length) {
            candidates.push({
              ...listing,
              id: `${target.id}-${platform.id}-candidate-${listingId}`,
              status: `待核验/${platform.name}登录页面`,
              verificationIssues,
            });
          } else {
            rows.push({
              ...listing,
              id: `${target.id}-${platform.id}-${listingId}`,
              status: `实时/${platform.name}登录页面`,
            });
          }
        }
        completed += 1;
      } catch (error) {
        errors.push({
          platformId: platform.id,
          targetId: target.id,
          message: error.message,
        });
      }
    }
    await page.close().catch(() => {});
    platform.completed = completed;
  }

  if (!browserSession.shared) {
    await context.close();
    if (ownsBrowserSession) {
      await browserSession.browser.close();
    }
  }
  return {
    rows,
    candidates,
    errors,
    statuses: platforms.map((platform) => {
      const platformRows = rows.filter((row) => row.platform === platform.name);
      const platformCandidates = candidates.filter(
        (row) => row.platform === platform.name
      );
      const platformErrors = errors.filter(
        (error) => error.platformId === platform.id
      );
      return {
        id: platform.id,
        name: platform.name,
        connected: platform.completed > 0,
        checkedAt,
        count: platformRows.length,
        candidateCount: platformCandidates.length,
        queryCount: platform.completed,
        errorCount: platformErrors.length,
        message: platformErrors.length
          ? `${platformErrors.length} 个检索失败`
          : "登录页面抓取完成",
      };
    }),
  };
}

async function getEbayToken() {
  if (!process.env.EBAY_CLIENT_ID || !process.env.EBAY_CLIENT_SECRET) return null;
  const credentials = Buffer.from(`${process.env.EBAY_CLIENT_ID}:${process.env.EBAY_CLIENT_SECRET}`).toString("base64");
  const response = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
    method: "POST",
    headers: {
      authorization: `Basic ${credentials}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      scope: "https://api.ebay.com/oauth/api_scope",
    }),
  });
  if (!response.ok) throw new Error(`eBay OAuth HTTP ${response.status}`);
  return (await response.json()).access_token;
}

async function collectEbayApi(targets) {
  const token = await getEbayToken();
  if (!token) return null;
  const rows = [];
  const candidates = [];
  const errors = [];
  let queryCount = 0;
  for (const target of targets) {
    try {
      const url = new URL("https://api.ebay.com/buy/browse/v1/item_summary/search");
      url.searchParams.set("q", target.query);
      url.searchParams.set("limit", String(maxPerQuery));
      url.searchParams.set("filter", "buyingOptions:{AUCTION}");
      const response = await fetch(url, {
        headers: {
          authorization: `Bearer ${token}`,
          "x-ebay-c-marketplace-id": "EBAY_US",
        },
      });
      if (!response.ok) throw new Error(`Browse API HTTP ${response.status}`);
      const payload = await response.json();
      queryCount += 1;
      for (const item of payload.itemSummaries || []) {
        const listingId = String(item.legacyItemId || item.itemId || "").match(/\d{9,15}/)?.[0];
        const price = item.currentBidPrice || item.price;
        const currentBidCny = amountToCny(price?.value, price?.currency);
        if (currentBidCny < minPsa10PriceCny || !titleMatchesTarget(item.title || "", target)) {
          continue;
        }
        const checkedAt = new Date().toISOString();
        const verificationIssues = [
          !listingId && "缺少商品 ID",
          !item.itemWebUrl && "缺少商品直达链接",
          !item.image?.imageUrl && "缺少原图",
        ].filter(Boolean);
        const base = {
          ...target,
          sourceListingId: listingId ? `ebay:${listingId}` : null,
          psaCert: "PSA 10",
          platform: "eBay",
          currentBidCny,
          expectedSaleCny: expectedSaleCny(target),
          feeRate: platformDefaults.eBay.feeRate,
          paymentFeeRate: platformDefaults.eBay.paymentFeeRate,
          shippingCny: platformDefaults.eBay.shippingCny,
          taxCny: 0,
          otherCostCny: 30,
          holdingStartAt: checkedAt,
          auctionStartAt: item.itemCreationDate || null,
          auctionEndAt: item.itemEndDate || null,
          shippingFrom: [item.itemLocation?.city, item.itemLocation?.stateOrProvince, item.itemLocation?.country]
            .filter(Boolean)
            .join(", ") || null,
          url: item.itemWebUrl || ebaySearchUrl(target.query),
          imageUrl: item.image?.imageUrl || "",
          sourceTitle: item.title,
          sourcePriceText: `${price.currency} ${price.value}`,
          sourceEndText: "",
          lastCapturedAt: checkedAt,
        };
        if (verificationIssues.length) {
          candidates.push({
            ...base,
            id: `${target.id}-ebay-api-candidate-${stableHash(`${item.title}|${price.currency}|${price.value}`)}`,
            status: "待核验/eBay Browse API",
            verificationIssues,
            searchUrl: ebaySearchUrl(target.query),
          });
        } else {
          rows.push({
            ...base,
            id: `${target.id}-ebay-${listingId}`,
            status: "实时/eBay Browse API",
          });
        }
      }
    } catch (error) {
      errors.push({ targetId: target.id, message: error.message });
    }
  }
  return { rows, candidates, errors, queryCount, mode: "api" };
}

function unavailableSourceStatuses(checkedAt) {
  return [
    ["alt", "ALT", "需要已登录的数据接口"],
  ].map(([id, name, message]) => ({ id, name, connected: false, checkedAt, count: 0, message }));
}

async function main() {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.mkdir(captureDir, { recursive: true });
  const sample = JSON.parse(await fs.readFile(samplePath, "utf8"));
  const market = JSON.parse(await fs.readFile(marketPath, "utf8"));
  const allTargets = market.cards
    .filter((card) => targetOverrides[card.id] && card.currentUsd > 0)
    .map((card) => ({
      ...targetOverrides[card.id],
      id: card.id,
      cardName: card.cardName,
      currentUsd: card.currentUsd,
      sourceName: card.sourceName,
      sourceUrl: card.sourceUrl,
      priceConfidence: card.confidence,
    }));
  const batchCount = Math.max(1, Math.ceil(allTargets.length / targetsPerRefresh));
  const refreshRunId = Math.max(1, Number(process.env.REFRESH_RUN_ID || 1));
  const batchIndex = (refreshRunId - 1) % batchCount;
  const targets = allTargets.slice(
    batchIndex * targetsPerRefresh,
    (batchIndex + 1) * targetsPerRefresh
  );
  const previousPayload = await fs.readFile(outputPath, "utf8").then(JSON.parse).catch(() => ({ auctions: [], candidates: [] }));
  const auctions = [];
  const candidates = [];
  const ebayErrors = [];
  let ebayQueriesCompleted = 0;
  let ebayMode = "browser";
  let activeBrowserSession = null;
  const ebayApi = await collectEbayApi(targets);
  if (ebayApi) {
    auctions.push(...ebayApi.rows);
    candidates.push(...ebayApi.candidates);
    ebayErrors.push(...ebayApi.errors);
    ebayQueriesCompleted = ebayApi.queryCount;
    ebayMode = ebayApi.mode;
  } else {
    const browserSession = await launchBrowser();
    activeBrowserSession = browserSession;
    const { browser } = browserSession;
    const context = browserSession.shared
      ? browser.contexts()[0]
      : await newPlatformContext(browser, "ebay");
    const page = await context.newPage();
    await page.route("**/*", (route) => {
      const resourceType = route.request().resourceType();
      return ["image", "media", "font"].includes(resourceType)
        ? route.abort()
        : route.continue();
    });
    for (const target of targets) {
      try {
        const ebayResult = await scrapeEbay(page, target);
        auctions.push(...ebayResult.verified);
        candidates.push(...ebayResult.candidates);
        ebayQueriesCompleted += 1;
      } catch (error) {
        ebayErrors.push({ targetId: target.id, message: error.message });
      }
    }
    await page.close();
    if (!browserSession.shared) {
      await context.close();
    }
  }

  const snkrdunk = await collectSnkrdunk({
    targets,
    rates: { usdCny, twdCny, jpyCny },
    expectedSaleCny,
  });
  auctions.push(...snkrdunk.rows);
  const loggedMarketplaces = await collectLoggedMarketplaces(
    targets,
    activeBrowserSession
  );
  if (activeBrowserSession && !activeBrowserSession.shared) {
    await activeBrowserSession.browser.close();
  }
  auctions.push(...loggedMarketplaces.rows);
  candidates.push(...loggedMarketplaces.candidates);
  const refreshedTargetIds = new Set(targets.map((target) => target.id));
  const failedEbayTargetIds = new Set(ebayErrors.map((error) => error.targetId));
  const failedLoggedTargets = new Set(
    loggedMarketplaces.errors.map(
      (error) => `${error.platformId}:${error.targetId}`
    )
  );
  const refreshedTargetIdFor = (row) =>
    [...refreshedTargetIds].find((targetId) =>
      row.id === targetId || String(row.id || "").startsWith(`${targetId}-`)
    );
  const shouldRetainPrevious = (row) => {
    const targetId = refreshedTargetIdFor(row);
    if (!targetId) return true;
    if (row.platform === "eBay") return failedEbayTargetIds.has(targetId);
    if (row.platform === "SNKRDUNK") return !snkrdunk.status.connected;
    if (row.platform === "Fanatics Collect") {
      return failedLoggedTargets.has(`fanatics:${targetId}`);
    }
    if (row.platform === "Card Hobby") {
      return failedLoggedTargets.has(`cardhobby:${targetId}`);
    }
    return false;
  };
  auctions.push(
    ...(previousPayload.auctions || []).filter(shouldRetainPrevious)
  );
  candidates.push(
    ...(previousPayload.candidates || []).filter(shouldRetainPrevious)
  );
  if (auctions.length === 0 && candidates.length === 0) {
    const hasPreviousSnapshot =
      (previousPayload.auctions || []).length > 0 || (previousPayload.candidates || []).length > 0;
    if (!hasPreviousSnapshot) {
      throw new Error(`No listings collected and no previous snapshot is available. eBay errors: ${ebayErrors.length}`);
    }
    const lastAttemptAt = new Date().toISOString();
    const message = `本轮未获取到新商品，已保留上一份数据（eBay ${ebayErrors.length} 个检索失败）`;
    const preservedPayload = {
      ...previousPayload,
      mode: "live",
      snapshotIntervalSeconds,
      dataStale: true,
      lastAttemptAt,
      lastAttemptMessage: message,
      sources: (previousPayload.sources || []).map((source) =>
        source.id === "ebay"
          ? {
              ...source,
              connected: false,
              checkedAt: lastAttemptAt,
              errorCount: ebayErrors.length,
              message,
            }
          : source
      ),
    };
    await fs.writeFile(outputPath, JSON.stringify(preservedPayload, null, 2));
    console.log(JSON.stringify({ preserved: true, message, outputPath }));
    return;
  }

  const previousByListing = new Map(
    (previousPayload.auctions || [])
      .filter((row) => row.sourceListingId && row.currentBidCny > 0)
      .map((row) => [row.sourceListingId, row])
  );
  const enrichedAuctions = auctions.map((item) => {
    const previous = previousByListing.get(item.sourceListingId);
    const priceChangeCny = previous ? item.currentBidCny - previous.currentBidCny : null;
    return enrichFinancials({
      ...item,
      holdingStartAt: previous?.holdingStartAt || item.holdingStartAt,
      previousBidCny: previous?.currentBidCny ?? null,
      priceChangeCny,
      priceChangePct: previous?.currentBidCny > 0 ? priceChangeCny / previous.currentBidCny : null,
      priceChangeSinceAt: previous?.lastCapturedAt || previousPayload.lastUpdatedAt || null,
    });
  });
  const opportunities = enrichedAuctions
    .filter((row) => row.currentBidCny > 0 && row.roi >= minOpportunityRoi)
    .sort((a, b) => b.actualProfitCny - a.actualProfitCny);

  const lastUpdatedAt = new Date().toISOString();
  const payload = {
    lastUpdatedAt,
    lastAttemptAt: lastUpdatedAt,
    lastAttemptMessage: "",
    dataStale: false,
    source: "server-browser-monitor",
    mode: "live",
    snapshotIntervalSeconds,
    refreshBatch: {
      index: batchIndex + 1,
      count: batchCount,
      targetCount: targets.length,
      totalTargetCount: allTargets.length,
    },
    sources: [
      {
        id: "ebay",
        name: "eBay",
        connected: ebayQueriesCompleted > 0,
        checkedAt: new Date().toISOString(),
        count: enrichedAuctions.filter((row) => row.platform === "eBay").length,
        candidateCount: candidates.filter((row) => row.platform === "eBay").length,
        mode: ebayMode,
        queryCount: ebayQueriesCompleted,
        errorCount: ebayErrors.length,
        message: ebayErrors.length ? `${ebayErrors.length} 个检索失败` : "抓取完成",
      },
      snkrdunk.status,
      ...loggedMarketplaces.statuses,
      ...unavailableSourceStatuses(new Date().toISOString()),
    ],
    minOpportunityRoi,
    auctions: enrichedAuctions,
    candidates,
    opportunities,
    watchlist: sample.watchlist,
  };
  await fs.writeFile(outputPath, JSON.stringify(payload, null, 2));
  if (process.env.WRITE_DOCS_SNAPSHOT === "1") {
    await fs.writeFile(docsOutputPath, JSON.stringify(payload, null, 2));
  }
  console.log(JSON.stringify({ preserved: false, message: "抓取完成", outputPath }));
}

main()
  .then(() => {
    setTimeout(() => process.exit(0), 50);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
