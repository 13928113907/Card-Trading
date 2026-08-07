export function isCurrentListing(row, nowMs = Date.now(), maxAgeMs = 6 * 60 * 60 * 1000) {
  const endMs = row?.auctionEndAt ? new Date(row.auctionEndAt).getTime() : NaN;
  const capturedMs = row?.lastCapturedAt ? new Date(row.lastCapturedAt).getTime() : NaN;
  return (
    Number.isFinite(endMs) &&
    endMs > nowMs &&
    Number.isFinite(capturedMs) &&
    nowMs - capturedMs <= maxAgeMs
  );
}

export function currentVerificationIssues(row) {
  return [
    !row?.sourceListingId && "缺少商品 ID",
    (!row?.url || (row.searchUrl && row.url === row.searchUrl)) && "缺少商品直达链接",
    !row?.imageUrl && "缺少原图",
    !row?.auctionStartAt && "缺少竞价开始时间",
    !row?.auctionEndAt && "缺少竞价结束时间",
    !row?.shippingFrom && "缺少发货地",
    !(Number(row?.currentBidCny) > 0) && "缺少有效竞价",
  ].filter(Boolean);
}

export function sanitizeAuctionPayload(payload, nowMs = Date.now(), maxAgeMs = 6 * 60 * 60 * 1000) {
  const auctions = (payload.auctions || []).filter((row) => isCurrentListing(row, nowMs, maxAgeMs));
  const candidates = (payload.candidates || [])
    .filter((row) => isCurrentListing(row, nowMs, maxAgeMs))
    .map((row) => ({ ...row, verificationIssues: currentVerificationIssues(row) }));
  const opportunities = (payload.opportunities || []).filter(
    (row) => row.profitQualified === true && isCurrentListing(row, nowMs, maxAgeMs)
  );
  const snapshotMs = payload.lastUpdatedAt ? new Date(payload.lastUpdatedAt).getTime() : NaN;
  const dataStale = payload.dataStale === true || !Number.isFinite(snapshotMs) || nowMs - snapshotMs > maxAgeMs;
  const sources = (payload.sources || []).map((source) => ({
    ...source,
    count: auctions.filter((row) => row.platform === source.name).length,
    candidateCount: candidates.filter((row) => row.platform === source.name).length,
  }));
  return { ...payload, dataStale, auctions, candidates, opportunities, sources };
}
