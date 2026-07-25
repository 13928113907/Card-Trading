import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const root = "/Users/be/Documents/宝可梦拍卖";
const samplePath = path.join(root, "web/data/auctions.example.json");
const outputPath = path.join(root, "web/data/auctions.live.json");
const captureDir = path.join(root, "web/captures");
const usdCny = Number(process.env.USD_CNY || 7.2);
const twdCny = Number(process.env.TWD_CNY || 0.22);
const maxPerQuery = Number(process.env.MAX_PER_QUERY || 3);
const minPsa10PriceCny = Number(process.env.MIN_PSA10_PRICE_CNY || 500);

const platformDefaults = {
  eBay: { feeRate: 0.13, paymentFeeRate: 0.03, shippingCny: 140 },
  ALT: { feeRate: 0.08, paymentFeeRate: 0.03, shippingCny: 120 },
  "Card Hobby": { feeRate: 0.05, paymentFeeRate: 0.01, shippingCny: 25 },
  "Fanatics Collect": { feeRate: 0.1, paymentFeeRate: 0.03, shippingCny: 140 },
  PokerColor: { feeRate: 0.03, paymentFeeRate: 0.01, shippingCny: 25 },
};

const requiredTerms = {
  莉莉艾: ["lillie"],
  玛俐: ["marnie"],
  莎莉娜: ["serena"],
  竹兰: ["cynthia"],
  奇树: ["iono"],
  喷火龙: ["charizard"],
  皮卡丘: ["pikachu"],
  裂空坐: ["rayquaza"],
  月亮伊布: ["umbreon"],
  耿鬼: ["gengar"],
  超梦: ["mewtwo"],
  梦幻: ["mew"],
};

const targets = [
  { type: "人气训练家", category: "莉莉艾", cnName: "莉莉艾 全图 PSA10", cardName: "Lillie Full Art PSA 10", set: "SM4+ / 119/114", language: "日文", query: "Lillie Full Art PSA 10" },
  { type: "人气训练家", category: "玛俐", cnName: "玛俐 全图 PSA10", cardName: "Marnie Full Art PSA 10", set: "Sword & Shield / 200/202", language: "英文", query: "Marnie Full Art PSA 10" },
  { type: "人气训练家", category: "莎莉娜", cnName: "莎莉娜 SR PSA10", cardName: "Serena SR PSA 10", set: "Incandescent Arcana / 081/068", language: "日文", query: "Serena SR PSA 10" },
  { type: "人气训练家", category: "竹兰", cnName: "竹兰 全图 PSA10", cardName: "Cynthia Full Art PSA 10", set: "Ultra Prism / 148/156", language: "英文", query: "Cynthia Full Art PSA 10" },
  { type: "人气训练家", category: "奇树", cnName: "奇树 SAR PSA10", cardName: "Iono SAR PSA 10", set: "Clay Burst / 096/071", language: "日文", query: "Iono SAR PSA 10" },
  { type: "热门宝可梦", category: "喷火龙", cnName: "喷火龙 ex SAR PSA10", cardName: "Charizard ex SAR PSA 10", set: "Pokemon Card 151 / 201/165", language: "日文", query: "Charizard ex SAR PSA 10 201/165" },
  { type: "热门宝可梦", category: "皮卡丘", cnName: "皮卡丘 Promo PSA10", cardName: "Pikachu Promo PSA 10", set: "SV-P / Promo", language: "日文", query: "Pikachu Promo PSA 10" },
  { type: "热门宝可梦", category: "裂空坐", cnName: "裂空坐 VMAX 异画 PSA10", cardName: "Rayquaza VMAX Alternate Art PSA 10", set: "Evolving Skies / 218/203", language: "英文", query: "Rayquaza VMAX 218/203 PSA 10" },
  { type: "热门宝可梦", category: "月亮伊布", cnName: "月亮伊布 VMAX 异画 PSA10", cardName: "Umbreon VMAX Alternate Art PSA 10", set: "Evolving Skies / 215/203", language: "英文", query: "Umbreon VMAX 215/203 PSA 10" },
  { type: "热门宝可梦", category: "耿鬼", cnName: "耿鬼 VMAX 异画 PSA10", cardName: "Gengar VMAX Alternate Art PSA 10", set: "Fusion Strike / 271/264", language: "英文", query: "Gengar VMAX 271/264 PSA 10" },
  { type: "热门宝可梦", category: "超梦", cnName: "超梦 GX Secret PSA10", cardName: "Mewtwo GX Secret PSA 10", set: "SM / Secret", language: "日文", query: "Mewtwo GX Secret PSA 10" },
  { type: "热门宝可梦", category: "梦幻", cnName: "梦幻 Gold Star PSA10", cardName: "Mew Gold Star PSA 10", set: "PLAY Promo", language: "日文", query: "Mew Gold Star PSA 10" },
];

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

function guessExpectedSale(currentBidCny, platform) {
  const multiplier = platform === "eBay" ? 1.18 : 1.14;
  return Math.round(currentBidCny * multiplier);
}

function parsePriceToCny(text) {
  if (!text) return 0;
  const cleaned = text.replace(/,/g, "");
  const match = cleaned.match(/(?:US\s*)?\$([\d.]+)|¥\s*([\d.]+)|CNY\s*([\d.]+)|NT\$?\s*([\d.]+)|NTS\s*([\d.]+)/i);
  if (!match) return 0;
  if (match[1]) return Math.round(Number(match[1]) * usdCny);
  if (match[4] || match[5]) return Math.round(Number(match[4] || match[5] || 0) * twdCny);
  return Math.round(Number(match[2] || match[3] || 0));
}

function futureEnd(hoursFromNow = 72) {
  return new Date(Date.now() + hoursFromNow * 3600000).toISOString();
}

function titleMatchesTarget(title, target) {
  const lower = title.toLowerCase();
  const terms = requiredTerms[target.category] || [];
  return /psa\s*10/i.test(title) && terms.every((term) => lower.includes(term));
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
        /^(?:NT\$|NTS|US\s*\$|\$|¥|CNY)/i.test(lines[i]) &&
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
        id: `${slug(target.category)}-${slug(target.query)}-ebay-${index + 1}`,
        ...target,
        psaCert: "PSA 10",
        platform: "eBay",
        currentBidCny,
        expectedSaleCny: guessExpectedSale(currentBidCny, "eBay"),
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
      id: `${slug(target.category)}-${slug(target.query)}-${slug(platform)}`,
      ...target,
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

  const payload = {
    lastUpdatedAt: new Date().toISOString(),
    source: "local-browser-monitor",
    auctions: auctions.length ? auctions : sample.auctions,
    watchlist: sample.watchlist,
  };
  await fs.writeFile(outputPath, JSON.stringify(payload, null, 2));
  console.log(outputPath);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
