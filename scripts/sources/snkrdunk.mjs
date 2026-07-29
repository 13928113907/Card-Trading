const DEFAULTS = {
  feeRate: 0.1,
  paymentFeeRate: 0.03,
  shippingCny: 100,
};

function toCny(value, currency, rates) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  if (currency === "JPY") return Math.round(amount * rates.jpyCny);
  if (currency === "USD") return Math.round(amount * rates.usdCny);
  if (currency === "TWD") return Math.round(amount * rates.twdCny);
  return Math.round(amount);
}

export async function collectSnkrdunk({ targets, rates, expectedSaleCny }) {
  const feedUrl = process.env.SNKRDUNK_FEED_URL;
  const checkedAt = new Date().toISOString();
  if (!feedUrl) {
    return {
      rows: [],
      status: {
        id: "snkrdunk",
        name: "SNKRDUNK",
        connected: false,
        checkedAt,
        message: "SNKRDUNK_FEED_URL is not configured",
      },
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  try {
    const headers = { accept: "application/json" };
    if (process.env.SNKRDUNK_FEED_TOKEN) {
      headers.authorization = `Bearer ${process.env.SNKRDUNK_FEED_TOKEN}`;
    }
    const response = await fetch(feedUrl, { headers, signal: controller.signal });
    if (!response.ok) throw new Error(`feed returned HTTP ${response.status}`);
    const payload = await response.json();
    const listings = Array.isArray(payload) ? payload : payload.listings;
    if (!Array.isArray(listings)) throw new Error("feed payload must contain a listings array");

    const targetMap = new Map(targets.map((target) => [target.id, target]));
    const rows = listings.flatMap((listing) => {
      const target = targetMap.get(listing.targetId);
      if (!target || String(listing.grade || "").toUpperCase().replace(/\s+/g, "") !== "PSA10") return [];
      const currentBidCny = toCny(listing.price, String(listing.currency || "JPY").toUpperCase(), rates);
      if (!currentBidCny || !listing.url || !listing.listingId) return [];
      return [{
        ...target,
        id: `${target.id}-snkrdunk-${listing.listingId}`,
        sourceListingId: `snkrdunk:${listing.listingId}`,
        psaCert: "PSA 10",
        platform: "SNKRDUNK",
        currentBidCny,
        expectedSaleCny: expectedSaleCny(target),
        feeRate: Number(listing.feeRate ?? DEFAULTS.feeRate),
        paymentFeeRate: Number(listing.paymentFeeRate ?? DEFAULTS.paymentFeeRate),
        shippingCny: Number(listing.shippingCny ?? DEFAULTS.shippingCny),
        taxCny: Number(listing.taxCny || 0),
        otherCostCny: Number(listing.otherCostCny || 0),
        holdingStartAt: checkedAt,
        auctionStartAt: listing.auctionStartAt || null,
        auctionEndAt: listing.auctionEndAt || null,
        shippingFrom: listing.shippingFrom || "日本",
        status: listing.status || "实时/SNKRDUNK登录数据源",
        url: listing.url,
        imageUrl: listing.imageUrl || "",
        sourceTitle: listing.title || target.cnName,
        sourcePriceText: `${listing.currency || "JPY"} ${listing.price}`,
        sourceEndText: listing.endText || "",
        lastCapturedAt: listing.capturedAt || checkedAt,
      }];
    });

    return {
      rows,
      status: {
        id: "snkrdunk",
        name: "SNKRDUNK",
        connected: true,
        checkedAt,
        count: rows.length,
        message: `${rows.length} PSA 10 listings`,
      },
    };
  } catch (error) {
    return {
      rows: [],
      status: {
        id: "snkrdunk",
        name: "SNKRDUNK",
        connected: false,
        checkedAt,
        message: error.message,
      },
    };
  } finally {
    clearTimeout(timeout);
  }
}
