const FALLBACK_URL = "./data/auctions.example.json";
const MARKET_URL = "./data/market-year.json";
const LIVE_URL = "./data/auctions.live.json";
const AUTO_REFRESH_MS = 60 * 1000;
const API_BASE_URL = String(window.CARD_TRADING_CONFIG?.apiBaseUrl || "").replace(/\/+$/, "");

let auctions = [];
let candidateListings = [];
let watchlist = [];
let opportunities = [];
let marketCards = [];
let marketEvents = [];
let marketMeta = null;
let lastUpdatedAt = null;
let dataMode = "local";
let sourceStatus = [];

const state = {
  type: "全部",
  category: "全部分类",
  platform: "全部平台",
  query: "",
  sortBy: "actualProfit",
  marketClass: "全部资产",
  marketSortBy: "growth",
};

const yuan = new Intl.NumberFormat("zh-CN", {
  style: "currency",
  currency: "CNY",
  maximumFractionDigits: 0,
});

const pct = new Intl.NumberFormat("zh-CN", {
  style: "percent",
  maximumFractionDigits: 1,
});

const dateTime = new Intl.DateTimeFormat("zh-CN", {
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

const typeTabs = document.querySelector("#typeTabs");
const categoryFilter = document.querySelector("#categoryFilter");
const platformFilter = document.querySelector("#platformFilter");
const marketClassFilter = document.querySelector("#marketClassFilter");
const marketSortBy = document.querySelector("#marketSortBy");
const searchInput = document.querySelector("#searchInput");
const sortBy = document.querySelector("#sortBy");
const auctionBody = document.querySelector("#auctionBody");
const marketBody = document.querySelector("#marketBody");
const categoryRank = document.querySelector("#categoryRank");
const eventList = document.querySelector("#eventList");
const actionList = document.querySelector("#actionList");
const opportunityGrid = document.querySelector("#opportunityGrid");
const candidateGrid = document.querySelector("#candidateGrid");
const candidateCount = document.querySelector("#candidateCount");
const watchlistGrid = document.querySelector("#watchlistGrid");
const refreshStatus = document.querySelector("#refreshStatus");
const refreshButton = document.querySelector("#refreshButton");
const exportWatchlist = document.querySelector("#exportWatchlist");
const watchTemplate = document.querySelector("#watchTemplate");
const dataModeNote = document.querySelector("#dataModeNote");
const marketDataNote = document.querySelector("#marketDataNote");

function usd(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 1000 ? 0 : 2,
  }).format(value);
}

function isNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function usdOrPending(value) {
  return isNumber(value) ? usd(value) : "待复核";
}

function pctOrPending(value) {
  return isNumber(value) ? pct.format(value) : "待复核";
}

function daysBetween(from, to = new Date()) {
  if (!from) return 0;
  return Math.max(0, Math.floor((to.getTime() - new Date(from).getTime()) / 86400000));
}

