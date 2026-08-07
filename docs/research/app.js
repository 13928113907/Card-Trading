const API_BASE_URL = String(window.CARD_TRADING_CONFIG?.apiBaseUrl || "").replace(/\/+$/, "");
const RESEARCH_URL = API_BASE_URL ? `${API_BASE_URL}/api/research` : "/api/research";

const state = {
  query: "",
};

let externalPayload = null;
let researchTimer = null;

const yuan = new Intl.NumberFormat("zh-CN", {
  style: "currency",
  currency: "CNY",
  maximumFractionDigits: 0,
});

const els = {
  searchInput: document.querySelector("#searchInput"),
  externalPanel: document.querySelector("#externalPanel"),
  externalStatus: document.querySelector("#externalStatus"),
  externalNotes: document.querySelector("#externalNotes"),
  requirementsSection: document.querySelector("#requirementsSection"),
  requirementsList: document.querySelector("#requirementsList"),
  externalQuoteList: document.querySelector("#externalQuoteList"),
  catalogSection: document.querySelector("#catalogSection"),
  catalogCount: document.querySelector("#catalogCount"),
  catalogGrid: document.querySelector("#catalogGrid"),
  externalCandidateList: document.querySelector("#externalCandidateList"),
  externalLinkList: document.querySelector("#externalLinkList"),
};

function money(value) {
  return yuan.format(value || 0);
}

function providerClass(ok) {
  return ok ? "positive" : "negative";
}

