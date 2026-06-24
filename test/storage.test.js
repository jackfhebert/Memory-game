import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createFakeStorage } from "./helpers/fakeStorage.js";

beforeEach(() => {
  globalThis.localStorage = createFakeStorage();
});

const {
  getPlayers,
  addPlayer,
  getProgress,
  recordAnswer,
  isItemKnown,
  probabilityKnown,
  probabilityCorrect,
  getMasteryEstimate,
} = await import("../js/storage.js");

test("getPlayers returns an empty array when nothing is stored", () => {
  assert.deepEqual(getPlayers(), []);
});

test("addPlayer adds a new name and persists it", () => {
  const result = addPlayer("Sam");
  assert.deepEqual(result, ["Sam"]);
  assert.deepEqual(getPlayers(), ["Sam"]);
});

test("addPlayer trims whitespace", () => {
  addPlayer("  Sam  ");
  assert.deepEqual(getPlayers(), ["Sam"]);
});

test("addPlayer ignores blank names", () => {
  addPlayer("   ");
  assert.deepEqual(getPlayers(), []);
});

test("addPlayer does not add duplicate names", () => {
  addPlayer("Sam");
  addPlayer("Sam");
  assert.deepEqual(getPlayers(), ["Sam"]);
});

test("getProgress defaults to empty itemStats when nothing is stored", () => {
  assert.deepEqual(getProgress("Sam", "continents"), { itemStats: {}, ability: 0 });
});

test("getProgress defaults to empty itemStats on corrupt JSON", () => {
  localStorage.setItem("memorygame:progress:Sam:continents", "not json");
  assert.deepEqual(getProgress("Sam", "continents"), { itemStats: {}, ability: 0 });
});

test("recordAnswer creates stats for a new item", () => {
  recordAnswer("Sam", "continents", "africa", true, 50);
  assert.deepEqual(getProgress("Sam", "continents"), {
    itemStats: { africa: { recent: [true], itemOffset: 0.25 } },
    ability: 0.1,
  });
});

test("recordAnswer accumulates recent outcomes across calls", () => {
  recordAnswer("Sam", "continents", "africa", true, 50);
  recordAnswer("Sam", "continents", "africa", false, 50);
  recordAnswer("Sam", "continents", "africa", true, 50);
  assert.deepEqual(getProgress("Sam", "continents").itemStats.africa.recent, [
    true,
    false,
    true,
  ]);
});

test("recordAnswer caps the recent window at 5 entries, dropping the oldest", () => {
  for (const outcome of [true, true, true, false, false, true]) {
    recordAnswer("Sam", "continents", "africa", outcome);
  }
  assert.deepEqual(getProgress("Sam", "continents").itemStats.africa.recent, [
    true,
    true,
    false,
    false,
    true,
  ]);
});

test("recordAnswer keeps separate stats per player and per module", () => {
  recordAnswer("Sam", "continents", "africa", true);
  recordAnswer("Alex", "continents", "africa", false);
  recordAnswer("Sam", "oceans", "africa", false);
  assert.deepEqual(getProgress("Sam", "continents").itemStats.africa.recent, [true]);
  assert.deepEqual(getProgress("Alex", "continents").itemStats.africa.recent, [false]);
  assert.deepEqual(getProgress("Sam", "oceans").itemStats.africa.recent, [false]);
});

test("isItemKnown is false when there's no answer history", () => {
  assert.equal(isItemKnown(undefined, 90), false);
  assert.equal(isItemKnown({ recent: [] }, 90), false);
});

test("isItemKnown treats a pre-recency itemStats shape as no history instead of throwing", () => {
  assert.equal(isItemKnown({ shown: 4, correct: 3 }, 90), false);
});

test("recordAnswer starts fresh history for a pre-recency itemStats shape instead of throwing", () => {
  localStorage.setItem(
    "memorygame:progress:Sam:continents",
    JSON.stringify({ itemStats: { africa: { shown: 4, correct: 3 } } }),
  );
  recordAnswer("Sam", "continents", "africa", true);
  assert.deepEqual(getProgress("Sam", "continents").itemStats.africa.recent, [true]);
});

test("isItemKnown counts a popular item known after a single correct answer", () => {
  assert.equal(isItemKnown({ recent: [true] }, 50), true);
  assert.equal(isItemKnown({ recent: [true] }, 100), true);
});

