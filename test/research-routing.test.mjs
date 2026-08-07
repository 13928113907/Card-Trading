import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyResearchQuery,
  createCachedLoader,
  createConcurrencyLimiter,
  fetchLocalCatalog,
  matchesPokemonNumber,
  pokemonCardNumber,
} from "../card-research/server.mjs";

test("routes Pokemon queries", () => {
  assert.equal(classifyResearchQuery("月亮伊布 215/203"), "pokemon");
  assert.equal(classifyResearchQuery("Umbreon VMAX"), "pokemon");
});

test("routes Magic and Yu-Gi-Oh queries", () => {
  assert.equal(classifyResearchQuery("MTG Black Lotus"), "magic");
  assert.equal(classifyResearchQuery("Blue-Eyes White Dragon Yu-Gi-Oh"), "yugioh");
});

test("routes sports and One Piece without unrelated catalog calls", () => {
  assert.equal(classifyResearchQuery("2018 Panini Prizm Luka Doncic"), "sports");
  assert.equal(classifyResearchQuery("Luffy Manga OP05-119"), "onepiece");
});

test("keeps unknown searches generic", () => {
  assert.equal(classifyResearchQuery("unknown card 123"), "generic");
});

test("coalesces concurrent requests and serves the cache", async () => {
  let calls = 0;
  const load = createCachedLoader(async (key) => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return `${key}:${calls}`;
  });

  const [first, second] = await Promise.all([load("umbreon"), load("umbreon")]);
  const third = await load("umbreon");
  assert.equal(first, "umbreon:1");
  assert.equal(second, first);
  assert.equal(third, first);
  assert.equal(calls, 1);
});

test("expires cached research results", async () => {
  let clock = 0;
  let calls = 0;
  const load = createCachedLoader(async () => ++calls, { ttlMs: 10, now: () => clock });
  assert.equal(await load("card"), 1);
  clock = 9;
  assert.equal(await load("card"), 1);
  clock = 11;
  assert.equal(await load("card"), 2);
});

test("limits different research queries to two active jobs", async () => {
  const limit = createConcurrencyLimiter(2);
  let active = 0;
  let peak = 0;
  const task = () => limit(async () => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
  });

  await Promise.all([task(), task(), task(), task()]);
  assert.equal(peak, 2);
});

test("uses clearly labelled local reference data for a known Chinese Pokemon query", async () => {
  const result = await fetchLocalCatalog("月亮伊布 215/203");
  assert.equal(result.ok, true);
  assert.equal(result.provider, "本地研究库兜底");
  assert.match(result.message, /不是实时数据/);
  assert.equal(result.cards[0].number, "215/203");
  assert.equal(result.cards[0].sourceLabel, "本地估值，非实时");
  assert.ok(result.cards[0].referencePriceCny > 0);
});

test("extracts and compares Pokemon card numbers without confusing set names", () => {
  assert.equal(pokemonCardNumber("Umbreon VMAX 215/203"), "215");
  assert.equal(pokemonCardNumber("Pikachu with Grey Felt Hat #85"), "85");
  assert.equal(pokemonCardNumber("Charizard Pokemon 151 #201"), "201");
  assert.equal(matchesPokemonNumber("0215", "215"), true);
  assert.equal(matchesPokemonNumber("214", "215"), false);
});