function buildExternalLinks(query) {
  const q = encodeURIComponent(query);
  const ebayQ = q.replaceAll("%20", "+");
  const access = {
    free: "免费直达",
    login: "可能需要登录",
    subscription: "需要订阅",
    api: "需要 API",
  };
  return [
    { label: "130 Point", group: "免费成交/在售聚合", note: "免费 comps 聚合入口。", access: access.free, url: `https://130point.com/sales/?search=${q}` },
    { label: "eBay Sold", group: "免费成交/在售聚合", note: "已成交价。", access: access.free, url: `https://www.ebay.com/sch/i.html?_nkw=${ebayQ}&LH_Sold=1&LH_Complete=1` },
    { label: "eBay Active", group: "免费成交/在售聚合", note: "当前挂牌。", access: access.free, url: `https://www.ebay.com/sch/i.html?_nkw=${ebayQ}` },
    { label: "Mavin", group: "免费成交/在售聚合", note: "sold comps 和估值范围。", access: access.free, url: `https://mavin.io/search?q=${q}` },
    { label: "PriceCharting / SportsCardsPro", group: "历史价格/价格曲线", note: "历史价格页。", access: access.free, url: `https://www.pricecharting.com/search-products?q=${ebayQ}&type=prices` },
    { label: "Beckett Price Guide", group: "Topps/Panini 体育卡价格库", note: "体育卡核心价格库，完整价格需要订阅。", access: access.subscription, url: "https://www.beckett.com/online-price-guide" },
    { label: "Trading Card Database", group: "Topps/Panini 体育卡图鉴", note: "TCDB 图鉴/checklist。", access: access.free, url: `https://www.tcdb.com/Search.cfm?Search=${q}` },
    { label: "Cardboard Connection", group: "Topps/Panini 体育卡图鉴", note: "新品 checklist 和系列配置。", access: access.free, url: `https://www.cardboardconnection.com/?s=${q}` },
    { label: "Topps Checklists", group: "Topps/Panini 官方图鉴", note: "Topps/Bowman 官方 checklist。", access: access.free, url: "https://www.topps.com/pages/checklists" },
    { label: "Topps Search", group: "Topps/Panini 官方图鉴", note: "Topps 官方产品搜索。", access: access.free, url: `https://www.topps.com/search?q=${q}` },
    { label: "Panini Checklists", group: "Topps/Panini 官方图鉴", note: "Panini 官方 checklist。", access: access.free, url: "https://www.paniniamerica.net/checklist.html" },
    { label: "Panini Products", group: "Topps/Panini 官方图鉴", note: "Panini 官方产品搜索。", access: access.free, url: `https://www.paniniamerica.net/catalogsearch/result/?q=${q}` },
    { label: "PSA Price Guide", group: "分级价格/Pop", note: "PSA 官方价格指南。", access: access.free, url: "https://www.psacard.com/priceguide" },
    { label: "PSA Pop Report", group: "分级价格/Pop", note: "PSA 分级数量。", access: access.free, url: "https://www.psacard.com/pop" },
    { label: "TCGplayer", group: "TCG 原始卡市场", note: "美国 TCG 市场价。", access: access.api, url: `https://www.tcgplayer.com/search/all/product?q=${q}` },
    { label: "Scryfall API", group: "免费公开 API", note: "MTG 免费图鉴和价格字段。", access: access.free, url: `https://scryfall.com/search?q=${q}` },
    { label: "YGOPRODeck API", group: "免费公开 API", note: "游戏王免费图鉴和价格字段。", access: access.free, url: `https://ygoprodeck.com/card-database/?&fname=${q}` },
    { label: "Cardmarket", group: "TCG 原始卡市场", note: "欧洲 TCG 市场。", access: access.free, url: `https://www.cardmarket.com/en/Pokemon/Products/Search?searchString=${q}` },
    { label: "Collectr", group: "TCG 原始卡市场", note: "TCG 组合和价格指南。", access: access.login, url: "https://www.getcollectr.com/" },
    { label: "Pokellector", group: "TCG 卡片图鉴", note: "Pokémon 卡名/编号确认。", access: access.free, url: `https://www.pokellector.com/search?criteria=${q}` },
    { label: "Card Ladder", group: "付费历史库/研究工具", note: "Sales History/CL Value。", access: access.subscription, url: "https://cardladder.com/" },
    { label: "Market Movers", group: "付费历史库/研究工具", note: "销售历史和价格图表。", access: access.subscription, url: "https://www.marketmoversapp.com/" },
    { label: "HobbyCardIndex", group: "付费历史库/研究工具", note: "大规模价格索引。", access: access.login, url: `https://hobbycardindex.com/?s=${q}` },
    { label: "SNKRDUNK", group: "亚洲/日本市场", note: "日本/亚洲市场。", access: access.login, url: `https://snkrdunk.com/en/search/result?keyword=${q}` },
    { label: "Card Hobby", group: "亚洲/中国市场", note: "国内交易参考。", access: access.login, url: "https://www.cardhobby.com.cn/" },
    { label: "Fanatics Collect", group: "高端拍卖/托管市场", note: "原 PWCC 生态。", access: access.login, url: `https://www.fanaticscollect.com/search?q=${q}` },
    { label: "Goldin", group: "高端拍卖/托管市场", note: "高端拍卖。", access: access.login, url: `https://goldin.co/search?q=${q}` },
    { label: "ALT", group: "高端拍卖/托管市场", note: "高端成交/保险库。", access: access.login, url: `https://www.alt.xyz/search?q=${q}` },
    { label: "COMC", group: "当前在售/寄售", note: "长尾库存当前挂价。", access: access.free, url: `https://www.comc.com/Cards,sr,=${q}` },
  ];
}

function buildRequirements() {
  return [
    { provider: "eBay Browse API", type: "需要 API", status: "未配置时只能打开 eBay 网页，不能自动填当前挂牌样本。", action: "配置 EBAY_CLIENT_ID / EBAY_CLIENT_SECRET", url: "https://developer.ebay.com/api-docs/buy/browse/overview.html" },
    { provider: "Pokémon TCG API", type: "需要 API", status: "可选 API key；无 key 时使用公开额度或 TCGdex 兜底。", action: "配置 POKEMONTCG_API_KEY", url: "https://pokemontcg.io/" },
    { provider: "Scryfall API", type: "免费直达", status: "已接入 MTG 免费公开 API。", action: "无需登录", url: "https://scryfall.com/docs/api" },
    { provider: "YGOPRODeck API", type: "免费直达", status: "已接入游戏王免费公开 API。", action: "无需登录", url: "https://ygoprodeck.com/api-guide/" },
    { provider: "TCGplayer API", type: "需要 API", status: "官方价格 API 需要授权，当前为网页直达。", action: "登录/申请卖家或开发者授权", url: "https://seller.tcgplayer.com/" },
    { provider: "Beckett OPG", type: "需要订阅", status: "Topps/Panini 完整价格库通常需要订阅。", action: "登录或订阅", url: "https://www.beckett.com/online-price-guide" },
    { provider: "Card Ladder / Market Movers", type: "需要订阅", status: "深度历史成交和走势图通常需要付费账号。", action: "登录订阅账号", url: "https://cardladder.com/" },
  ];
}

