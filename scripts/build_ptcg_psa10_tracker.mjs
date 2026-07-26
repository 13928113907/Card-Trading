import fs from "node:fs/promises";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const outputDir = "/Users/be/Documents/宝可梦拍卖/outputs/ptcg_psa10_tracker";
await fs.mkdir(outputDir, { recursive: true });

const workbook = Workbook.create();
workbook.comments.setSelf({ displayName: "User" });

const sheets = {
  dashboard: workbook.worksheets.add("Dashboard"),
  scanner: workbook.worksheets.add("机会扫描"),
  live: workbook.worksheets.add("实时行情"),
  realtime: workbook.worksheets.add("实时设置"),
  ledger: workbook.worksheets.add("交易台账"),
  fees: workbook.worksheets.add("平台参数"),
  watchlist: workbook.worksheets.add("观察清单"),
  dictionary: workbook.worksheets.add("字段说明"),
};

const navy = "#153243";
const teal = "#0F766E";
const mint = "#DDF4EC";
const amber = "#FFF1C2";
const rose = "#FDE2E1";
const blue = "#E7F0FF";
const gray = "#F5F7FA";
const border = "#D7DEE8";
const darkText = "#182230";

function styleTitle(sheet, range, title, subtitle) {
  sheet.showGridLines = false;
  range.merge();
  range.values = [[title]];
  range.format = {
    fill: navy,
    font: { bold: true, color: "#FFFFFF", size: 16 },
    horizontalAlignment: "left",
    verticalAlignment: "center",
  };
  range.format.rowHeight = 34;
  const sub = sheet.getRange("A2:H2");
  sub.merge();
  sub.values = [[subtitle]];
  sub.format = {
    fill: "#EEF4F7",
    font: { color: "#31475A", size: 10 },
    wrapText: true,
  };
  sub.format.rowHeight = 30;
}

function styleHeader(range, fill = teal) {
  range.format = {
    fill,
    font: { bold: true, color: "#FFFFFF" },
    horizontalAlignment: "center",
    verticalAlignment: "center",
    wrapText: true,
    borders: { preset: "outside", style: "thin", color: border },
  };
}

function setWidths(sheet, widths) {
  widths.forEach((w, i) => {
    sheet.getCell(0, i).format.columnWidth = w;
  });
}

function band(range) {
  range.format = {
    fill: gray,
    borders: {
      insideHorizontal: { style: "thin", color: "#E7ECF2" },
      insideVertical: { style: "thin", color: "#E7ECF2" },
      top: { style: "thin", color: border },
      bottom: { style: "thin", color: border },
    },
    verticalAlignment: "center",
  };
}

// Platform parameters
styleTitle(
  sheets.fees,
  sheets.fees.getRange("A1:J1"),
  "PTCG PSA10 平台参数",
  "所有手续费、汇率、物流和风险假设都在这里维护；机会扫描和交易台账会引用这些输入。"
);

const feeHeaders = [
  "平台",
  "网站",
  "币种",
  "汇率至CNY",
  "买家佣金%",
  "卖家佣金%",
  "支付/提现%",
  "入库/国际运费",
  "出库/国内运费",
  "备注",
];
const feeRows = [
  ["eBay", "https://www.ebay.com", "USD", 7.2, 0.0, 0.13, 0.03, 120, 20, "按账号、品类和跨境方案更新"],
  ["ALT", "https://www.alt.xyz", "USD", 7.2, 0.0, 0.08, 0.03, 120, 20, "请按收藏品/保险/提现规则更新"],
  ["Card Hobby", "http://www.cardhobby.com.cn/", "CNY", 1.0, 0.05, 0.05, 0.01, 20, 15, "请按拍卖佣金、保证金和运费更新"],
  ["Fanatics Collect", "https://www.fanaticscollect.com", "USD", 7.2, 0.0, 0.10, 0.03, 120, 20, "原 PWCC/Fanatics Collect 规则可能变动"],
  ["PokerColor", "https://pokecolor.com/", "CNY", 1.0, 0.03, 0.03, 0.01, 15, 15, "备用 H5 入口：https://pokecolor.cn/h5/"],
];
sheets.fees.getRange("A4:J4").values = [feeHeaders];
sheets.fees.getRange("A5:J9").values = feeRows;
styleHeader(sheets.fees.getRange("A4:J4"), "#375A7F");
band(sheets.fees.getRange("A5:J9"));
sheets.fees.getRange("D5:I9").setNumberFormat("#,##0.00");
sheets.fees.getRange("E5:G9").setNumberFormat("0.0%");
sheets.fees.tables.add("A4:J9", true, "PlatformFees");
sheets.fees.freezePanes.freezeRows(4);
setWidths(sheets.fees, [18, 34, 10, 12, 12, 12, 12, 14, 14, 36]);
sheets.fees.getRange("A11:J14").values = [
  ["使用提醒", null, null, null, null, null, null, null, null, null],
  ["1. 平台费率会变化，首次真实交易前请核对每个平台的最新规则。", null, null, null, null, null, null, null, null, null],
  ["2. 汇率、税费、代购费、保险和退货损耗请按你的实际方案填入。", null, null, null, null, null, null, null, null, null],
  ["3. 模板默认值只是用于跑通模型，不构成投资或交易建议。", null, null, null, null, null, null, null, null, null],
];
sheets.fees.getRange("A11:J11").merge();
sheets.fees.getRange("A12:J12").merge();
sheets.fees.getRange("A13:J13").merge();
sheets.fees.getRange("A14:J14").merge();
sheets.fees.getRange("A11:J14").format = { fill: amber, font: { color: darkText }, wrapText: true };