function remainingText(date) {
  if (!date) return "平台未提供";
  const ms = new Date(date).getTime() - Date.now();
  if (!Number.isFinite(ms)) return "平台未提供";
  if (ms <= 0) return "已结束";
  const minutes = Math.floor(ms / 60000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  if (days) return `${days}天${hours}小时`;
  return `${hours}小时${minutes % 60}分`;
}

function dateText(value) {
  if (!value) return "未提供";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? dateTime.format(date) : "未提供";
}

function assetUrl(value) {
  if (!value || /^(?:https?:|data:)/i.test(value)) return value || "";
  if (API_BASE_URL && value.startsWith("/")) return `${API_BASE_URL}${value}`;
  return value;
}

function priceChangeMarkup(row) {
  if (!isNumber(row.priceChangeCny) || !isNumber(row.previousBidCny)) {
    return `<small class="price-change neutral">等待下一轮快照</small>`;
  }
  const direction = row.priceChangeCny > 0 ? "up" : row.priceChangeCny < 0 ? "down" : "neutral";
  const sign = row.priceChangeCny > 0 ? "+" : "";
  const changePct = isNumber(row.priceChangePct) ? ` · ${sign}${pct.format(row.priceChangePct)}` : "";
  return `<small class="price-change ${direction}">较上一轮 ${sign}${yuan.format(row.priceChangeCny)}${changePct}</small>`;
}

function calcFees(item) {
  const platformFee = item.currentBidCny * item.feeRate;
  const paymentFee = item.currentBidCny * item.paymentFeeRate;
  const total = platformFee + paymentFee + item.shippingCny + item.taxCny + item.otherCostCny;
  return { platformFee, paymentFee, total };
}

function enrich(item) {
  const fees = calcFees(item);
  const grossProfit = item.expectedSaleCny - item.currentBidCny;
  const actualProfit = item.expectedSaleCny - item.currentBidCny - fees.total;
  const totalCost = item.currentBidCny + fees.total;
  const roi = totalCost > 0 ? actualProfit / totalCost : 0;
  return {
    ...item,
    fees,
    grossProfit,
    actualProfit,
    totalCost,
    roi,
    holdingDays: daysBetween(item.holdingStartAt),
  };
}

function allRows() {
  return auctions.map(enrich);
}

function categories() {
  return ["全部分类", ...new Set(auctions.map((item) => item.category))];
}

function platforms() {
  return ["全部平台", ...new Set(auctions.map((item) => item.platform))];
}

function types() {
  return ["全部", ...new Set(auctions.map((item) => item.type))];
}

function matches(row) {
  const query = state.query.toLowerCase();
  const haystack = [
    row.type,
    row.category,
    row.cnName,
    row.cardName,
    row.set,
    row.platform,
    row.psaCert,
    row.status,
  ]
    .join(" ")
    .toLowerCase();
  return (
    (state.type === "全部" || row.type === state.type) &&
    (state.category === "全部分类" || row.category === state.category) &&
    (state.platform === "全部平台" || row.platform === state.platform) &&
    (!query || haystack.includes(query))
  );
}

function sortedRows() {
  return allRows()
    .filter(matches)
    .sort((a, b) => {
      if (state.sortBy === "roi") return b.roi - a.roi;
      if (state.sortBy === "endingSoon") return new Date(a.auctionEndAt) - new Date(b.auctionEndAt);
      if (state.sortBy === "fee") return a.fees.total - b.fees.total;
      if (state.sortBy === "holdingDays") return b.holdingDays - a.holdingDays;
      return b.actualProfit - a.actualProfit;
    });
}

function marketClasses() {
  return ["全部资产", ...new Set(marketCards.map((item) => item.assetClass))];
}

function enrichMarket(item) {
  const hasComparableYear = ["verified", "estimated"].includes(item.priceStatus) && isNumber(item.startUsd) && item.startUsd > 0 && isNumber(item.currentUsd);
  const growthPct = hasComparableYear ? (item.currentUsd - item.startUsd) / item.startUsd : null;
  const unrealizedProfitUsd = hasComparableYear ? item.currentUsd - item.startUsd : null;
  const targetSellUsd = isNumber(item.currentUsd) ? item.currentUsd * (1 + item.targetReturnPct) : null;
  const stopLossBase = isNumber(item.costBasisUsd) ? item.costBasisUsd : item.startUsd;
  const stopLossUsd = isNumber(stopLossBase) ? stopLossBase * (1 + item.stopLossPct) : null;
  const heatScore = Math.round(
    item.catalystScore * 0.42 +
      item.liquidity * 0.28 +
      Math.min((growthPct || 0) * 100, 160) * 0.22 -
      item.popRisk * 0.08 -
      (hasComparableYear ? 0 : 18) -
      (item.priceStatus === "estimated" ? 6 : 0)
  );
  const holdLabel =
    item.holdMaxDays <= 100
      ? "短线"
      : item.holdMaxDays <= 220
        ? "中线"
        : "中长线";
  return {
    ...item,
    hasComparableYear,
    growthPct,
    unrealizedProfitUsd,
    targetSellUsd,
    stopLossUsd,
    heatScore,
    holdLabel,
  };
}

function marketRows() {
  return marketCards
    .map(enrichMarket)
    .filter((row) => state.marketClass === "全部资产" || row.assetClass === state.marketClass)
    .sort((a, b) => {
      const growthA = isNumber(a.growthPct) ? a.growthPct : -Infinity;
      const growthB = isNumber(b.growthPct) ? b.growthPct : -Infinity;
      const profitA = isNumber(a.unrealizedProfitUsd) ? a.unrealizedProfitUsd : -Infinity;
      const profitB = isNumber(b.unrealizedProfitUsd) ? b.unrealizedProfitUsd : -Infinity;
      if (state.marketSortBy === "profit") return profitB - profitA;
      if (state.marketSortBy === "current") return (b.currentUsd || 0) - (a.currentUsd || 0);
      if (state.marketSortBy === "catalyst") return b.heatScore - a.heatScore;
      if (state.marketSortBy === "sellSoon") return a.holdMinDays - b.holdMinDays;
      return growthB - growthA;
    });
}

function renderTypeTabs() {
  typeTabs.innerHTML = "";
  types().forEach((type) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = type;
    button.className = type === state.type ? "active" : "";
    button.addEventListener("click", () => {
      state.type = type;
      render();
    });
    typeTabs.append(button);
  });
}