function renderExternalPanel() {
  const query = state.query;
  els.externalNotes.innerHTML = "";
  els.externalQuoteList.innerHTML = "";
  els.requirementsList.innerHTML = "";
  els.catalogGrid.innerHTML = "";
  els.externalCandidateList.innerHTML = "";
  els.externalLinkList.innerHTML = "";

  if (!query) {
    els.externalStatus.textContent = "等待查询";
    els.catalogSection.hidden = true;
    const p = document.createElement("p");
    p.textContent = "输入卡名、编号、系列或角色后，会显示完整图鉴、价格源状态和外部数据库入口。";
    els.externalNotes.append(p);
    return;
  }

  const hasPayload = externalPayload?.query === query;
  els.externalStatus.textContent = hasPayload ? "已查询" : "查询中";
  const links = hasPayload ? externalPayload.links : buildExternalLinks(query);
  const providerMessages = new Set((hasPayload ? externalPayload.providers || [] : []).map((provider) => provider.message));
  const notes = hasPayload
    ? (externalPayload.notes || []).filter((note) => !providerMessages.has(note))
    : ["正在查询图鉴源和外部价格入口。"];

  notes.forEach((note) => {
    const p = document.createElement("p");
    p.textContent = note;
    els.externalNotes.append(p);
  });

  (hasPayload ? externalPayload.providers || [] : []).forEach((provider) => {
    const p = document.createElement("p");
    p.className = providerClass(provider.ok);
    p.textContent = `${provider.provider}: ${provider.message}`;
    els.externalNotes.append(p);
  });

  (hasPayload ? externalPayload.quotes || [] : []).forEach((quote) => {
    const item = document.createElement("article");
    item.className = "quote-item";
    item.innerHTML = `<strong>${quote.platform}</strong><span>${quote.label} · ${quote.sampleCount} 样本</span><b>${money(quote.priceCny)}</b>`;
    els.externalQuoteList.append(item);
  });

  renderCatalog(hasPayload ? externalPayload.catalogCards || [] : [], hasPayload ? externalPayload.catalogTotalCount || 0 : 0);
  renderRequirements(hasPayload ? externalPayload.requirements || [] : buildRequirements());
  renderPriceCandidates(hasPayload ? externalPayload.priceChartingCandidates || [] : []);
  renderExternalLinks(links);
}

function renderRequirements(requirements) {
  els.requirementsSection.hidden = !requirements.length;
  requirements.forEach((item) => {
    const anchor = document.createElement("a");
    anchor.className = "requirement-card";
    anchor.href = item.url;
    anchor.target = "_blank";
    anchor.rel = "noreferrer";
    anchor.innerHTML = `
      <span class="access-badge">${item.type}</span>
      <strong>${item.provider}</strong>
      <span>${item.status}</span>
      <small>${item.action}</small>
    `;
    els.requirementsList.append(anchor);
  });
}

