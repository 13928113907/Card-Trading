import assert from "node:assert/strict";
import test from "node:test";

import {
  collectPlatformTargets,
  enrichFinancials,
  isListingRetainable,
  isVerifiedSalePrice,
  listingVerificationIssues,
  withTimeout,
} from "../scripts/scrape_auctions.mjs";

test("withTimeout resolves completed work", async () => {
  assert.equal(await withTimeout(Promise.resolve("ok"), 50, "quick task"), "ok");
});

test("withTimeout rejects stalled work", async () => {
  await assert.rejects(
    withTimeout(new Promise(() => {}), 10, "stalled task"),
    /stalled task exceeded 10ms/
  );
});

test("platform target failures are isolated", async () => {
  let pageNumber = 0;
  const closedPages = [];
  const context = {
    async newPage() {
      pageNumber += 1;
      if (pageNumber === 1) throw new Error("context page closed");
      return {
        async route() {},
        async close() {
          closedPages.push(pageNumber);
        },
      };
    },
  };
  const platform = {
    id: "test",
    name: "Test Market",
    async scrape(_page, target) {
      return [{ id: target.id }];
    },
  };
  const received = [];

  const result = await collectPlatformTargets({
    platform,
    targets: [{ id: "first" }, { id: "second" }],
    context,
    onListings(listings) {
      received.push(...listings);
    },
  });

  assert.equal(result.completed, 1);
  assert.deepEqual(result.errors.map((error) => error.targetId), ["first"]);
  assert.deepEqual(received, [{ id: "second" }]);
  assert.deepEqual(closedPages, [2]);
});

test("expired auctions are never retained", () => {
  const now = Date.parse("2026-08-07T12:00:00Z");
  assert.equal(
    isListingRetainable(
      { auctionEndAt: "2026-08-07T11:59:59Z", lastCapturedAt: "2026-08-07T11:59:00Z" },
      now,
      60 * 60 * 1000
    ),
    false
  );
});

test("active recently captured auctions are retained", () => {
  const now = Date.parse("2026-08-07T12:00:00Z");
  assert.equal(
    isListingRetainable(
      { auctionEndAt: "2026-08-08T12:00:00Z", lastCapturedAt: "2026-08-07T11:30:00Z" },
      now,
      60 * 60 * 1000
    ),
    true
  );
});

test("stale listings are dropped even when the auction has not ended", () => {
  const now = Date.parse("2026-08-07T12:00:00Z");
  assert.equal(
    isListingRetainable(
      { auctionEndAt: "2026-08-08T12:00:00Z", lastCapturedAt: "2026-08-07T09:00:00Z" },
      now,
      60 * 60 * 1000
    ),
    false
  );
});

test("complete listings pass the formal data gate", () => {
  assert.deepEqual(
    listingVerificationIssues({
      sourceListingId: "ebay:123",
      url: "https://example.com/item/123",
      searchUrl: "https://example.com/search",
      imageUrl: "https://example.com/card.jpg",
      auctionStartAt: "2026-08-07T10:00:00Z",
      auctionEndAt: "2026-08-08T10:00:00Z",
      shippingFrom: "Singapore",
      currentBidCny: 1000,
    }),
    []
  );
});

test("missing required auction fields are reported", () => {
  assert.deepEqual(
    listingVerificationIssues({
      url: "https://example.com/search",
      searchUrl: "https://example.com/search",
      currentBidCny: 0,
    }),
    [
      "缺少商品 ID",
      "缺少商品直达链接",
      "缺少原图",
      "缺少竞价开始时间",
      "缺少竞价结束时间",
      "缺少发货地",
      "缺少有效竞价",
    ]
  );
});

test("accepts a recently verified sale price", () => {
  const now = Date.parse("2026-08-07T12:00:00Z");
  assert.equal(
    isVerifiedSalePrice(
      {
        salePriceStatus: "verified",
        salePriceVerifiedAt: "2026-08-07T11:30:00Z",
        expectedSaleCny: 5000,
      },
      now,
      60 * 60 * 1000
    ),
    true
  );
});

test("rejects estimated or stale sale prices", () => {
  const now = Date.parse("2026-08-07T12:00:00Z");
  assert.equal(
    isVerifiedSalePrice(
      { salePriceStatus: "estimated", salePriceVerifiedAt: "2026-08-07T11:30:00Z", expectedSaleCny: 5000 },
      now,
      60 * 60 * 1000
    ),
    false
  );
  assert.equal(
    isVerifiedSalePrice(
      { salePriceStatus: "verified", salePriceVerifiedAt: "2026-08-07T10:00:00Z", expectedSaleCny: 5000 },
      now,
      60 * 60 * 1000
    ),
    false
  );
});

test("qualifies profit only when listing and sale verification both pass", () => {
  const base = {
    sourceListingId: "ebay:123",
    url: "https://example.com/item/123",
    searchUrl: "https://example.com/search",
    imageUrl: "https://example.com/card.jpg",
    auctionStartAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    auctionEndAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    shippingFrom: "Singapore",
    currentBidCny: 1000,
    expectedSaleCny: 3000,
    feeRate: 0.1,
    paymentFeeRate: 0.03,
    shippingCny: 100,
    taxCny: 0,
    otherCostCny: 0,
    lastCapturedAt: new Date().toISOString(),
    salePriceVerifiedAt: new Date().toISOString(),
  };

  assert.equal(enrichFinancials({ ...base, salePriceStatus: "verified" }).profitQualified, true);
  assert.equal(enrichFinancials({ ...base, salePriceStatus: "estimated" }).profitQualified, false);
});
