import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import {
  buildActivePool,
  cardPosition,
  pickDistractors,
  buildAnswerChoices,
  pickFact,
  shouldExpandPool,
  expandPool,
  buildSelectionProbabilities,
  pickWeightedCard,
  selectPreloadTargets,
  isDebugPlayer,
  pointsForAnswer,
  startFlashcardSession,
  ANSWER_CHOICE_COUNT,
} from "../js/flashcards.js";
import {
  probabilityCorrect,
  getItemMasteryEstimate,
  recordAnswer,
  isItemMastered,
} from "../js/storage.js";
import { fakeRng } from "./helpers/fakeRng.js";
import { createFakeStorage } from "./helpers/fakeStorage.js";

function makeItems(n) {
  // popularity descends with index: item-0 is the most popular, item-(n-1) the least.
  return Array.from({ length: n }, (_, i) => ({
    id: `item-${i}`,
    name: `Item ${i}`,
    popularity: n - i,
  }));
}

test("buildActivePool selects the most popular items when more are available", () => {
  const items = makeItems(7);
  const pool = buildActivePool(items);
  assert.equal(pool.length, 5);
  assert.deepEqual(
    pool.map((i) => i.id),
    ["item-0", "item-1", "item-2", "item-3", "item-4"],
  );
});

test("buildActivePool uses every item when the module has 5 or fewer", () => {
  const items = makeItems(5);
  const pool = buildActivePool(items);
  assert.equal(pool.length, 5);
  assert.deepEqual(
    pool.map((i) => i.id).sort(),
    items.map((i) => i.id).sort(),
  );
});

test("buildActivePool seeds by distinct topic, not raw entries - a popular topic's recall variants can't crowd out other topics' base items", () => {
  // Mirrors Oceans: 2 popular topics with variants, 3 less-popular topics
  // with none. Naively ranking all 15 raw entries by popularity would fill
  // the pool with 3 cuts of "Pacific"/"Atlantic" and never reach the rest.
  const items = [
    { id: "pacific", name: "Pacific", popularity: 60 },
    { id: "pacific-image-only", name: "Pacific", variantOf: "pacific", popularity: 45 },
    { id: "pacific-fact-only", name: "Pacific", variantOf: "pacific", popularity: 45 },
    { id: "atlantic", name: "Atlantic", popularity: 58 },
    { id: "atlantic-image-only", name: "Atlantic", variantOf: "atlantic", popularity: 43 },
    { id: "atlantic-fact-only", name: "Atlantic", variantOf: "atlantic", popularity: 43 },
    { id: "indian", name: "Indian", popularity: 38 },
    { id: "arctic", name: "Arctic", popularity: 32 },
    { id: "southern", name: "Southern", popularity: 10 },
  ];
  const pool = buildActivePool(items);
  assert.deepEqual(
    pool.map((i) => i.id),
    ["pacific", "atlantic", "indian", "arctic", "southern"],
  );
});