// Realtime settings
styleTitle(
  sheets.realtime,
  sheets.realtime.getRange("A1:K1"),
  "实时设置",
  "配置每个平台的实时接入方式。eBay 可用官方 API 刷新；其他平台先保留链接/状态，拿到可用 API 或登录方案后接入。"
);
const realtimeHeaders = ["平台", "实时模式", "刷新频率", "凭证来源", "支持买价", "支持卖价", "状态", "官方/入口URL", "本地刷新脚本", "限制", "备注"];
sheets.realtime.getRange("A4:K4").values = [realtimeHeaders];
styleHeader(sheets.realtime.getRange("A4:K4"), "#334155");
sheets.realtime.getRange("A5:K9").values = [
  ["eBay", "API", "手动/定时", "环境变量 EBAY_CLIENT_ID / EBAY_CLIENT_SECRET", true, true, "可接入", "https://developer.ebay.com/api-docs/buy/browse/resources/item_summary/methods/search", "scripts/refresh_live_prices.mjs", "Browse API 反映当前挂牌，不等同 sold comps", "可先用最低挂牌做买价，分位数挂牌做卖价参考"],
  ["ALT", "链接监控", "手动", "登录态/API待确认", true, true, "待接入", "https://www.alt.xyz", "待接入", "公开 API 不明确", "先在实时行情维护搜索链接和手动刷新状态"],
  ["Card Hobby", "链接监控", "手动", "登录态/API待确认", true, true, "待接入", "http://www.cardhobby.com.cn/", "待接入", "公开 API 不明确", "拍卖成交/保证金规则需按账号确认"],
  ["Fanatics Collect", "链接监控", "手动", "登录态/API待确认", true, true, "待接入", "https://www.fanaticscollect.com", "待接入", "公开 API 不明确", "挂牌和成交口径需分开"],
  ["PokerColor", "链接监控", "手动", "登录态/API待确认", true, true, "待接入", "https://pokecolor.com/", "待接入", "公开 API 不明确", "H5 入口：https://pokecolor.cn/h5/"],
];
sheets.realtime.getRange("E5:F9").setNumberFormat("General");
sheets.realtime.tables.add("A4:K9", true, "RealtimeSettings");
sheets.realtime.freezePanes.freezeRows(4);
setWidths(sheets.realtime, [18, 14, 14, 36, 10, 10, 12, 48, 28, 30, 42]);
sheets.realtime.getRange("A11:K16").values = [
  ["刷新流程", null, null, null, null, null, null, null, null, null, null],
  ["1. 在“实时行情”表维护每张卡每个平台的搜索词和源链接。", null, null, null, null, null, null, null, null, null, null],
  ["2. 有 eBay API 凭证时运行 scripts/refresh_live_prices.mjs 生成 live_market_quotes.csv。", null, null, null, null, null, null, null, null, null, null],
  ["3. 重新运行 scripts/build_ptcg_psa10_tracker.mjs，工作簿会把 live_market_quotes.json 写入“实时行情”。", null, null, null, null, null, null, null, null, null, null],
  ["4. ALT、Card Hobby、Fanatics Collect、PokerColor 在未确认 API 前不做自动抓取，避免账号风控和错误价格。", null, null, null, null, null, null, null, null, null, null],
  ["5. 实时数据用于发现机会，成交前仍需人工核验证书、运费、税费和平台规则。", null, null, null, null, null, null, null, null, null, null],
];
for (let r = 11; r <= 16; r++) sheets.realtime.getRange(`A${r}:K${r}`).merge();
sheets.realtime.getRange("A11:K16").format = { fill: amber, font: { color: darkText }, wrapText: true };