function renderSelect(select, options, value) {
  select.innerHTML = "";
  options.forEach((optionValue) => {
    const option = document.createElement("option");
    option.value = optionValue;
    option.textContent = optionValue;
    select.append(option);
  });
  select.value = value;
}

function renderMarketInsights(rows) {
  const all = marketCards.map(enrichMarket);
  const comparableRows = all.filter((row) => row.hasComparableYear);
  const topGrowth = comparableRows.reduce((best, row) => (!best || row.growthPct > best.growthPct ? row : best), null);
  const topProfit = comparableRows.reduce((best, row) => (!best || row.unrealizedProfitUsd > best.unrealizedProfitUsd ? row : best), null);
  const topCatalyst = all.reduce((best, row) => (!best || row.heatScore > best.heatScore ? row : best), null);
  document.querySelector("#topGrowthCard").textContent = topGrowth ? topGrowth.cardName : "--";
  document.querySelector("#topGrowthValue").textContent = topGrowth ? pct.format(topGrowth.growthPct) : "等待一年前节点";
  document.querySelector("#topProfitCard").textContent = topProfit ? topProfit.cardName : "--";
  document.querySelector("#topProfitValue").textContent = topProfit
    ? `${usd(topProfit.unrealizedProfitUsd)} / ${yuan.format(topProfit.unrealizedProfitUsd * (marketMeta?.fx?.USD_CNY || 7.2))}`
    : "等待一年前节点";
  document.querySelector("#topCatalystCard").textContent = topCatalyst ? topCatalyst.cardName : "--";
  document.querySelector("#topCatalystValue").textContent = topCatalyst ? `${topCatalyst.heatScore} 分` : "--";
  const pending = all.filter((row) => !row.hasComparableYear).length;
  const estimated = all.filter((row) => row.priceStatus === "estimated").length;
  marketDataNote.textContent = marketMeta
    ? `本机数据 ${new Date(marketMeta.lastUpdatedAt).toLocaleString("zh-CN")} · ${rows.length} 张卡 · ${estimated} 张一年价为估算 · ${pending} 张待补`
    : "未加载年度数据";
}

function renderMarketTable(rows) {
  marketBody.innerHTML = "";
  if (!rows.length) {
    marketBody.innerHTML = `<tr><td colspan="13" class="empty-cell">没有匹配的年度涨幅条目</td></tr>`;
    return;
  }
  rows.forEach((row) => {
    const tr = document.createElement("tr");
    tr.className = [row.heatScore >= 90 ? "hot" : "", row.hasComparableYear ? "" : "pending-row"].filter(Boolean).join(" ");
    const sourceStatus =
      row.priceStatus === "verified"
        ? "PSA10节点已核"
        : row.priceStatus === "estimated"
          ? `当前节点曾复核/一年估算${row.confidence ? `/${row.confidence}` : ""}`
          : "待复核一年节点";
    tr.innerHTML = `
      <td><span class="tag">${row.assetClass}</span></td>
      <td>
        <strong>${row.cardName}</strong>
        <small>${row.estimateBasis || row.nearTermCatalyst}</small>
      </td>
      <td class="money">${usdOrPending(row.startUsd)}</td>
      <td class="money">${usdOrPending(row.currentUsd)}</td>
      <td class="roi">${pctOrPending(row.growthPct)}</td>
      <td class="money emphasis">${usdOrPending(row.unrealizedProfitUsd)}</td>
      <td>${row.mainstream}<small>流动性 ${row.liquidity}</small></td>
      <td><strong>${row.heatScore} 分</strong><small>供给风险 ${row.popRisk}</small></td>
      <td>${row.holdLabel}<small>${row.holdMinDays}-${row.holdMaxDays} 天</small></td>
      <td class="money">${usdOrPending(row.targetSellUsd)}${isNumber(row.targetSellUsd) ? `<small>${yuan.format(row.targetSellUsd * (marketMeta?.fx?.USD_CNY || 7.2))}</small>` : ""}</td>
      <td class="money">${usdOrPending(row.stopLossUsd)}</td>
      <td>${row.sellWindow}</td>
      <td>
        <a class="link-button" href="${row.sourceUrl}" target="_blank" rel="noreferrer">${row.sourceName}</a>
        <small class="data-badge">${sourceStatus}</small>
      </td>
    `;
    marketBody.append(tr);
  });
}

