import assert from "node:assert/strict";
import test from "node:test";

import { sanitizeAuctionPayload } from "../scripts/api-policy.mjs";

test("API boundary removes expired rows and unqualified opportunities", () => {
  const now = Date.parse("2026-08-07T12:00:00Z");
  const active = {
    id: "active",
    platform: "eBay",
    auctionEndAt: "2026-08-08T12:00:00Z",
    lastCapturedAt: "2026-08-07T11:30:00Z",
  };
  const expired = {
    id: "expired",
    platform: "eBay",
    auctionEndAt: "2026-08-07T11:00:00Z",
    lastCapturedAt: "2026-08-07T10:30:00Z",
  };
  const result = sanitizeAuctionPayload(
    {
      lastUpdatedAt: "2026-08-07T11:30:00Z",
      auctions: [active, expired],
      candidates: [active, expired],
      opportunities: [
        { ...active, profitQualified: true },
        { ...active, id: "estimated", profitQualified: false },
      ],
      sources: [{ name: "eBay", count: 99, candidateCount: 99 }],
    },
    now,
    6 * 60 * 60 * 1000
  );

  assert.deepEqual(result.auctions.map((row) => row.id), ["active"]);
  assert.deepEqual(result.candidates.map((row) => row.id), ["active"]);
  assert.deepEqual(result.opportunities.map((row) => row.id), ["active"]);
  assert.equal(result.sources[0].count, 1);
  assert.equal(result.sources[0].candidateCount, 1);
  assert.deepEqual(result.candidates[0].verificationIssues, [
    "缺少商品 ID",
    "缺少商品直达链接",
    "缺少原图",
    "缺少竞价开始时间",
    "缺少发货地",
    "缺少有效竞价",
  ]);
});