// Live market data
styleTitle(
  sheets.live,
  sheets.live.getRange("A1:M1"),
  "实时行情",
  "本表是机会扫描的价格来源：刷新脚本或人工复核只更新这里，机会扫描会自动读取五个平台的买价/卖价。"
);
const liveHeaders = ["ID", "卡名", "平台", "买价CNY", "卖价CNY", "最低挂牌CNY", "样本数", "更新时间", "状态", "数据模式", "搜索词", "源URL", "备注"];
sheets.live.getRange("A4:M4").values = [liveHeaders];
styleHeader(sheets.live.getRange("A4:M4"), "#0F766E");
let liveRows = [
  ["P001", "Pikachu Promo PSA10", "eBay", 980, 1280, 980, 12, new Date("2026-07-25"), "样例", "API-ready", "Pikachu Promo PSA 10 SV-P", "https://www.ebay.com/sch/i.html?_nkw=Pikachu+Promo+PSA+10+SV-P", "待接 eBay API 后自动刷新"],
  ["P001", "Pikachu Promo PSA10", "ALT", 1020, 1260, 1020, 4, new Date("2026-07-25"), "样例", "链接监控", "Pikachu Promo PSA 10", "https://www.alt.xyz", "需人工/登录态复核"],
  ["P001", "Pikachu Promo PSA10", "Card Hobby", 930, 1180, 930, 5, new Date("2026-07-25"), "样例", "链接监控", "Pikachu Promo PSA10", "http://www.cardhobby.com.cn/", "需人工/登录态复核"],
  ["P001", "Pikachu Promo PSA10", "Fanatics Collect", 1000, 1300, 1000, 3, new Date("2026-07-25"), "样例", "链接监控", "Pikachu Promo PSA 10", "https://www.fanaticscollect.com", "需人工/登录态复核"],
  ["P001", "Pikachu Promo PSA10", "PokerColor", 960, 1210, 960, 4, new Date("2026-07-25"), "样例", "链接监控", "Pikachu Promo PSA10", "https://pokecolor.com/", "H5 入口：https://pokecolor.cn/h5/"],
  ["P002", "Charizard ex SAR PSA10", "eBay", 1800, 2180, 1800, 20, new Date("2026-07-25"), "样例", "API-ready", "Charizard ex SAR PSA 10", "https://www.ebay.com/sch/i.html?_nkw=Charizard+ex+SAR+PSA+10", "待接 eBay API 后自动刷新"],
  ["P002", "Charizard ex SAR PSA10", "ALT", 1760, 2120, 1760, 5, new Date("2026-07-25"), "样例", "链接监控", "Charizard ex SAR PSA 10", "https://www.alt.xyz", "需人工/登录态复核"],
  ["P002", "Charizard ex SAR PSA10", "Card Hobby", 1700, 2050, 1700, 7, new Date("2026-07-25"), "样例", "链接监控", "Charizard ex SAR PSA10", "http://www.cardhobby.com.cn/", "需人工/登录态复核"],
  ["P002", "Charizard ex SAR PSA10", "Fanatics Collect", 1840, 2200, 1840, 4, new Date("2026-07-25"), "样例", "链接监控", "Charizard ex SAR PSA 10", "https://www.fanaticscollect.com", "需人工/登录态复核"],
  ["P002", "Charizard ex SAR PSA10", "PokerColor", 1720, 2080, 1720, 6, new Date("2026-07-25"), "样例", "链接监控", "Charizard ex SAR PSA10", "https://pokecolor.com/", "H5 入口：https://pokecolor.cn/h5/"],
  ["P003", "Lillie Full Art PSA10", "eBay", 0, 0, 0, 0, new Date("2026-07-25"), "无数据", "API-ready", "Lillie Full Art PSA 10", "https://www.ebay.com/sch/i.html?_nkw=Lillie+Full+Art+PSA+10", "待接 eBay API 后自动刷新"],
  ["P003", "Lillie Full Art PSA10", "ALT", 0, 7600, 0, 2, new Date("2026-07-25"), "样例", "链接监控", "Lillie Full Art PSA 10", "https://www.alt.xyz", "需人工/登录态复核"],
  ["P003", "Lillie Full Art PSA10", "Card Hobby", 6800, 7200, 6800, 3, new Date("2026-07-25"), "样例", "链接监控", "Lillie PSA10", "http://www.cardhobby.com.cn/", "需人工/登录态复核"],
  ["P003", "Lillie Full Art PSA10", "Fanatics Collect", 0, 0, 0, 0, new Date("2026-07-25"), "无数据", "链接监控", "Lillie Full Art PSA 10", "https://www.fanaticscollect.com", "需人工/登录态复核"],
  ["P003", "Lillie Full Art PSA10", "PokerColor", 6500, 7350, 6500, 2, new Date("2026-07-25"), "样例", "链接监控", "Lillie PSA10", "https://pokecolor.com/", "H5 入口：https://pokecolor.cn/h5/"],
];
try {
  const liveJsonPath = "/Users/be/Documents/宝可梦拍卖/data/live_market_quotes.json";
  const liveJson = JSON.parse(await fs.readFile(liveJsonPath, "utf8"));
  if (Array.isArray(liveJson.rows) && liveJson.rows.length > 0) {
    const mergedRows = new Map(liveRows.map((row) => [`${row[0]}|${row[2]}`, row]));
    for (const row of liveJson.rows) {
      mergedRows.set(`${row.id ?? ""}|${row.platform ?? ""}`, [
        row.id ?? "",
        row.cardName ?? "",
        row.platform ?? "",
        Number(row.buyPriceCny ?? 0),
        Number(row.sellPriceCny ?? 0),
        Number(row.lowestAskCny ?? 0),
        Number(row.sampleCount ?? 0),
        row.updatedAt ? new Date(row.updatedAt) : new Date(),
        row.status ?? "",
        row.dataMode ?? "",
        row.query ?? "",
        row.sourceUrl ?? "",
        row.notes ?? "",
      ]);
    }
    liveRows = [...mergedRows.values()];
  }
} catch {
  // Keep seeded rows when no live refresh file exists yet.
}
sheets.live.getRange(`A5:M${4 + liveRows.length}`).values = liveRows;
sheets.live.getRange("D5:F124").setNumberFormat("#,##0");
sheets.live.getRange("G5:G124").setNumberFormat("#,##0");
sheets.live.getRange("H5:H124").setNumberFormat("yyyy-mm-dd hh:mm");
sheets.live.getRange("C5:C124").dataValidation = { rule: { type: "list", values: ["eBay", "ALT", "Card Hobby", "Fanatics Collect", "PokerColor"] } };
sheets.live.getRange("I5:I124").dataValidation = { rule: { type: "list", values: ["实时", "样例", "人工复核", "待接入", "无数据", "报错"] } };
sheets.live.getRange("J5:J124").dataValidation = { rule: { type: "list", values: ["API", "API-ready", "链接监控", "手动", "CSV导入"] } };
sheets.live.tables.add("A4:M124", true, "LiveMarket");
sheets.live.freezePanes.freezeRows(4);
sheets.live.freezePanes.freezeColumns(3);
setWidths(sheets.live, [10, 26, 18, 12, 12, 13, 10, 18, 12, 14, 30, 48, 32]);