function renderEvents() {
  eventList.innerHTML = "";
  marketEvents.forEach((event) => {
    const item = document.createElement("article");
    item.className = "event-item";
    item.innerHTML = `
      <div>
        <span class="tag">${event.assetClass}</span>
        <strong>${event.name}</strong>
      </div>
      <time>${event.date}</time>
      <p>${event.impact} · ${event.note}</p>
    `;
    eventList.append(item);
  });
}

function renderActionList() {
  actionList.innerHTML = "";
  marketCards
    .map(enrichMarket)
    .sort((a, b) => b.heatScore - a.heatScore)
    .slice(0, 5)
    .forEach((row) => {
      const item = document.createElement("article");
      item.className = "rank-item";
      item.innerHTML = `
        <strong>${row.cardName}</strong>
        <span>${row.strategy}</span>
        <span>建议持有 ${row.holdMinDays}-${row.holdMaxDays} 天；目标 ${usdOrPending(row.targetSellUsd)}，止损 ${usdOrPending(row.stopLossUsd)}，窗口 ${row.sellWindow}。</span>
      `;
      actionList.append(item);
    });
}

function renderMetrics(rows) {
  const qualifiedRows = rows.filter((row) => row.profitQualified === true);
  const positive = qualifiedRows.filter((row) => row.roi >= 0.2);
  const endingRows = rows.filter((row) => row.auctionEndAt && new Date(row.auctionEndAt) > new Date());
  const nearest = endingRows.reduce((best, row) => {
    if (!best) return row;
    return new Date(row.auctionEndAt) < new Date(best.auctionEndAt) ? row : best;
  }, null);
  const pricedRows = rows.filter((row) => row.currentBidCny > 0);
  const avgFeeRate = pricedRows.length
    ? pricedRows.reduce((sum, row) => sum + row.fees.total / row.currentBidCny, 0) / pricedRows.length
    : 0;
  document.querySelector("#metricListings").textContent = rows.length;
  document.querySelector("#metricPositive").textContent = positive.length;
  document.querySelector("#metricProfit").textContent = qualifiedRows.length
    ? yuan.format(Math.max(...qualifiedRows.map((row) => row.actualProfit)))
    : "¥0";
  document.querySelector("#metricEnding").textContent = nearest ? remainingText(nearest.auctionEndAt) : "--";
  document.querySelector("#metricFeeRate").textContent = pct.format(avgFeeRate);
}

