const FALLBACK_URL = "./data/auctions.example.json";
const MARKET_URL = "./data/market-year.json";
const LIVE_URL = "./data/auctions.live.json";
const AUTO_REFRESH_MS = 5 * 60 * 1000;

let auctions = [];
let watchlist = [];
let marketCards = [];
let marketEvents = [];
let marketMeta = null;
let lastUpdatedAt = null;
let dataMode = "local";

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
  const ms = new Date(date).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return "已结束";
  const minutes = Math.floor(ms / 60000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  if (days) return `${days}天${hours}小时`;
  return `${hours}小时${minutes % 60}分`;
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
  const hasVerifiedYear = item.priceStatus === "verified" && isNumber(item.startUsd) && item.startUsd > 0 && isNumber(item.currentUsd);
  const growthPct = hasVerifiedYear ? (item.currentUsd - item.startUsd) / item.startUsd : null;
  const unrealizedProfitUsd = hasVerifiedYear ? item.currentUsd - item.startUsd : null;
  const targetSellUsd = isNumber(item.currentUsd) ? item.currentUsd * (1 + item.targetReturnPct) : null;
  const stopLossBase = isNumber(item.costBasisUsd) ? item.costBasisUsd : item.startUsd;
  const stopLossUsd = isNumber(stopLossBase) ? stopLossBase * (1 + item.stopLossPct) : null;
  const heatScore = Math.round(
    item.catalystScore * 0.42 +
      item.liquidity * 0.28 +
      Math.min((growthPct || 0) * 100, 160) * 0.22 -
      item.popRisk * 0.08 -
      (hasVerifiedYear ? 0 : 18)
  );
  const holdLabel =
    item.holdMaxDays <= 100
      ? "短线"
      : item.holdMaxDays <= 220
        ? "中线"
        : "中长线";
  return {
    ...item,
    hasVerifiedYear,
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
  const verifiedRows = all.filter((row) => row.hasVerifiedYear);
  const topGrowth = verifiedRows.reduce((best, row) => (!best || row.growthPct > best.growthPct ? row : best), null);
  const topProfit = verifiedRows.reduce((best, row) => (!best || row.unrealizedProfitUsd > best.unrealizedProfitUsd ? row : best), null);
  const topCatalyst = all.reduce((best, row) => (!best || row.heatScore > best.heatScore ? row : best), null);
  document.querySelector("#topGrowthCard").textContent = topGrowth ? topGrowth.cardName : "--";
  document.querySelector("#topGrowthValue").textContent = topGrowth ? pct.format(topGrowth.growthPct) : "等待一年前节点";
  document.querySelector("#topProfitCard").textContent = topProfit ? topProfit.cardName : "--";
  document.querySelector("#topProfitValue").textContent = topProfit
    ? `${usd(topProfit.unrealizedProfitUsd)} / ${yuan.format(topProfit.unrealizedProfitUsd * (marketMeta?.fx?.USD_CNY || 7.2))}`
    : "等待一年前节点";
  document.querySelector("#topCatalystCard").textContent = topCatalyst ? topCatalyst.cardName : "--";
  document.querySelector("#topCatalystValue").textContent = topCatalyst ? `${topCatalyst.heatScore} 分` : "--";
  const pending = all.filter((row) => !row.hasVerifiedYear).length;
  marketDataNote.textContent = marketMeta
    ? `本机数据 ${new Date(marketMeta.lastUpdatedAt).toLocaleString("zh-CN")} · ${rows.length} 张卡 · ${pending} 张待复核一年前 PSA10 节点`
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
    tr.className = [row.heatScore >= 90 ? "hot" : "", row.hasVerifiedYear ? "" : "pending-row"].filter(Boolean).join(" ");
    const sourceStatus = row.hasVerifiedYear ? "PSA10节点已核" : "待复核一年节点";
    tr.innerHTML = `
      <td><span class="tag">${row.assetClass}</span></td>
      <td>
        <strong>${row.cardName}</strong>
        <small>${row.nearTermCatalyst}</small>
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
  const positive = rows.filter((row) => row.actualProfit > 0);
  const nearest = rows.reduce((best, row) => {
    if (!best) return row;
    return new Date(row.auctionEndAt) < new Date(best.auctionEndAt) ? row : best;
  }, null);
  const pricedRows = rows.filter((row) => row.currentBidCny > 0);
  const avgFeeRate = pricedRows.length
    ? pricedRows.reduce((sum, row) => sum + row.fees.total / row.currentBidCny, 0) / pricedRows.length
    : 0;
  document.querySelector("#metricListings").textContent = rows.length;
  document.querySelector("#metricPositive").textContent = positive.length;
  document.querySelector("#metricProfit").textContent = rows.length ? yuan.format(Math.max(...rows.map((row) => row.actualProfit))) : "¥0";
  document.querySelector("#metricEnding").textContent = nearest ? remainingText(nearest.auctionEndAt) : "--";
  document.querySelector("#metricFeeRate").textContent = pct.format(avgFeeRate);
}

function rowClass(row) {
  if (row.actualProfit <= 0) return "loss";
  if (row.roi >= 0.18) return "hot";
  return "";
}

function renderTable(rows) {
  auctionBody.innerHTML = "";
  if (!rows.length) {
    auctionBody.innerHTML = `<tr><td colspan="13" class="empty-cell">没有匹配的拍卖条目</td></tr>`;
    return;
  }
  rows.forEach((row) => {
    const tr = document.createElement("tr");
    tr.className = rowClass(row);
    tr.innerHTML = `
      <td><span class="tag">${row.type}</span><span class="subtag">${row.category}</span></td>
      <td>
        <strong>${row.cnName}</strong>
        <small>${row.sourceTitle || `${row.cardName} · ${row.set} · ${row.language} · ${row.psaCert}`}</small>
      </td>
      <td><span class="platform-pill">${row.platform}</span></td>
      <td class="money">${yuan.format(row.currentBidCny)}</td>
      <td class="money">${yuan.format(row.expectedSaleCny)}</td>
      <td class="money">${yuan.format(row.grossProfit)}</td>
      <td>
        <strong>${yuan.format(row.fees.total)}</strong>
        <small>平台 ${yuan.format(row.fees.platformFee)} · 支付 ${yuan.format(row.fees.paymentFee)}</small>
      </td>
      <td class="money emphasis">${yuan.format(row.actualProfit)}</td>
      <td class="roi">${pct.format(row.roi)}</td>
      <td>${row.holdingDays}天</td>
      <td>${remainingText(row.auctionEndAt)}<small>${dateTime.format(new Date(row.auctionEndAt))}</small></td>
      <td><span class="status">${row.status}</span><small>${row.lastCapturedAt ? dateTime.format(new Date(row.lastCapturedAt)) : ""}</small></td>
      <td>
        <a class="link-button" href="${row.url}" target="_blank" rel="noreferrer">打开</a>
        ${row.screenshot ? `<a class="capture-link" href="${row.screenshot}" target="_blank" rel="noreferrer">截图</a>` : ""}
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
  const modeText = dataMode === "live" ? "静态发布数据" : "静态样例数据";
  refreshStatus.textContent = `${modeText} · 上次更新 ${lastUpdatedAt ? dateTime.format(new Date(lastUpdatedAt)) : "--"}`;
  dataModeNote.textContent =
    dataMode === "live"
      ? "数据来自随网站发布的监控文件；页面每 5 分钟自动重新读取。"
      : "当前为样例兜底；发布数据文件缺失时自动读取样例。";
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
  renderTable(rows);
  renderRanks(rows);
  renderWatchlist();
  renderStatus();
}

async function loadData() {
  try {
    const response = await fetch(`${LIVE_URL}?t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error("live endpoint unavailable");
    const payload = await response.json();
    auctions = payload.auctions || [];
    watchlist = payload.watchlist || [];
    lastUpdatedAt = payload.lastUpdatedAt || new Date().toISOString();
    dataMode = "live";
  } catch {
    const response = await fetch(`${FALLBACK_URL}?t=${Date.now()}`, { cache: "no-store" });
    const payload = await response.json();
    auctions = payload.auctions || [];
    watchlist = payload.watchlist || [];
    lastUpdatedAt = payload.lastUpdatedAt || new Date().toISOString();
    dataMode = "local";
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
  try {
    await loadData();
  } catch {
    await loadData();
  } finally {
    refreshButton.disabled = false;
    refreshButton.textContent = "重新读取";
  }
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

loadData();
window.setInterval(loadData, AUTO_REFRESH_MS);