// Opportunity scanner
styleTitle(
  sheets.scanner,
  sheets.scanner.getRange("A1:AG1"),
  "PTCG PSA10 机会扫描",
  "五个平台价格由“实时行情”表供数；刷新后自动计算最佳购入/售出平台、净利润、ROI、价差和优先级。"
);
const scannerHeaders = [
  "ID",
  "卡名",
  "系列/编号",
  "语言",
  "PSA证书号",
  "PSA10人口",
  "eBay买价",
  "ALT买价",
  "Card Hobby买价",
  "Fanatics买价",
  "PokerColor买价",
  "eBay卖价",
  "ALT卖价",
  "Card Hobby卖价",
  "Fanatics卖价",
  "PokerColor卖价",
  "最低买价",
  "购入平台",
  "最高卖价",
  "售出平台",
  "买方总成本",
  "卖方净回款",
  "预估净利润",
  "ROI",
  "毛价差%",
  "流动性1-5",
  "热度1-5",
  "风险1-5",
  "机会评分",
  "状态",
  "目标买入价",
  "最近检查",
  "备注",
];
sheets.scanner.getRange("A4:AG4").values = [scannerHeaders];
styleHeader(sheets.scanner.getRange("A4:AG4"));

const sampleRows = [
  ["P001", "Pikachu Promo PSA10", "SV-P / Promo", "日文", "", 0, 980, 1020, 930, 1000, 960, 1280, 1260, 1180, 1300, 1210, null, null, null, null, null, null, null, null, null, 4, 5, 2, null, "观察", null, new Date("2026-07-24"), "样例：请替换为真实卡片"],
  ["P002", "Charizard ex SAR PSA10", "SV / SAR", "日文", "", 0, 1800, 1760, 1700, 1840, 1720, 2180, 2120, 2050, 2200, 2080, null, null, null, null, null, null, null, null, null, 5, 5, 3, null, "可谈价", null, new Date("2026-07-24"), "样例"],
  ["P003", "Lillie Full Art PSA10", "SM / Trainer", "日文", "", 0, 0, 0, 6800, 0, 6500, 0, 7600, 7200, 0, 7350, null, null, null, null, null, null, null, null, null, 3, 5, 4, null, "高风险", null, new Date("2026-07-24"), "样例：高单价需严查证书"],
];
sheets.scanner.getRange("A5:AG7").values = sampleRows;

for (let r = 5; r <= 104; r++) {
  sheets.scanner.getRange(`G${r}:K${r}`).formulas = [[
    `=SUMIFS('实时行情'!$D$5:$D$124,'实时行情'!$A$5:$A$124,$A${r},'实时行情'!$C$5:$C$124,"eBay")`,
    `=SUMIFS('实时行情'!$D$5:$D$124,'实时行情'!$A$5:$A$124,$A${r},'实时行情'!$C$5:$C$124,"ALT")`,
    `=SUMIFS('实时行情'!$D$5:$D$124,'实时行情'!$A$5:$A$124,$A${r},'实时行情'!$C$5:$C$124,"Card Hobby")`,
    `=SUMIFS('实时行情'!$D$5:$D$124,'实时行情'!$A$5:$A$124,$A${r},'实时行情'!$C$5:$C$124,"Fanatics Collect")`,
    `=SUMIFS('实时行情'!$D$5:$D$124,'实时行情'!$A$5:$A$124,$A${r},'实时行情'!$C$5:$C$124,"PokerColor")`,
  ]];
  sheets.scanner.getRange(`L${r}:P${r}`).formulas = [[
    `=SUMIFS('实时行情'!$E$5:$E$124,'实时行情'!$A$5:$A$124,$A${r},'实时行情'!$C$5:$C$124,"eBay")`,
    `=SUMIFS('实时行情'!$E$5:$E$124,'实时行情'!$A$5:$A$124,$A${r},'实时行情'!$C$5:$C$124,"ALT")`,
    `=SUMIFS('实时行情'!$E$5:$E$124,'实时行情'!$A$5:$A$124,$A${r},'实时行情'!$C$5:$C$124,"Card Hobby")`,
    `=SUMIFS('实时行情'!$E$5:$E$124,'实时行情'!$A$5:$A$124,$A${r},'实时行情'!$C$5:$C$124,"Fanatics Collect")`,
    `=SUMIFS('实时行情'!$E$5:$E$124,'实时行情'!$A$5:$A$124,$A${r},'实时行情'!$C$5:$C$124,"PokerColor")`,
  ]];
  const formulas = [
    `=IFERROR(MIN(FILTER(G${r}:K${r},G${r}:K${r}>0)),0)`,
    `=IF(Q${r}=0,"",SUBSTITUTE(SUBSTITUTE(INDEX($G$4:$K$4,1,MATCH(Q${r},G${r}:K${r},0)),"买价",""),"Fanatics","Fanatics Collect"))`,
    `=IFERROR(MAX(FILTER(L${r}:P${r},L${r}:P${r}>0)),0)`,
    `=IF(S${r}=0,"",SUBSTITUTE(SUBSTITUTE(INDEX($L$4:$P$4,1,MATCH(S${r},L${r}:P${r},0)),"卖价",""),"Fanatics","Fanatics Collect"))`,
    `=IF(Q${r}=0,0,Q${r}*(1+XLOOKUP(R${r},'平台参数'!$A$5:$A$9,'平台参数'!$E$5:$E$9,0)+XLOOKUP(R${r},'平台参数'!$A$5:$A$9,'平台参数'!$G$5:$G$9,0))+XLOOKUP(R${r},'平台参数'!$A$5:$A$9,'平台参数'!$H$5:$H$9,0))`,
    `=IF(S${r}=0,0,S${r}*(1-XLOOKUP(T${r},'平台参数'!$A$5:$A$9,'平台参数'!$F$5:$F$9,0)-XLOOKUP(T${r},'平台参数'!$A$5:$A$9,'平台参数'!$G$5:$G$9,0))-XLOOKUP(T${r},'平台参数'!$A$5:$A$9,'平台参数'!$I$5:$I$9,0))`,
    `=V${r}-U${r}`,
    `=IFERROR(W${r}/U${r},0)`,
    `=IFERROR((S${r}-Q${r})/Q${r},0)`,
    null,
    null,
    null,
    `=IF(A${r}="","",ROUND((Z${r}+AA${r})*10+X${r}*100-AB${r}*8,1))`,
    null,
    `=IF(T${r}="",0,(S${r}*(1-XLOOKUP(T${r},'平台参数'!$A$5:$A$9,'平台参数'!$F$5:$F$9,0)-XLOOKUP(T${r},'平台参数'!$A$5:$A$9,'平台参数'!$G$5:$G$9,0))-XLOOKUP(T${r},'平台参数'!$A$5:$A$9,'平台参数'!$I$5:$I$9,0))/1.18)`,
  ];
  sheets.scanner.getRange(`Q${r}:AE${r}`).formulas = [formulas];
  sheets.scanner.getRange(`AF${r}`).formulas = [[`=IF(A${r}="","",IFERROR(MAX(FILTER('实时行情'!$H$5:$H$124,'实时行情'!$A$5:$A$124=A${r})),TODAY()))`]];
}