function renderOpportunities() {
  opportunityGrid.innerHTML = "";
  const rows = opportunities
    .map((row) => (row.roi === undefined ? enrich(row) : row))
    .filter((row) => row.profitQualified === true)
    .sort((a, b) => (b.actualProfitCny ?? b.actualProfit) - (a.actualProfitCny ?? a.actualProfit));

  if (!rows.length) {
    opportunityGrid.innerHTML = `<article class="opportunity-card muted-card">当前没有同时通过字段完整性、有效期和卖出价复核的 ROI &gt; 20% 竞拍。</article>`;
    return;
  }

  rows.forEach((row) => {
    const profit = row.actualProfitCny ?? row.actualProfit;
    const totalCost = row.totalCostCny ?? row.totalCost;
    const fees = row.feesCny ?? row.fees?.total ?? 0;
    const card = document.createElement("article");
    card.className = "opportunity-card";
    const image = assetUrl(row.imageUrl || row.screenshot);
    card.innerHTML = `
      ${image ? `<img class="listing-image" src="${image}" alt="${row.cnName}" loading="lazy" referrerpolicy="no-referrer" />` : ""}
      <div class="opportunity-head">
        <span class="tag">${row.category}</span>
        <strong>${row.cnName}</strong>
      </div>
      <p>${row.sourceTitle || row.cardName}</p>
      <dl>
        <div><dt>当前竞价</dt><dd>${yuan.format(row.currentBidCny)}</dd></div>
        <div><dt>预估卖出</dt><dd>${yuan.format(row.expectedSaleCny)}</dd></div>
        <div><dt>总成本</dt><dd>${yuan.format(totalCost)}</dd></div>
        <div><dt>费用</dt><dd>${yuan.format(fees)}</dd></div>
        <div><dt>实际利润</dt><dd>${yuan.format(profit)}</dd></div>
        <div><dt>ROI</dt><dd>${pct.format(row.roi)}</dd></div>
      </dl>
      <div class="opportunity-actions">
        <span>${row.sourcePriceText || ""} ${row.sourceEndText || ""}</span>
        <a class="link-button" href="${row.url}" target="_blank" rel="noreferrer">打开</a>
        ${row.alternateUrl ? `<a class="capture-link" href="${row.alternateUrl}" target="_blank" rel="noreferrer">H5</a>` : ""}
        ${row.screenshot ? `<a class="capture-link" href="${assetUrl(row.screenshot)}" target="_blank" rel="noreferrer">截图</a>` : ""}
      </div>
    `;
    opportunityGrid.append(card);
  });
}

function renderCandidates() {
  candidateGrid.innerHTML = "";
  candidateCount.textContent = `${candidateListings.length} 条待核验`;
  if (!candidateListings.length) {
    candidateGrid.innerHTML = `<article class="candidate-card muted-card">当前没有缺少核验条件的候选。</article>`;
    return;
  }
  candidateListings.forEach((row) => {
    const image = assetUrl(row.imageUrl || row.screenshot);
    const directUrl = row.sourceListingId && row.url && row.url !== row.searchUrl ? row.url : "";
    const card = document.createElement("article");
    card.className = "candidate-card";
    card.innerHTML = `
      ${image ? `<img class="listing-image" src="${image}" alt="${row.cnName}" loading="lazy" referrerpolicy="no-referrer" />` : ""}
      <div class="candidate-head">
        <span class="tag">${row.category}</span>
        <span class="platform-pill">${row.platform}</span>
      </div>
      <strong>${row.cnName}</strong>
      <p>${row.sourceTitle || row.cardName}</p>
      <dl>
        <div><dt>候选价格</dt><dd>${row.currentBidCny ? yuan.format(row.currentBidCny) : "未解析"}</dd></div>
        <div><dt>剩余时间</dt><dd>${remainingText(row.auctionEndAt)}</dd></div>
        <div><dt>发货地</dt><dd>${row.shippingFrom || "平台未提供"}</dd></div>
      </dl>
      <div class="issue-list">${(row.verificationIssues || ["核验条件不完整"])
        .map((issue) => `<span>${issue}</span>`)
        .join("")}</div>
      <small>该条不参与实时涨跌、ROI 和利润排行 · 抓取 ${dateText(row.lastCapturedAt)}</small>
      <div class="candidate-actions">
        ${directUrl ? `<a class="link-button" href="${directUrl}" target="_blank" rel="noreferrer">商品页</a>` : ""}
        <a class="link-button" href="${row.searchUrl || row.url}" target="_blank" rel="noreferrer">搜索页</a>
        ${row.screenshot ? `<a class="capture-link" href="${assetUrl(row.screenshot)}" target="_blank" rel="noreferrer">截图</a>` : ""}
      </div>
    `;
    candidateGrid.append(card);
  });
}

function rowClass(row) {
  if (row.profitQualified !== true) return "pending-row";
  if (row.actualProfit <= 0) return "loss";
  if (row.roi >= 0.18) return "hot";
  return "";
}