test("recall variants keep entering the pool repeatedly as mastery progresses, not just once (real oceans-shaped data)", () => {
  globalThis.localStorage = createFakeStorage();
  const items = [
    { id: "pacific", name: "Pacific", popularity: 60 },
    { id: "pacific-image-only", name: "Pacific", variantOf: "pacific", popularity: 45 },
    { id: "pacific-fact-only", name: "Pacific", variantOf: "pacific", popularity: 45 },
    { id: "atlantic", name: "Atlantic", popularity: 58 },
    { id: "atlantic-image-only", name: "Atlantic", variantOf: "atlantic", popularity: 43 },
    { id: "atlantic-fact-only", name: "Atlantic", variantOf: "atlantic", popularity: 43 },
    { id: "indian", name: "Indian", popularity: 38 },
    { id: "indian-image-only", name: "Indian", variantOf: "indian", popularity: 23 },
    { id: "indian-fact-only", name: "Indian", variantOf: "indian", popularity: 23 },
    { id: "arctic", name: "Arctic", popularity: 32 },
    { id: "arctic-image-only", name: "Arctic", variantOf: "arctic", popularity: 17 },
    { id: "arctic-fact-only", name: "Arctic", variantOf: "arctic", popularity: 17 },
    { id: "southern", name: "Southern", popularity: 10 },
    { id: "southern-image-only", name: "Southern", variantOf: "southern", popularity: 0 },
    { id: "southern-fact-only", name: "Southern", variantOf: "southern", popularity: 0 },
  ];

  const pool = buildActivePool(items);
  assert.deepEqual(
    pool.map((i) => i.id),
    ["pacific", "atlantic", "indian", "arctic", "southern"],
  );

  const knownCount = (progress) =>
    pool.filter((item) => isItemMastered(progress, item.id, item.popularity)).length;

  // Master 3 of the 5 oceans via the real mastery model (js/storage.js),
  // the same path startFlashcardSession uses - not a hand-rolled progress
  // object standing in for it.
  let progress;
  for (const id of ["pacific", "atlantic", "indian"]) {
    for (let i = 0; i < 10; i++) {
      progress = recordAnswer("Sam", "oceans", id, true, items.find((it) => it.id === id).popularity, "v1");
    }
  }
  assert.equal(knownCount(progress), 3);

  // Keep answering Arctic correctly until the exact answer that crosses it
  // into "mastered" - mirroring the knownCountBefore/After comparison
  // startFlashcardSession's onNext() does around a single recordAnswer call.
  let before = progress;
  let after = progress;
  while (!isItemMastered(after, "arctic", 32)) {
    before = after;
    after = recordAnswer("Sam", "oceans", "arctic", true, 32, "v1");
  }
  const knownCountBefore = knownCount(before);
  const knownCountAfter = knownCount(after);
  assert.equal(knownCountBefore, 3);
  assert.equal(knownCountAfter, 4);
  assert.equal(shouldExpandPool(knownCountBefore, knownCountAfter, pool.length), true);

  let pool2 = expandPool(pool, items);
  assert.equal(pool2.length, 6);
  // Pacific is the most popular topic still fully represented by a single
  // pool slot, so its highest-popularity variant is what should join next -
  // a real recall variant entering play, not another base topic.
  assert.equal(pool2[5].id, "pacific-image-only");
  assert.equal(pool2[5].variantOf, "pacific");

  // Mastering that newly-added variant too must trigger a *second*
  // expansion - this is the actual bug reported live: expansion fired once
  // and then never again, so no further variant (or topic) ever joined.
  const knownCount2 = (progress) =>
    pool2.filter((item) => isItemMastered(progress, item.id, item.popularity)).length;
  let before2 = after;
  let after2 = after;
  while (!isItemMastered(after2, "pacific-image-only", 45)) {
    before2 = after2;
    after2 = recordAnswer("Sam", "oceans", "pacific-image-only", true, 45, "v1");
  }
  const knownCountBefore2 = knownCount2(before2);
  const knownCountAfter2 = knownCount2(after2);
  // Southern was never answered, so it - not pacific-image-only - is the
  // pool's one remaining unknown right after the first expansion (4 of 6).
  assert.equal(knownCountBefore2, 4);
  assert.equal(knownCountAfter2, 5);
  assert.equal(shouldExpandPool(knownCountBefore2, knownCountAfter2, pool2.length), true);

  const pool3 = expandPool(pool2, items);
  assert.equal(pool3.length, 7);
  assert.equal(pool3[6].id, "pacific-fact-only");
});

test("cardPosition returns the 1-indexed rank of an item within the pool", () => {
  const pool = makeItems(5);
  assert.equal(cardPosition(pool, "item-0"), 1);
  assert.equal(cardPosition(pool, "item-2"), 3);
  assert.equal(cardPosition(pool, "item-4"), 5);
});