test("isItemKnown requires two correct answers for an unpopular item", () => {
  assert.equal(isItemKnown({ recent: [true] }, 49), false);
  assert.equal(isItemKnown({ recent: [true] }, 0), false);
  assert.equal(isItemKnown({ recent: [true, true] }, 0), true);
});

test("isItemKnown is false for mixed results without a fresh streak", () => {
  assert.equal(isItemKnown({ recent: [true, false] }, 100), false);
  assert.equal(isItemKnown({ recent: [false, true] }, 100), false);
  assert.equal(isItemKnown({ recent: [true, false, true] }, 100), false);
});

test("isItemKnown is true once the trailing streak reaches 3, overriding earlier misses", () => {
  assert.equal(isItemKnown({ recent: [false, true, true, true] }, 0), true);
  assert.equal(isItemKnown({ recent: [true, false, true, true] }, 0), false);
});

test("isItemKnown reflects a drop in recent performance, not just lifetime correct answers", () => {
  const stats = { recent: [true, false, false, false, false] };
  assert.equal(isItemKnown(stats, 100), false);
});

test("probabilityKnown is 0.5 for a neutral-difficulty item with no ability or evidence", () => {
  assert.equal(probabilityKnown(0, 0, 50), 0.5);
});

test("probabilityKnown rises with popularity and falls with rarity, all else equal", () => {
  assert.ok(probabilityKnown(0, 0, 100) > probabilityKnown(0, 0, 50));
  assert.ok(probabilityKnown(0, 0, 0) < probabilityKnown(0, 0, 50));
});

test("getMasteryEstimate gives a fresh player a 0.5 prior on a neutral-popularity item", () => {
  const estimate = getMasteryEstimate("Sam", "continents", "africa", 50, 4);
  assert.deepEqual(estimate, {
    ability: 0,
    itemOffset: 0,
    difficulty: 0,
    probability: 0.5,
    probabilityCorrect: 0.625,
  });
});

test("probabilityCorrect adds a guessing floor on top of P(known) for multiple-choice cards", () => {
  assert.equal(probabilityCorrect(0, 0, 50, 4), 0.625); // 0.25 + 0.75 * 0.5
  assert.equal(probabilityCorrect(0, 0, 100, 4), 0.25 + 0.75 * probabilityKnown(0, 0, 100));
});

test("probabilityCorrect is always at least the guessing floor, even for a fully unknown item", () => {
  assert.ok(probabilityCorrect(-10, 0, 0, 4) > 0.25);
  assert.ok(probabilityCorrect(-10, 0, 0, 4) < 0.26);
});

test("recordAnswer raises ability and itemOffset after a correct answer", () => {
  const progress = recordAnswer("Sam", "continents", "africa", true, 50);
  assert.equal(progress.ability, 0.1);
  assert.equal(progress.itemStats.africa.itemOffset, 0.25);
});

test("recordAnswer lowers ability and itemOffset after an incorrect answer", () => {
  const progress = recordAnswer("Sam", "continents", "africa", false, 50);
  assert.equal(progress.ability, -0.1);
  assert.equal(progress.itemStats.africa.itemOffset, -0.25);
});

test("recordAnswer's itemOffset gain shrinks as more evidence confirms the same outcome", () => {
  const after1 = recordAnswer("Sam", "continents", "africa", true, 50);
  const gain1 = after1.itemStats.africa.itemOffset;
  const after2 = recordAnswer("Sam", "continents", "africa", true, 50);
  const gain2 = after2.itemStats.africa.itemOffset - gain1;
  assert.ok(gain2 > 0 && gain2 < gain1);
});

test("getMasteryEstimate reflects ability and itemOffset accumulated via recordAnswer", () => {
  recordAnswer("Sam", "continents", "africa", true, 50);
  const estimate = getMasteryEstimate("Sam", "continents", "africa", 50, 4);
  assert.equal(estimate.ability, 0.1);
  assert.equal(estimate.itemOffset, 0.25);
  assert.equal(estimate.probability, probabilityKnown(0.1, 0.25, 50));
  assert.equal(estimate.probabilityCorrect, probabilityCorrect(0.1, 0.25, 50, 4));
});