sheets.scanner.getRange("A5:AG104").format = {
  borders: {
    insideHorizontal: { style: "thin", color: "#E8EEF5" },
    insideVertical: { style: "thin", color: "#EEF3F8" },
  },
  verticalAlignment: "center",
};
sheets.scanner.getRange("G5:W104").setNumberFormat("#,##0");
sheets.scanner.getRange("X5:Y104").setNumberFormat("0.0%");
sheets.scanner.getRange("Z5:AC104").setNumberFormat("0.0");
sheets.scanner.getRange("AE5:AE104").setNumberFormat("#,##0");
sheets.scanner.getRange("AF5:AF104").setNumberFormat("yyyy-mm-dd");
sheets.scanner.getRange("AD5:AD104").dataValidation = { rule: { type: "list", values: ["观察", "可谈价", "准备购入", "已购入", "已上架", "已售出", "跳过", "高风险"] } };
sheets.scanner.getRange("D5:D104").dataValidation = { rule: { type: "list", values: ["日文", "英文", "中文", "韩文", "其他"] } };
sheets.scanner.getRange("Z5:AB104").dataValidation = { rule: { type: "whole", operator: "between", formula1: 1, formula2: 5 } };
sheets.scanner.getRange("W5:W104").conditionalFormats.add("cellIs", { operator: "greaterThan", formula: 0, format: { fill: "#DCFCE7", font: { color: "#14532D" } } });
sheets.scanner.getRange("W5:W104").conditionalFormats.add("cellIs", { operator: "lessThan", formula: 0, format: { fill: rose, font: { color: "#7F1D1D" } } });
sheets.scanner.getRange("X5:X104").conditionalFormats.add("cellIs", { operator: "greaterThanOrEqual", formula: 0.15, format: { fill: "#DFF6DD", font: { bold: true, color: "#14532D" } } });
sheets.scanner.tables.add("A4:AG104", true, "OpportunityScanner");
sheets.scanner.freezePanes.freezeRows(4);
sheets.scanner.freezePanes.freezeColumns(2);
setWidths(sheets.scanner, [10, 26, 18, 10, 16, 12, 12, 12, 16, 14, 15, 12, 12, 16, 14, 15, 12, 14, 12, 14, 13, 13, 13, 10, 10, 11, 9, 9, 11, 12, 13, 12, 28]);