test("pickDistractors returns the requested count, excluding the correct item", () => {
  const items = makeItems(6);
  const correct = items[0];
  const distractors = pickDistractors(items, correct, 3, fakeRng([0.1, 0.5, 0.9]));
  assert.equal(distractors.length, 3);
  assert.ok(distractors.every((d) => d.id !== correct.id));
  assert.equal(new Set(distractors.map((d) => d.id)).size, 3);
});

test("pickDistractors throws when the module is too small", () => {
  const items = makeItems(3);
  assert.throws(() => pickDistractors(items, items[0], 3));
});

test("pickDistractors excludes recall variants sharing the correct item's name", () => {
  // "Africa" the base item plus an image-only recall variant of the same name.
  const items = [
    { id: "africa", name: "Africa" },
    { id: "africa-image-only", name: "Africa" },
    { id: "asia", name: "Asia" },
    { id: "europe", name: "Europe" },
    { id: "oceania", name: "Oceania" },
  ];
  const correct = items[0];
  const distractors = pickDistractors(items, correct, 3, fakeRng([0.1, 0.5, 0.9]));
  assert.equal(distractors.length, 3);
  assert.ok(distractors.every((d) => d.name !== "Africa"));
});

test("buildAnswerChoices includes the correct item plus all distractors exactly once", () => {
  const items = makeItems(6);
  const correct = items[0];
  const distractors = items.slice(1, 4);
  const choices = buildAnswerChoices(correct, distractors, fakeRng([0.5]));
  assert.equal(choices.length, 4);
  const ids = choices.map((c) => c.id).sort();
  assert.deepEqual(ids, [correct, ...distractors].map((c) => c.id).sort());
});

test("pickFact returns one of the item's facts", () => {
  const item = { id: "item-0", facts: ["fact a", "fact b", "fact c"] };
  assert.equal(pickFact(item, fakeRng([0])), "fact a");
  assert.equal(pickFact(item, fakeRng([0.5])), "fact b");
  assert.equal(pickFact(item, fakeRng([0.99])), "fact c");
});

test("pickFact works with a single fact", () => {
  const item = { id: "item-0", facts: ["only fact"] };
  assert.equal(pickFact(item, fakeRng([0])), "only fact");
});

test("pickFact returns undefined for an image-only recall variant with no facts", () => {
  const item = { id: "item-0-image-only", name: "Item 0" };
  assert.equal(pickFact(item), undefined);
});

test("shouldExpandPool fires when this answer newly mastered something and that reaches all-but-one-known", () => {
  // pool of 5: "almost known" means knownCount >= 4 (at most one unknown item left)
  assert.equal(shouldExpandPool(3, 4, 5), true);
  assert.equal(shouldExpandPool(4, 4, 5), false); // nothing newly mastered this turn
  assert.equal(shouldExpandPool(2, 3, 5), false); // not near the threshold yet
});

test("shouldExpandPool fires again on reaching fully-known, not just the first almost-known crossing", () => {
  // Mastering the pool's last remaining item (4 -> 5 of 5) must still fire,
  // or a pool can only ever expand once, ever - ties in "before" is what
  // wrongly excluded this case, see the reasoning comment above the impl.
  assert.equal(shouldExpandPool(4, 5, 5), true);
});

test("expandPool adds the most popular item not already in the pool", () => {
  const items = makeItems(7); // item-0 (popularity 7) .. item-6 (popularity 1)
  const pool = items.slice(2, 7); // missing item-0 and item-1, the two most popular
  const expanded = expandPool(pool, items);
  assert.equal(expanded.length, 6);
  assert.equal(expanded[5].id, "item-0");
  // original pool items are still present and untouched
  assert.deepEqual(expanded.slice(0, 5), pool);
});

test("expandPool returns the same pool when every item is already active", () => {
  const items = makeItems(5);
  const pool = [...items];
  const expanded = expandPool(pool, items);
  assert.equal(expanded.length, 5);
  assert.deepEqual(expanded, pool);
});

