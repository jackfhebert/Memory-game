import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildActivePool,
  pickNextCard,
  pickOrderedOrRandomCard,
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
} from "../js/flashcards.js";
import { fakeRng } from "./helpers/fakeRng.js";

function makeItems(n) {
  // popularity descends with index: item-0 is the most popular, item-(n-1) the least.
  return Array.from({ length: n }, (_, i) => ({
    id: `item-${i}`,
    name: `Item ${i}`,
    popularity: n - i,
  }));
}

test("buildActivePool selects the most popular items for active-learning when more are available", () => {
  const items = makeItems(7);
  const pool = buildActivePool(items, "active-learning");
  assert.equal(pool.length, 5);
  assert.deepEqual(
    pool.map((i) => i.id),
    ["item-0", "item-1", "item-2", "item-3", "item-4"],
  );
});

test("buildActivePool uses every item when the module has 5 or fewer", () => {
  const items = makeItems(5);
  const pool = buildActivePool(items, "active-learning");
  assert.equal(pool.length, 5);
  assert.deepEqual(
    pool.map((i) => i.id).sort(),
    items.map((i) => i.id).sort(),
  );
});

test("buildActivePool uses every item immediately for all-cards, sorted by popularity", () => {
  const items = makeItems(7);
  const pool = buildActivePool(items, "all-cards");
  assert.equal(pool.length, 7);
  assert.deepEqual(
    pool.map((i) => i.id),
    ["item-0", "item-1", "item-2", "item-3", "item-4", "item-5", "item-6"],
  );
});

test("pickNextCard avoids an immediate repeat when the pool has more than one item", () => {
  const pool = makeItems(3);
  for (let trial = 0; trial < 20; trial++) {
    const rng = fakeRng([trial / 20]);
    const next = pickNextCard(pool, "item-0", rng);
    assert.notEqual(next.id, "item-0");
  }
});

test("pickNextCard returns the only item when the pool has exactly one item", () => {
  const pool = makeItems(1);
  const next = pickNextCard(pool, "item-0");
  assert.equal(next.id, "item-0");
});

test("pickNextCard throws on an empty pool", () => {
  assert.throws(() => pickNextCard([], null));
});

test("pickOrderedOrRandomCard walks the pool in order during the first pass", () => {
  const pool = makeItems(4);
  assert.equal(pickOrderedOrRandomCard(pool, 0, null).id, "item-0");
  assert.equal(pickOrderedOrRandomCard(pool, 1, "item-0").id, "item-1");
  assert.equal(pickOrderedOrRandomCard(pool, 2, "item-1").id, "item-2");
  assert.equal(pickOrderedOrRandomCard(pool, 3, "item-2").id, "item-3");
});

test("pickOrderedOrRandomCard falls back to random selection after the first pass", () => {
  const pool = makeItems(3);
  for (let trial = 0; trial < 20; trial++) {
    const rng = fakeRng([trial / 20]);
    const next = pickOrderedOrRandomCard(pool, 3, "item-0", rng);
    assert.notEqual(next.id, "item-0");
  }
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

test("shouldExpandPool fires only when the pool crosses into all-but-one-known, in active-learning mode", () => {
  // pool of 5: "almost known" means knownCount >= 4 (at most one unknown item left)
  assert.equal(shouldExpandPool("active-learning", 3, 4, 5), true);
  assert.equal(shouldExpandPool("active-learning", 4, 4, 5), false);
  assert.equal(shouldExpandPool("active-learning", 4, 5, 5), false);
  assert.equal(shouldExpandPool("active-learning", 2, 3, 5), false);
  assert.equal(shouldExpandPool("all-cards", 3, 4, 5), false);
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

test("buildSelectionProbabilities splits 75% across unknown items and 25% across known items", () => {
  const items = makeItems(4); // all popularity < 50, so two correct answers are needed to count as known
  const progress = {
    itemStats: {
      "item-0": { recent: [true, true] },
      "item-1": { recent: [true, true] },
    },
  };
  const probs = buildSelectionProbabilities(items, progress);
  const byId = Object.fromEntries(probs.map((p) => [p.item.id, p.probability]));
  assert.equal(byId["item-0"], 0.125); // known, splits 25% two ways
  assert.equal(byId["item-1"], 0.125);
  assert.equal(byId["item-2"], 0.375); // unknown, splits 75% two ways
  assert.equal(byId["item-3"], 0.375);
});

test("buildSelectionProbabilities gives every item a share when all are known or all are unknown", () => {
  const items = makeItems(3);
  const allUnknown = buildSelectionProbabilities(items, { itemStats: {} });
  allUnknown.forEach((p) => assert.equal(p.probability, 1 / 3));

  const allKnownProgress = {
    itemStats: Object.fromEntries(items.map((i) => [i.id, { recent: [true, true] }])),
  };
  const allKnown = buildSelectionProbabilities(items, allKnownProgress);
  allKnown.forEach((p) => assert.equal(p.probability, 1 / 3));
});

test("pickWeightedCard never assigns zero probability to a candidate", () => {
  const items = makeItems(4);
  const progress = { itemStats: { "item-0": { recent: [true, true] } } };
  const probs = buildSelectionProbabilities(items, progress);
  probs.forEach((p) => assert.ok(p.probability > 0));
});

test("pickWeightedCard excludes the previous item and respects the cumulative weighting", () => {
  const items = makeItems(3); // item-0 known, item-1 and item-2 unknown
  const progress = { itemStats: { "item-0": { recent: [true, true] } } };
  // candidates (excluding item-0 as previous) are item-1, item-2, each unknown -> 0.5/0.5
  assert.equal(pickWeightedCard(items, "item-0", progress, fakeRng([0.1])).id, "item-1");
  assert.equal(pickWeightedCard(items, "item-0", progress, fakeRng([0.9])).id, "item-2");
});

test("pickWeightedCard returns the only item when the pool has exactly one item", () => {
  const items = makeItems(1);
  const progress = { itemStats: {} };
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