// Trade ledger
styleTitle(
  sheets.ledger,
  sheets.ledger.getRange("A1:Z1"),
  "PTCG PSA10 交易台账",
  "记录真实购入、上架和售出数据；可追踪库存、实际利润、ROI、持仓天数和现金回收。"
);
const ledgerHeaders = [
  "交易ID",
  "卡名",
  "系列/编号",
  "语言",
  "PSA证书号",
  "购入日期",
  "购入平台",
  "购入价",
  "购入费率%",
  "购入运费",
  "总成本",
  "上架日期",
  "售出日期",
  "售出平台",
  "售出价",
  "售出费率%",
  "支付/提现%",
  "出货运费",
  "净回款",
  "实际利润",
  "ROI",
  "持仓天数",
  "状态",
  "买家/订单号",
  "PSA查询URL",
  "备注",
];
sheets.ledger.getRange("A4:Z4").values = [ledgerHeaders];
styleHeader(sheets.ledger.getRange("A4:Z4"), "#4B5563");
sheets.ledger.getRange("A5:Z7").values = [
  ["T001", "Pikachu Promo PSA10", "SV-P / Promo", "日文", "", new Date("2026-07-24"), "Card Hobby", 930, null, null, null, new Date("2026-07-24"), null, "Fanatics Collect", 1300, null, null, null, null, null, null, null, "库存", "", "", "样例"],
  ["T002", "Charizard ex SAR PSA10", "SV / SAR", "日文", "", new Date("2026-07-24"), "PokerColor", 1720, null, null, null, new Date("2026-07-24"), null, "eBay", 2180, null, null, null, null, null, null, null, "已上架", "", "", "样例"],
  ["T003", "Lillie Full Art PSA10", "SM / Trainer", "日文", "", new Date("2026-07-24"), "PokerColor", 6500, null, null, null, null, null, "", 0, null, null, null, null, null, null, null, "观察", "", "", "样例"],
];
for (let r = 5; r <= 204; r++) {
  sheets.ledger.getRange(`I${r}:K${r}`).formulas = [[
    `=IF(G${r}="",0,XLOOKUP(G${r},'平台参数'!$A$5:$A$9,'平台参数'!$E$5:$E$9,0)+XLOOKUP(G${r},'平台参数'!$A$5:$A$9,'平台参数'!$G$5:$G$9,0))`,
    `=IF(G${r}="",0,XLOOKUP(G${r},'平台参数'!$A$5:$A$9,'平台参数'!$H$5:$H$9,0))`,
    `=IF(H${r}=0,0,H${r}*(1+I${r})+J${r})`,
  ]];
  sheets.ledger.getRange(`P${r}:V${r}`).formulas = [[
    `=IF(N${r}="",0,XLOOKUP(N${r},'平台参数'!$A$5:$A$9,'平台参数'!$F$5:$F$9,0))`,
    `=IF(N${r}="",0,XLOOKUP(N${r},'平台参数'!$A$5:$A$9,'平台参数'!$G$5:$G$9,0))`,
    `=IF(N${r}="",0,XLOOKUP(N${r},'平台参数'!$A$5:$A$9,'平台参数'!$I$5:$I$9,0))`,
    `=IF(O${r}=0,0,O${r}*(1-P${r}-Q${r})-R${r})`,
    `=S${r}-K${r}`,
    `=IFERROR(T${r}/K${r},0)`,
    `=IF(F${r}="",0,IF(M${r}="",TODAY()-F${r},M${r}-F${r}))`,
  ]];
}
sheets.ledger.getRange("F5:F204").setNumberFormat("yyyy-mm-dd");
sheets.ledger.getRange("L5:M204").setNumberFormat("yyyy-mm-dd");
sheets.ledger.getRange("H5:K204").setNumberFormat("#,##0");
sheets.ledger.getRange("O5:T204").setNumberFormat("#,##0");
sheets.ledger.getRange("I5:I204").setNumberFormat("0.0%");
sheets.ledger.getRange("P5:Q204").setNumberFormat("0.0%");
sheets.ledger.getRange("U5:U204").setNumberFormat("0.0%");
sheets.ledger.getRange("V5:V204").setNumberFormat("#,##0");
sheets.ledger.getRange("G5:G204").dataValidation = { rule: { type: "list", values: ["eBay", "ALT", "Card Hobby", "Fanatics Collect", "PokerColor"] } };
sheets.ledger.getRange("N5:N204").dataValidation = { rule: { type: "list", values: ["", "eBay", "ALT", "Card Hobby", "Fanatics Collect", "PokerColor"] } };
sheets.ledger.getRange("W5:W204").dataValidation = { rule: { type: "list", values: ["观察", "库存", "已上架", "已售出", "退货", "亏损止损"] } };
sheets.ledger.getRange("T5:T204").conditionalFormats.add("cellIs", { operator: "lessThan", formula: 0, format: { fill: rose, font: { color: "#7F1D1D" } } });
sheets.ledger.getRange("T5:T204").conditionalFormats.add("cellIs", { operator: "greaterThan", formula: 0, format: { fill: "#DCFCE7", font: { color: "#14532D" } } });
sheets.ledger.tables.add("A4:Z204", true, "TradeLedger");
sheets.ledger.freezePanes.freezeRows(4);
sheets.ledger.freezePanes.freezeColumns(2);
setWidths(sheets.ledger, [10, 24, 18, 10, 16, 12, 16, 12, 11, 11, 12, 12, 12, 16, 12, 11, 11, 11, 12, 12, 10, 10, 12, 18, 24, 28]);

// Watchlist
styleTitle(
  sheets.watchlist,
  sheets.watchlist.getRange("A1:O1"),
  "观察清单",
  "用于记录还没有进入机会扫描的卡、触发价格和来源链接。"
);
const watchHeaders = ["卡名", "系列/编号", "语言", "目标等级", "目标买入价", "目标卖出价", "主要平台", "触发条件", "当前状态", "最近查看", "eBay链接", "ALT链接", "Card Hobby链接", "Fanatics链接", "PokerColor链接"];
sheets.watchlist.getRange("A4:O4").values = [watchHeaders];
styleHeader(sheets.watchlist.getRange("A4:O4"), "#6B7280");
sheets.watchlist.getRange("A5:O9").values = [
  ["Pikachu Promo", "SV-P / Promo", "日文", "PSA10", 900, 1250, "Card Hobby", "低于目标买入价且证书清晰", "跟踪", new Date("2026-07-24"), "", "", "", "", ""],
  ["Charizard ex SAR", "SV / SAR", "日文", "PSA10", 1650, 2150, "PokerColor", "卖盘低于近30日均价15%", "跟踪", new Date("2026-07-24"), "", "", "", "", ""],
  ["Lillie Full Art", "SM / Trainer", "日文", "PSA10", 6100, 7500, "PokerColor", "证书、壳和成交记录全部确认", "谨慎", new Date("2026-07-24"), "", "", "", "", ""],
  ["Gengar VMAX Alt Art", "Fusion Strike", "英文", "PSA10", 0, 0, "eBay", "等待成交数据", "待研究", new Date("2026-07-24"), "", "", "", "", ""],
  ["Mewtwo GX Secret", "SM", "日文", "PSA10", 0, 0, "ALT", "等待低价拍卖", "待研究", new Date("2026-07-24"), "", "", "", "", ""],
];
sheets.watchlist.getRange("E5:F104").setNumberFormat("#,##0");
sheets.watchlist.getRange("J5:J104").setNumberFormat("yyyy-mm-dd");
sheets.watchlist.getRange("C5:C104").dataValidation = { rule: { type: "list", values: ["日文", "英文", "中文", "韩文", "其他"] } };
sheets.watchlist.getRange("D5:D104").dataValidation = { rule: { type: "list", values: ["PSA10", "BGS10", "CGC10", "RAW"] } };
sheets.watchlist.getRange("G5:G104").dataValidation = { rule: { type: "list", values: ["eBay", "ALT", "Card Hobby", "Fanatics Collect", "PokerColor"] } };
sheets.watchlist.getRange("I5:I104").dataValidation = { rule: { type: "list", values: ["待研究", "跟踪", "触发", "已加入扫描", "放弃", "谨慎"] } };
sheets.watchlist.tables.add("A4:O104", true, "Watchlist");
sheets.watchlist.freezePanes.freezeRows(4);
setWidths(sheets.watchlist, [24, 18, 10, 12, 12, 12, 16, 32, 12, 12, 28, 28, 28, 28, 28]);