function renderTable(rows) {
  auctionBody.innerHTML = "";
  if (!rows.length) {
    auctionBody.innerHTML = `<tr><td colspan="14" class="empty-cell">没有匹配的实时拍卖条目</td></tr>`;
    return;
  }
  rows.forEach((row) => {
    const tr = document.createElement("tr");
    tr.className = rowClass(row);
    const image = assetUrl(row.imageUrl || row.screenshot);
    tr.innerHTML = `
      <td><span class="tag">${row.type}</span><span class="subtag">${row.category}</span></td>
      <td>
        ${image ? `<img class="listing-thumb" src="${image}" alt="${row.cnName}" loading="lazy" referrerpolicy="no-referrer" />` : ""}
        <strong>${row.cnName}</strong>
        <small>${row.sourceTitle || `${row.cardName} · ${row.set} · ${row.language} · ${row.psaCert}`}</small>
      </td>
      <td><span class="platform-pill">${row.platform}</span></td>
      <td class="money">${yuan.format(row.currentBidCny)}${priceChangeMarkup(row)}</td>
      <td class="money">${yuan.format(row.expectedSaleCny)}<small>${row.salePriceStatus === "verified" ? "已复核" : "估值参考"}</small></td>
      <td class="money">${row.profitQualified ? yuan.format(row.grossProfit) : "待复核"}</td>
      <td>
        <strong>${yuan.format(row.fees.total)}</strong>
        <small>平台 ${yuan.format(row.fees.platformFee)} · 支付 ${yuan.format(row.fees.paymentFee)}</small>
      </td>
      <td class="money emphasis">${row.profitQualified ? yuan.format(row.actualProfit) : "待复核"}</td>
      <td class="roi">${row.profitQualified ? pct.format(row.roi) : "待复核"}</td>
      <td>${row.holdingDays}天</td>
      <td><span>${dateText(row.auctionStartAt)}</span><small>结束 ${dateText(row.auctionEndAt)} · ${remainingText(row.auctionEndAt)}</small></td>
      <td>${row.shippingFrom || "平台未提供"}</td>
      <td><span class="status">${row.status}</span><small>抓取 ${dateText(row.lastCapturedAt)}</small></td>
      <td>
        <a class="link-button" href="${row.url}" target="_blank" rel="noreferrer">打开</a>
        ${row.alternateUrl ? `<a class="capture-link" href="${row.alternateUrl}" target="_blank" rel="noreferrer">H5</a>` : ""}
        ${row.screenshot ? `<a class="capture-link" href="${assetUrl(row.screenshot)}" target="_blank" rel="noreferrer">截图</a>` : ""}
      </td>
    `;
    auctionBody.append(tr);
  });
}

function renderRanks(rows) {
  const grouped = new Map();
  rows.forEach((row) => {
    const next = grouped.get(row.category) || { count: 0, profit: 0, fees: 0 };
    next.count += 1;
    next.profit += row.actualProfit;
    next.fees += row.fees.total;
    grouped.set(row.category, next);
  });
  categoryRank.innerHTML = "";
  [...grouped.entries()]
    .sort((a, b) => b[1].profit - a[1].profit)
    .forEach(([category, value]) => {
      const item = document.createElement("article");
      item.className = "rank-item";
      item.innerHTML = `
        <strong>${category}</strong>
        <span>${value.count} 条 · 利润 ${yuan.format(value.profit)} · 费用 ${yuan.format(value.fees)}</span>
      `;
      categoryRank.append(item);
    });
}

function renderWatchlist() {
  watchlistGrid.innerHTML = "";
  watchlist.forEach((item) => {
    const node = watchTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector(".tag").textContent = item.category;
    node.querySelector("strong").textContent = item.cnName;
    node.querySelector(".watch-meta").textContent = `${item.type} · ${item.cardName} · ${item.set} · ${item.language}`;
    node.querySelector(".target-buy").textContent = yuan.format(item.targetBuyCny);
    node.querySelector(".target-sell").textContent = yuan.format(item.targetSellCny);
    node.querySelector(".trigger").textContent = item.trigger;
    const link = node.querySelector("a");
    link.href = item.searchUrl;
    link.textContent = item.platform ? `打开 ${item.platform}` : "打开搜索";
    watchlistGrid.append(node);
  });
}