test("buildSelectionProbabilities weights candidates by 1 - P(correct), favoring less-known items", () => {
  const items = [
    { id: "item-0", popularity: 50 },
    { id: "item-1", popularity: 50 },
  ];
  const progress = { itemStats: { "item-0": { itemOffset: 3 } }, ability: 0 };
  const probs = buildSelectionProbabilities(items, progress);
  const byId = Object.fromEntries(probs.map((p) => [p.item.id, p.probability]));

  const REVIEW_WEIGHT_FLOOR = 0.05;
  const weight0 = Math.max(1 - probabilityCorrect(0, 3, 50, ANSWER_CHOICE_COUNT), REVIEW_WEIGHT_FLOOR);
  const weight1 = Math.max(1 - probabilityCorrect(0, 0, 50, ANSWER_CHOICE_COUNT), REVIEW_WEIGHT_FLOOR);
  const total = weight0 + weight1;
  assert.ok(Math.abs(byId["item-0"] - weight0 / total) < 1e-9);
  assert.ok(Math.abs(byId["item-1"] - weight1 / total) < 1e-9);
  assert.ok(byId["item-0"] < byId["item-1"]); // item-0 is better known, so it's weighted lower
});

test("buildSelectionProbabilities splits weight evenly across identical, evidence-free items", () => {
  const items = [
    { id: "item-0", popularity: 50 },
    { id: "item-1", popularity: 50 },
    { id: "item-2", popularity: 50 },
  ];
  const probs = buildSelectionProbabilities(items, { itemStats: {}, ability: 0 });
  probs.forEach((p) => assert.ok(Math.abs(p.probability - 1 / 3) < 1e-9));
});

test("buildSelectionProbabilities never assigns zero probability to a candidate, even when near-mastered", () => {
  const items = makeItems(4);
  const progress = { itemStats: { "item-0": { itemOffset: 10 } }, ability: 5 };
  const probs = buildSelectionProbabilities(items, progress);
  probs.forEach((p) => assert.ok(p.probability > 0));
});

test("pickWeightedCard excludes the previous item and respects the cumulative weighting", () => {
  const items = [
    { id: "item-0", popularity: 50 },
    { id: "item-1", popularity: 50 },
    { id: "item-2", popularity: 50 },
  ];
  const progress = { itemStats: { "item-0": { itemOffset: 5 } }, ability: 0 };
  // candidates (excluding item-0 as previous) are item-1, item-2, both evidence-free -> 0.5/0.5
  assert.equal(pickWeightedCard(items, "item-0", progress, fakeRng([0.1])).id, "item-1");
  assert.equal(pickWeightedCard(items, "item-0", progress, fakeRng([0.9])).id, "item-2");
});

test("pickWeightedCard returns the only item when the pool has exactly one item", () => {
  const items = makeItems(1);
  const progress = { itemStats: {}, ability: 0 };
  assert.equal(pickWeightedCard(items, "item-0", progress).id, "item-0");
});

test("selectPreloadTargets picks up to 3 other items from the pool", () => {
  const pool = makeItems(5);
  const targets = selectPreloadTargets(pool, "item-0", 3, fakeRng([0, 0.5, 0.9]));
  assert.equal(targets.length, 3);
  assert.ok(targets.every((t) => t.id !== "item-0"));
  assert.equal(new Set(targets.map((t) => t.id)).size, 3);
});

test("selectPreloadTargets returns fewer items when the pool is small", () => {
  const pool = makeItems(2);
  const targets = selectPreloadTargets(pool, "item-0", 3, fakeRng([0]));
  assert.equal(targets.length, 1);
  assert.equal(targets[0].id, "item-1");
});

test("isDebugPlayer matches the player name 'debug' regardless of case or whitespace", () => {
  assert.equal(isDebugPlayer("debug"), true);
  assert.equal(isDebugPlayer("Debug"), true);
  assert.equal(isDebugPlayer("  DEBUG  "), true);
});

test("isDebugPlayer is false for any other player name", () => {
  assert.equal(isDebugPlayer("Sam"), false);
  assert.equal(isDebugPlayer(""), false);
  assert.equal(isDebugPlayer(undefined), false);
});