// Dashboard
styleTitle(
  sheets.dashboard,
  sheets.dashboard.getRange("A1:N1"),
  "PTCG PSA10 盈利追踪 Dashboard",
  "面向套利决策：先看机会、再看库存、最后看实际利润。所有指标来自机会扫描、交易台账和平台参数。"
);
const cards = [
  ["库存成本", "=SUMIFS('交易台账'!$K$5:$K$204,'交易台账'!$W$5:$W$204,\"库存\")+SUMIFS('交易台账'!$K$5:$K$204,'交易台账'!$W$5:$W$204,\"已上架\")"],
  ["已实现利润", "=SUMIFS('交易台账'!$T$5:$T$204,'交易台账'!$W$5:$W$204,\"已售出\")"],
  ["平均ROI", "=IFERROR(AVERAGEIFS('交易台账'!$U$5:$U$204,'交易台账'!$W$5:$W$204,\"已售出\"),0)"],
  ["在库张数", "=COUNTIFS('交易台账'!$W$5:$W$204,\"库存\")+COUNTIFS('交易台账'!$W$5:$W$204,\"已上架\")"],
  ["机会数 ROI>=15%", "=COUNTIFS('机会扫描'!$X$5:$X$104,\">=0.15\")"],
  ["机会净利润合计", "=SUMIFS('机会扫描'!$W$5:$W$104,'机会扫描'!$W$5:$W$104,\">0\")"],
];
sheets.dashboard.getRange("A4:B9").values = cards.map(([label, formula]) => [label, null]);
sheets.dashboard.getRange("B4:B9").formulas = cards.map(([, formula]) => [formula]);
sheets.dashboard.getRange("A4:B9").format = {
  fill: blue,
  borders: { preset: "outside", style: "thin", color: border },
  verticalAlignment: "center",
};
sheets.dashboard.getRange("A4:A9").format.font = { bold: true, color: darkText };
sheets.dashboard.getRange("B4:B9").format.font = { bold: true, color: "#0F5132" };
sheets.dashboard.getRange("B4:B5").setNumberFormat("#,##0");
sheets.dashboard.getRange("B6").setNumberFormat("0.0%");
sheets.dashboard.getRange("B7:B9").setNumberFormat("#,##0");

sheets.dashboard.getRange("D4:J4").values = [["高优先级机会", "卡名", "购入平台", "售出平台", "净利润", "ROI", "状态"]];
styleHeader(sheets.dashboard.getRange("D4:J4"), teal);
for (let r = 5; r <= 14; r++) {
  const idx = r - 4;
  sheets.dashboard.getRange(`D${r}:J${r}`).formulas = [[
    `=IFERROR(INDEX('机会扫描'!$A$5:$A$104,MATCH(LARGE('机会扫描'!$AC$5:$AC$104,${idx}),'机会扫描'!$AC$5:$AC$104,0)),"")`,
    `=IF(D${r}="","",XLOOKUP(D${r},'机会扫描'!$A$5:$A$104,'机会扫描'!$B$5:$B$104,""))`,
    `=IF(D${r}="","",XLOOKUP(D${r},'机会扫描'!$A$5:$A$104,'机会扫描'!$R$5:$R$104,""))`,
    `=IF(D${r}="","",XLOOKUP(D${r},'机会扫描'!$A$5:$A$104,'机会扫描'!$T$5:$T$104,""))`,
    `=IF(D${r}="","",XLOOKUP(D${r},'机会扫描'!$A$5:$A$104,'机会扫描'!$W$5:$W$104,0))`,
    `=IF(D${r}="","",XLOOKUP(D${r},'机会扫描'!$A$5:$A$104,'机会扫描'!$X$5:$X$104,0))`,
    `=IF(D${r}="","",XLOOKUP(D${r},'机会扫描'!$A$5:$A$104,'机会扫描'!$AD$5:$AD$104,""))`,
  ]];
}
sheets.dashboard.getRange("D5:J14").format = {
  fill: "#FFFFFF",
  borders: {
    insideHorizontal: { style: "thin", color: "#E8EEF5" },
    insideVertical: { style: "thin", color: "#EEF3F8" },
    bottom: { style: "thin", color: border },
  },
};
sheets.dashboard.getRange("H5:H14").setNumberFormat("#,##0");
sheets.dashboard.getRange("I5:I14").setNumberFormat("0.0%");