function renderStatus() {
  const modeText = dataMode === "api" ? "服务器实时数据" : dataMode === "live" ? "静态发布数据" : "静态样例数据";
  const ageMinutes = lastUpdatedAt ? Math.max(0, Math.floor((Date.now() - new Date(lastUpdatedAt).getTime()) / 60000)) : null;
  const freshness = ageMinutes === null ? "" : ageMinutes <= 10 ? ` · ${ageMinutes} 分钟前` : ` · 已过期 ${ageMinutes} 分钟`;
  refreshStatus.textContent = `${modeText} · 上次更新 ${lastUpdatedAt ? dateTime.format(new Date(lastUpdatedAt)) : "--"}${freshness}`;
  if (dataMode === "api") {
    const connected = sourceStatus.filter((source) => source.connected).map((source) => `${source.name} ${source.count ?? 0}条`);
    const unavailable = sourceStatus.filter((source) => !source.connected).map((source) => source.name);
    dataModeNote.textContent = `已核验：${connected.join("、") || "暂无"}；待核验候选 ${candidateListings.length} 条。未接通：${unavailable.join("、") || "无"}。前端每 60 秒读取服务器最新快照。`;
  } else if (dataMode === "live") {
    dataModeNote.textContent = "当前仍是 GitHub 静态快照；配置 HTTPS 实时 API 后才会产生新价格和浮动。";
  } else {
    dataModeNote.textContent = "当前为样例兜底；实时服务器和发布数据均不可用。";
  }
}

function render() {
  const rows = sortedRows();
  const strategyRows = marketRows();
  renderTypeTabs();
  renderSelect(categoryFilter, categories(), state.category);
  renderSelect(platformFilter, platforms(), state.platform);
  renderSelect(marketClassFilter, marketClasses(), state.marketClass);
  renderMetrics(rows);
  renderMarketInsights(strategyRows);
  renderMarketTable(strategyRows);
  renderEvents();
  renderActionList();
  renderOpportunities();
  renderTable(rows);
  renderCandidates();
  renderRanks(rows);
  renderWatchlist();
  renderStatus();
}

function loadErrorMessage(error) {
  if (window.location.protocol === "file:") {
    return "读取失败：请通过 GitHub Pages 网站地址或本地 HTTP 服务打开，file:// 无法读取数据文件";
  }
  return `读取失败：${error?.message || "无法下载数据文件"}`;
}

async function loadData() {
  try {
    const endpoint = API_BASE_URL ? `${API_BASE_URL}/api/auctions` : LIVE_URL;
    const response = await fetch(`${endpoint}?t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error("live endpoint unavailable");
    const payload = await response.json();
    auctions = payload.auctions || [];
    candidateListings = payload.candidates || [];
    opportunities = payload.opportunities || [];
    watchlist = payload.watchlist || [];
    lastUpdatedAt = payload.lastUpdatedAt || new Date().toISOString();
    sourceStatus = payload.sources || [];
    dataMode =
      API_BASE_URL && payload.mode === "live"
        ? "api"
        : payload.mode === "sample"
          ? "local"
          : API_BASE_URL
            ? "api"
            : "live";
  } catch {
    try {
      const fallbackEndpoint = API_BASE_URL ? LIVE_URL : FALLBACK_URL;
      const response = await fetch(`${fallbackEndpoint}?t=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) throw new Error("published data unavailable");
      const payload = await response.json();
      auctions = payload.auctions || [];
      candidateListings = payload.candidates || [];
      opportunities = payload.opportunities || [];
      watchlist = payload.watchlist || [];
      lastUpdatedAt = payload.lastUpdatedAt || new Date().toISOString();
      sourceStatus = [];
      dataMode = API_BASE_URL ? "live" : "local";
    } catch {
      const response = await fetch(`${FALLBACK_URL}?t=${Date.now()}`, { cache: "no-store" });
      const payload = await response.json();
      auctions = payload.auctions || [];
      candidateListings = payload.candidates || [];
      opportunities = payload.opportunities || [];
      watchlist = payload.watchlist || [];
      lastUpdatedAt = payload.lastUpdatedAt || new Date().toISOString();
      sourceStatus = [];
      dataMode = "local";
    }
  }
  try {
    const response = await fetch(`${MARKET_URL}?t=${Date.now()}`, { cache: "no-store" });
    marketMeta = await response.json();
    marketCards = marketMeta.cards || [];
    marketEvents = marketMeta.events || [];
  } catch {
    marketMeta = null;
    marketCards = [];
    marketEvents = [];
  }
  render();
}

