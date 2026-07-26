import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dataFiles = [
  path.join(root, "web/data/market-year.json"),
  path.join(root, "docs/data/market-year.json"),
];

function hasPsa10SearchText(value) {
  return typeof value === "string" && /psa\s*10|psa10/i.test(value);
}

function validateCard(card, filePath, index) {
  const label = `${path.relative(root, filePath)} cards[${index}] ${card.id || card.cardName || ""}`;
  const errors = [];

  if (card.sourceName === "PriceCharting") {
    if (!card.sourceUrl?.startsWith("https://www.pricecharting.com/game/")) {
      errors.push(`${label}: PriceCharting sourceUrl must be a direct /game/... card page`);
    }
    if (card.sourceUrl?.includes("/search-products")) {
      errors.push(`${label}: sourceUrl cannot be a PriceCharting search page`);
    }
    if (card.sourceUrl && /[?&]q=/i.test(card.sourceUrl)) {
      errors.push(`${label}: sourceUrl cannot contain a search query`);
    }
    if (card.lookupQuery && hasPsa10SearchText(card.lookupQuery)) {
      errors.push(`${label}: lookupQuery must not include PSA 10; fetch the card page first, then read the PSA 10 node`);
    }
    if (card.searchQuery && hasPsa10SearchText(card.searchQuery)) {
      errors.push(`${label}: searchQuery must not include PSA 10 for PriceCharting annual price data`);
    }
    if (card.priceNode !== "PSA 10") {
      errors.push(`${label}: priceNode must explicitly be PSA 10`);
    }
    if (card.priceStatus === "verified" && (!Number.isFinite(card.startUsd) || !Number.isFinite(card.currentUsd))) {
      errors.push(`${label}: verified rows must include numeric startUsd and currentUsd`);
    }
  }

  if (card.sourceName === "SportsCardsPro") {
    if (!card.sourceUrl?.startsWith("https://www.sportscardspro.com/game/")) {
      errors.push(`${label}: SportsCardsPro sourceUrl must be a direct /game/... card page`);
    }
    if (card.sourceUrl && /[?&]q=/i.test(card.sourceUrl)) {
      errors.push(`${label}: sourceUrl cannot contain a search query`);
    }
    if (card.priceNode !== "PSA 10") {
      errors.push(`${label}: priceNode must explicitly be PSA 10`);
    }
    if (card.priceStatus === "verified" && (!Number.isFinite(card.startUsd) || !Number.isFinite(card.currentUsd))) {
      errors.push(`${label}: verified rows must include numeric startUsd and currentUsd`);
    }
  }

  return errors;
}

async function main() {
  const allErrors = [];
  for (const filePath of dataFiles) {
    const text = await fs.readFile(filePath, "utf8");
    const payload = JSON.parse(text);
    const cards = payload.cards || [];
    cards.forEach((card, index) => {
      allErrors.push(...validateCard(card, filePath, index));
    });
  }

  if (allErrors.length) {
    console.error(allErrors.join("\n"));
    process.exit(1);
  }

  console.log("PriceCharting annual sources passed validation.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