test("pointsForAnswer scales with how much the answer moved P(known)", () => {
  const item = { id: "item-0", popularity: 50 };
  const progressBefore = { itemStats: {}, ability: 0 };
  const progressAfter = { itemStats: { "item-0": { itemOffset: 0.5 } }, ability: 0.2 };

  const before = getItemMasteryEstimate(progressBefore, item.id, item.popularity, 4).probability;
  const after = getItemMasteryEstimate(progressAfter, item.id, item.popularity, 4).probability;
  const expected = Math.max(1, Math.round((after - before) * 100));

  assert.equal(pointsForAnswer(progressBefore, progressAfter, item, 4), expected);
  assert.ok(expected > 1); // a coin-flip item moving toward known should clear the floor
});

test("pointsForAnswer floors at 1 even when the belief shift is negligible", () => {
  const item = { id: "item-0", popularity: 50 };
  // Already near-certain, so a correct answer barely moves P(known).
  const progressBefore = { itemStats: { "item-0": { itemOffset: 10 } }, ability: 0 };
  const progressAfter = { itemStats: { "item-0": { itemOffset: 10.05 } }, ability: 0.01 };

  assert.equal(pointsForAnswer(progressBefore, progressAfter, item, 4), 1);
});

function setUpDom() {
  globalThis.localStorage = createFakeStorage();
  const dom = new JSDOM("<div id=container></div>");
  globalThis.document = dom.window.document;
  return dom.window.document.getElementById("container");
}

// Stubs Math.random to always return 0, which (given the equal-popularity,
// no-prior-evidence items used below) makes pickWeightedCard deterministically
// select the first item in the pool, so these render tests aren't flaky.
function withStubbedRandom(fn) {
  const original = Math.random;
  Math.random = () => 0;
  try {
    fn();
  } finally {
    Math.random = original;
  }
}

test("startFlashcardSession shows a module placeholder image for a fact-only recall variant", () => {
  const container = setUpDom();
  const items = [
    { id: "africa-fact-only", name: "Africa", facts: ["A big continent."], popularity: 50 },
    { id: "asia", name: "Asia", image: "asia.png", alt: "Asia", facts: ["A big continent."], popularity: 50 },
    { id: "europe", name: "Europe", image: "europe.png", alt: "Europe", facts: ["A continent."], popularity: 50 },
    { id: "oceania", name: "Oceania", image: "oceania.png", alt: "Oceania", facts: ["A continent."], popularity: 50 },
  ];

  withStubbedRandom(() => {
    startFlashcardSession(container, {
      player: "Sam",
      moduleId: "continents",
      moduleVersion: "v1",
      items,
      onExit: () => {},
    });
  });

  const image = container.querySelector(".flashcard-image");
  assert.ok(image.classList.contains("flashcard-image-placeholder"));
  assert.equal(image.src.endsWith("images/continents/_placeholder.svg"), true);
  assert.equal(image.alt, "Image hidden for this card");
});

test("startFlashcardSession omits the fact paragraph for an image-only recall variant", () => {
  const container = setUpDom();
  const items = [
    { id: "africa-image-only", name: "Africa", image: "africa.png", alt: "Africa", popularity: 50 },
    { id: "asia", name: "Asia", image: "asia.png", alt: "Asia", facts: ["A big continent."], popularity: 50 },
    { id: "europe", name: "Europe", image: "europe.png", alt: "Europe", facts: ["A continent."], popularity: 50 },
    { id: "oceania", name: "Oceania", image: "oceania.png", alt: "Oceania", facts: ["A continent."], popularity: 50 },
  ];

  withStubbedRandom(() => {
    startFlashcardSession(container, {
      player: "Sam",
      moduleId: "continents",
      moduleVersion: "v1",
      items,
      onExit: () => {},
    });
  });

  assert.equal(container.querySelector(".flashcard-fact"), null);
  const image = container.querySelector(".flashcard-image");
  assert.equal(image.classList.contains("flashcard-image-placeholder"), false);
});