async function triggerRefresh() {
  refreshButton.disabled = true;
  refreshButton.textContent = "读取中";
  refreshStatus.textContent = API_BASE_URL ? "服务器正在抓取各平台最新价格..." : "正在重新读取已发布的数据文件...";
  try {
    let refreshOutcome = null;
    if (API_BASE_URL) {
      const response = await fetch(`${API_BASE_URL}/api/refresh`, {
        method: "POST",
        cache: "no-store",
      });
      const result = await response.json();
      if (response.status === 429) {
        await loadData();
        const sourceTime = lastUpdatedAt ? dateTime.format(new Date(lastUpdatedAt)) : "--";
        refreshStatus.textContent = `${result.message} · 当前显示 ${sourceTime} 的数据`;
        return;
      }
      if (!response.ok || !result.ok) throw new Error(result.message || "服务器抓取失败");
      refreshOutcome = await waitForRefresh(result.refreshRunId);
    }
    await loadData();
    const sourceTime = lastUpdatedAt ? dateTime.format(new Date(lastUpdatedAt)) : "--";
    refreshStatus.textContent = refreshOutcome?.preserved
      ? `${refreshOutcome.message} · 当前数据 ${sourceTime}`
      : `${API_BASE_URL ? "抓取完成" : "读取成功"} ${dateTime.format(new Date())} · 数据更新 ${sourceTime}`;
  } catch (error) {
    refreshStatus.textContent = loadErrorMessage(error);
  } finally {
    refreshButton.disabled = false;
    refreshButton.textContent = "重新读取";
  }
}

async function waitForRefresh(runId) {
  const deadline = Date.now() + 5 * 60 * 1000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => window.setTimeout(resolve, 2000));
    const response = await fetch(`${API_BASE_URL}/api/status?t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error("无法读取服务器刷新状态");
    const status = await response.json();
    if (status.refreshing || status.refreshRunId < runId) {
      refreshStatus.textContent = `服务器抓取中 · 任务 ${status.refreshRunId}`;
      continue;
    }
    if (!status.refreshResult?.ok) {
      throw new Error(status.lastRefreshError || status.refreshResult?.message || "服务器抓取失败");
    }
    return status.refreshResult;
  }
  throw new Error("服务器抓取超时，请稍后查看状态");
}

function exportWatchlistCsv() {
  const header = ["分类", "中文名", "英文名", "平台", "目标买入", "目标卖出", "触发条件", "搜索链接"];
  const rows = watchlist.map((item) => [
    item.category,
    item.cnName,
    item.cardName,
    item.platform,
    item.targetBuyCny,
    item.targetSellCny,
    item.trigger,
    item.searchUrl,
  ]);
  const csv = [header, ...rows].map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "ptcg-psa10-watchlist.csv";
  link.click();
  URL.revokeObjectURL(url);
}

searchInput.addEventListener("input", (event) => {
  state.query = event.target.value.trim();
  render();
});

categoryFilter.addEventListener("change", (event) => {
  state.category = event.target.value;
  render();
});

platformFilter.addEventListener("change", (event) => {
  state.platform = event.target.value;
  render();
});

marketClassFilter.addEventListener("change", (event) => {
  state.marketClass = event.target.value;
  render();
});

sortBy.addEventListener("change", (event) => {
  state.sortBy = event.target.value;
  render();
});

marketSortBy.addEventListener("change", (event) => {
  state.marketSortBy = event.target.value;
  render();
});

refreshButton.addEventListener("click", triggerRefresh);
exportWatchlist.addEventListener("click", exportWatchlistCsv);

loadData().catch((error) => {
  refreshStatus.textContent = loadErrorMessage(error);
});
window.setInterval(() => {
  loadData().catch((error) => {
    refreshStatus.textContent = loadErrorMessage(error);
  });
}, AUTO_REFRESH_MS);