sheets.dashboard.getRange("L4:N4").values = [["平台", "买入观察数", "卖出观察数"]];
styleHeader(sheets.dashboard.getRange("L4:N4"), "#375A7F");
sheets.dashboard.getRange("L5:L9").values = feeRows.map((r) => [r[0]]);
for (let r = 5; r <= 9; r++) {
  sheets.dashboard.getRange(`M${r}:N${r}`).formulas = [[
    `=COUNTIF('机会扫描'!$R$5:$R$104,L${r})`,
    `=COUNTIF('机会扫描'!$T$5:$T$104,L${r})`,
  ]];
}
sheets.dashboard.getRange("L5:N9").format = { fill: "#FFFFFF", borders: { preset: "outside", style: "thin", color: border } };
sheets.dashboard.getRange("M5:N9").setNumberFormat("#,##0");
const chart = sheets.dashboard.charts.add("bar", sheets.dashboard.getRange("L4:N9"));
chart.title = "平台机会分布";
chart.hasLegend = true;
chart.yAxis = { numberFormatCode: "#,##0", min: 0, max: 3 };
chart.setPosition("A12", "J28");

sheets.dashboard.freezePanes.freezeRows(3);
setWidths(sheets.dashboard, [16, 16, 4, 13, 26, 16, 16, 12, 10, 12, 3, 18, 12, 12]);

// Dictionary
styleTitle(
  sheets.dictionary,
  sheets.dictionary.getRange("A1:D1"),
  "字段说明",
  "记录主要字段口径，方便之后维护和复盘。"
);
sheets.dictionary.getRange("A4:D4").values = [["工作表", "字段/区域", "含义", "维护方式"]];
styleHeader(sheets.dictionary.getRange("A4:D4"), "#475569");
sheets.dictionary.getRange("A5:D21").values = [
  ["实时设置", "实时模式", "API 表示可自动刷新；链接监控表示保留搜索链接并人工复核；待接入表示暂不自动抓取", "手动维护"],
  ["实时行情", "买价CNY / 卖价CNY", "机会扫描直接引用的价格来源；刷新脚本或人工复核应只更新这张表", "脚本/手动"],
  ["实时行情", "更新时间 / 状态", "判断数据新鲜度和是否可用于决策", "脚本/手动"],
  ["实时行情", "搜索词 / 源URL", "用于 API 查询或快速跳转到平台复核", "手动维护"],
  ["平台参数", "买家佣金% / 卖家佣金%", "平台成交相关费率，按实际账号、品类和地区更新", "手动输入"],
  ["平台参数", "入库/国际运费 / 出库/国内运费", "单卡平均物流、保险、包装成本", "手动输入"],
  ["机会扫描", "五个平台买价", "你能实际拿到的可成交买入价，空白或0表示暂不可买", "手动输入"],
  ["机会扫描", "五个平台卖价", "你预计或观察到的可成交卖出价，空白或0表示暂不可卖", "手动输入"],
  ["机会扫描", "最低买价 / 最高卖价", "自动挑选最便宜买入和最贵卖出", "公式"],
  ["机会扫描", "买方总成本", "最低买价加买方费用、支付费和入库运费", "公式"],
  ["机会扫描", "卖方净回款", "最高卖价扣除卖方费用、支付费和出库运费", "公式"],
  ["机会扫描", "机会评分", "流动性、热度、风险和ROI的简化综合评分", "公式"],
  ["机会扫描", "目标买入价", "在当前预期卖价和费用下，按约18%目标ROI倒推", "公式"],
  ["交易台账", "总成本", "购入价加购入费率和入库运费", "公式"],
  ["交易台账", "净回款", "售出价扣卖方佣金、支付/提现费和出货运费", "公式"],
  ["交易台账", "实际利润 / ROI", "真实售出后用于复盘的核心指标", "公式"],
  ["观察清单", "触发条件", "进入机会扫描前的价格或事件条件", "手动输入"],
];
sheets.dictionary.getRange("A5:D21").format = {
  fill: "#FFFFFF",
  wrapText: true,
  borders: {
    insideHorizontal: { style: "thin", color: "#E8EEF5" },
    insideVertical: { style: "thin", color: "#EEF3F8" },
  },
};
sheets.dictionary.tables.add("A4:D21", true, "DataDictionary");
setWidths(sheets.dictionary, [16, 24, 56, 16]);

// Common formatting
for (const sheet of Object.values(sheets)) {
  const used = sheet.getUsedRange();
  used.format.font.name = "Arial";
}

// Cell comments for key assumptions.
workbook.comments.addThread({ cell: sheets.fees.getRange("E5") }, "默认费率只是模板假设；真实交易前请以平台最新规则和你的账号费率为准。");
workbook.comments.addThread({ cell: sheets.scanner.getRange("AC5") }, "机会评分是简化排序，不等于建议买入。高价卡仍需核验证书、壳体、成交记录和资金周转。");

// Compact verification outputs
const inspect = await workbook.inspect({
  kind: "table",
  range: "Dashboard!A1:N14",
  include: "values,formulas",
  tableMaxRows: 16,
  tableMaxCols: 14,
});
console.log(inspect.ndjson);
const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 300 },
  summary: "final formula error scan",
});
console.log(errors.ndjson);

for (const sheetName of Object.keys(sheets).map((k) => sheets[k].name)) {
  const preview = await workbook.render({ sheetName, autoCrop: "all", scale: 1, format: "png" });
  await fs.writeFile(`${outputDir}/${sheetName}.png`, new Uint8Array(await preview.arrayBuffer()));
}

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(`${outputDir}/PTCG_PSA10_套利追踪表.xlsx`);
console.log(`${outputDir}/PTCG_PSA10_套利追踪表.xlsx`);