function renderCatalog(catalogCards, totalCount) {
  els.catalogSection.hidden = !catalogCards.length;
  els.catalogCount.textContent = totalCount > catalogCards.length ? `${catalogCards.length}/${totalCount} 张` : `${catalogCards.length} 张`;
  els.catalogGrid.innerHTML = "";

  catalogCards.forEach((card) => {
    const article = document.createElement("article");
    article.className = "catalog-card";
    const priceBits = [
      card.sourceLabel ? card.sourceLabel : "",
      Number.isFinite(card.tcgplayerMarketUsd) ? `TCG $${card.tcgplayerMarketUsd}` : "",
      Number.isFinite(card.ebayMarketUsd) ? `eBay $${card.ebayMarketUsd}` : "",
      Number.isFinite(card.cardmarketTrendEur) ? `CM €${card.cardmarketTrendEur}` : "",
    ].filter(Boolean);
    const imageHtml = card.imageSmall
      ? `<img src="${card.imageSmall}" alt="${card.name}" loading="lazy" />`
      : `<div class="catalog-image-missing">暂无图</div>`;
    article.innerHTML = `
      ${imageHtml}
      <div>
        <strong>${card.name}</strong>
        <span>${card.setName} · ${card.number}${card.rarity ? ` · ${card.rarity}` : ""}</span>
        <small>${card.releaseDate || "未知日期"}${priceBits.length ? ` · ${priceBits.join(" / ")}` : ""}</small>
        <div class="catalog-actions"></div>
      </div>
    `;
    const actions = article.querySelector(".catalog-actions");
    [
      card.imageLarge && { label: "大图", url: card.imageLarge },
      card.sourceUrl && { label: card.sourceLabel || "来源", url: card.sourceUrl },
      card.tcgplayerUrl && { label: "TCGplayer", url: card.tcgplayerUrl },
      card.cardmarketUrl && { label: "Cardmarket", url: card.cardmarketUrl },
    ]
      .filter(Boolean)
      .forEach((link) => {
        const anchor = document.createElement("a");
        anchor.href = link.url;
        anchor.target = "_blank";
        anchor.rel = "noreferrer";
        anchor.textContent = link.label;
        actions.append(anchor);
      });
    els.catalogGrid.append(article);
  });
}

function renderPriceCandidates(candidates) {
  candidates.forEach((candidate) => {
    const anchor = document.createElement("a");
    anchor.className = "candidate-link";
    anchor.href = candidate.url;
    anchor.target = "_blank";
    anchor.rel = "noreferrer";
    anchor.innerHTML = `<strong>${candidate.title}</strong><span>PriceCharting 历史价格页候选</span>`;
    els.externalCandidateList.append(anchor);
  });
}

function renderExternalLinks(links) {
  const groups = new Map();
  links.forEach((link) => {
    const group = link.group || "其他来源";
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(link);
  });

  groups.forEach((items, group) => {
    const section = document.createElement("section");
    section.className = "source-section";
    const title = document.createElement("h3");
    title.textContent = group;
    section.append(title);
    const grid = document.createElement("div");
    grid.className = "source-grid";
    items.forEach((link) => {
      const anchor = document.createElement("a");
      anchor.className = "source-card";
      anchor.href = link.url;
      anchor.target = "_blank";
      anchor.rel = "noreferrer";
      anchor.innerHTML = `
        <span class="access-badge">${link.access || "免费直达"}</span>
        <strong>${link.label}</strong>
        <span>${link.note || "打开查询"}</span>
      `;
      grid.append(anchor);
    });
    section.append(grid);
    els.externalLinkList.append(section);
  });
}

async function fetchExternalResearch() {
  const query = state.query;
  if (!query) {
    externalPayload = null;
    renderExternalPanel();
    return;
  }

  try {
    const response = await fetch(`${RESEARCH_URL}?q=${encodeURIComponent(query)}&t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    externalPayload = await response.json();
  } catch (error) {
    externalPayload = {
      query,
      links: buildExternalLinks(query),
      providers: [],
      quotes: [],
      priceChartingCandidates: [],
      catalogCards: [],
      catalogTotalCount: 0,
      requirements: buildRequirements(),
      notes: [`后端查询暂不可用：${error.message}。已保留外部数据库直达入口。`],
    };
  }
  renderExternalPanel();
}

function scheduleExternalResearch() {
  window.clearTimeout(researchTimer);
  renderExternalPanel();
  if (!state.query) return;
  researchTimer = window.setTimeout(fetchExternalResearch, 450);
}

els.searchInput.addEventListener("input", (event) => {
  state.query = event.target.value.trim();
  scheduleExternalResearch();
});

renderExternalPanel();
