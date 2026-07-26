import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const root = "/Users/be/Documents/宝可梦拍卖";
const samplePath = path.join(root, "web/data/auctions.example.json");
const marketPath = path.join(root, "web/data/market-year.json");
const outputPath = path.join(root, "web/data/auctions.live.json");
const captureDir = path.join(root, "web/captures");
const usdCny = Number(process.env.USD_CNY || 7.2);
const twdCny = Number(process.env.TWD_CNY || 0.22);
const jpyCny = Number(process.env.JPY_CNY || 0.049);
const maxPerQuery = Number(process.env.MAX_PER_QUERY || 8);
const minPsa10PriceCny = Number(process.env.MIN_PSA10_PRICE_CNY || 500);
const minOpportunityRoi = Number(process.env.MIN_OPPORTUNITY_ROI || 0.2);

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
};

function slug(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
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
  const match = cleaned.match(/(?:US\s*)?\$([\d.]+)|(?:JPY|JP¥)\s*([\d.]+)|¥\s*([\d.]+)|CNY\s*([\d.]+)|NT\$?\s*([\d.]+)|NTS\s*([\d.]+)/i);
  if (!match) return 0;
  if (match[1]) return Math.round(Number(match[1]) * usdCny);
  if (match[2]) return Math.round(Number(match[2]) * jpyCny);
  if (match[5] || match[6]) return Math.round(Number(match[5] || match[6] || 0) * twdCny);
  return Math.round(Number(match[3] || match[4] || 0));
}

function futureEnd(hoursFromNow = 72) {
  return new Date(Date.now() + hoursFromNow * 3600000).toISOString();
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
  try {
    return await chromium.launch({ channel: "chrome", headless: true });
  } catch {
    return await chromium.launch({ headless: true });
  }
}

async function scrapeEbay(page, target) {
  const url = ebaySearchUrl(target.query);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(2500);
  const capturePath = path.join(captureDir, `ebay-${slug(target.query)}.png`);
  await page.screenshot({ path: capturePath, fullPage: true });
  let rows = await page.$$eval(".s-item", (items) =>
    items.slice(0, 10).map((item) => ({
      title: item.querySelector(".s-item__title")?.textContent?.trim() || "",
      price: item.querySelector(".s-item__price")?.textContent?.trim() || "",
      end: item.querySelector(".s-item__time-left")?.textContent?.trim() || "",
      url: item.querySelector("a.s-item__link")?.href || "",
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
        const title = lines.slice(Math.max(0, i - 4), i).reverse().find((line) => /psa|pokemon|charizard|lillie|marnie|rayquaza|umbreon|gengar|mew|mewtwo|iono|serena|cynthia/i.test(line)) || target.cardName;
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
  return rows
    .filter((row) => titleMatchesTarget(row.title, target) && parsePriceToCny(row.price) >= minPsa10PriceCny)
    .slice(0, maxPerQuery)
    .map((row, index) => {
      const currentBidCny = parsePriceToCny(row.price);
      const defaults = platformDefaults.eBay;
      return {
        ...target,
        id: `${target.id}-ebay-${index + 1}`,
        psaCert: "PSA 10",
        platform: "eBay",
        currentBidCny,
        expectedSaleCny: expectedSaleCny(target),
        feeRate: defaults.feeRate,
        paymentFeeRate: defaults.paymentFeeRate,
        shippingCny: defaults.shippingCny,
        taxCny: 0,
        otherCostCny: 30,
        holdingStartAt: new Date().toISOString(),
        auctionEndAt: futureEnd(72),
        status: "实时/eBay页面截取",
        url: row.url || url,
        sourceTitle: row.title,
        sourcePriceText: row.price,
        sourceEndText: row.end,
        screenshot: `/captures/${path.basename(capturePath)}`,
        lastCapturedAt: new Date().toISOString(),
      };
    });
}

function linkedMonitorRows(target) {
  return ["ALT", "Card Hobby", "Fanatics Collect", "PokerColor"].map((platform) => {
    const defaults = platformDefaults[platform];
    const searchBase = {
      ALT: "https://www.alt.xyz/",
      "Card Hobby": "https://www.cardhobby.com/",
      "Fanatics Collect": "https://www.fanaticscollect.com/",
      PokerColor: "https://www.pokercolor.com/",
    }[platform];
    return {
      ...target,
      id: `${target.id}-${slug(platform)}`,
      psaCert: "PSA 10",
      platform,
      currentBidCny: 0,
      expectedSaleCny: 0,
      feeRate: defaults.feeRate,
      paymentFeeRate: defaults.paymentFeeRate,
      shippingCny: defaults.shippingCny,
      taxCny: 0,
      otherCostCny: 0,
      holdingStartAt: new Date().toISOString(),
      auctionEndAt: futureEnd(96),
      status: "待登录/待解析",
      url: searchBase,
      lastCapturedAt: new Date().toISOString(),
    };
  });
}

async function main() {
  await fs.mkdir(captureDir, { recursive: true });
  const sample = JSON.parse(await fs.readFile(samplePath, "utf8"));
  const market = JSON.parse(await fs.readFile(marketPath, "utf8"));
  const targets = market.cards
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
  const auctions = [];
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  for (const target of targets) {
    try {
      const ebayRows = await scrapeEbay(page, target);
      auctions.push(...ebayRows);
    } catch (error) {
      auctions.push({
        id: `${slug(target.category)}-${slug(target.query)}-ebay-error`,
        ...target,
        psaCert: "PSA 10",
        platform: "eBay",
        currentBidCny: 0,
        expectedSaleCny: 0,
        feeRate: platformDefaults.eBay.feeRate,
        paymentFeeRate: platformDefaults.eBay.paymentFeeRate,
        shippingCny: platformDefaults.eBay.shippingCny,
        taxCny: 0,
        otherCostCny: 0,
        holdingStartAt: new Date().toISOString(),
        auctionEndAt: futureEnd(72),
        status: "抓取失败",
        url: ebaySearchUrl(target.query),
        lastCapturedAt: new Date().toISOString(),
        error: error.message,
      });
    }
    auctions.push(...linkedMonitorRows(target));
  }
  await browser.close();

  const enrichedAuctions = auctions.map(enrichFinancials);
  const opportunities = enrichedAuctions
    .filter((row) => row.currentBidCny > 0 && row.roi >= minOpportunityRoi)
    .sort((a, b) => b.actualProfitCny - a.actualProfitCny);

  const payload = {
    lastUpdatedAt: new Date().toISOString(),
    source: "local-browser-monitor",
    minOpportunityRoi,
    auctions: enrichedAuctions.length ? enrichedAuctions : sample.auctions,
    opportunities,
    watchlist: sample.watchlist,
  };
  await fs.writeFile(outputPath, JSON.stringify(payload, null, 2));
  console.log(outputPath);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
