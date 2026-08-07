# eBay Developer API 接入

这个查价模版使用 eBay Browse API 查询当前在售和拍卖挂牌。服务器只需要 eBay 应用的 `Client ID` 和 `Client Secret`，不需要把你的 eBay 账号密码放进项目。

## 申请步骤

1. 打开 `https://developer.ebay.com/`，使用你的 eBay 账号登录。
2. 进入 `Application Keys`，创建应用。
3. 先使用 `Production` 环境的 key。这个网站要查真实价格，不使用 Sandbox。
4. 复制：
   - `Client ID`
   - `Client Secret`
5. 把两个值填到服务器 `/opt/card-trading/deploy/.env`：

```env
EBAY_CLIENT_ID=你的ClientID
EBAY_CLIENT_SECRET=你的ClientSecret
```

6. 重启服务器容器后，`/api/research?q=...` 会自动换取 eBay access token，并填入当前挂牌样本、最低价、中位价和 75 分位价。

## 已接入的免费 API

- Pokémon TCG API：宝可梦图鉴、TCGplayer/Cardmarket 价格字段。可选 `POKEMONTCG_API_KEY`。
- TCGdex：宝可梦图鉴兜底，不需要登录。
- Scryfall API：Magic: The Gathering 图鉴、卡图、USD/EUR 价格字段，不需要登录。
- YGOPRODeck API：Yu-Gi-Oh! 图鉴、卡图、TCGplayer/eBay/Cardmarket 价格字段，不需要登录。

## 目前不能免费自动抓全量的部分

- Topps / Panini 没有稳定免费的官方成交价格 API。
- 体育卡价格主要依赖 eBay Browse API、130 Point 网页、COMC、PSA、Beckett、Card Ladder、Market Movers 等。
- Beckett、Card Ladder、Market Movers 的完整历史库通常需要订阅。
