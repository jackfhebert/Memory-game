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
  probabilityKnown,
  probabilityCorrect,
  getMasteryEstimate,
  getItemMasteryEstimate,
  isItemMastered,
  MASTERY_KNOWN_THRESHOLD,
} = await import("../js/storage.js");

const VERSION = "2026-06-27T00:00:00Z";

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
  assert.deepEqual(getProgress("Sam", "continents", VERSION), {
    itemStats: {},
    ability: 0,
    version: VERSION,
  });
});

test("getProgress defaults to empty itemStats on corrupt JSON", () => {
  localStorage.setItem("memorygame:progress:Sam:continents", "not json");
  assert.deepEqual(getProgress("Sam", "continents", VERSION), {
    itemStats: {},
    ability: 0,
    version: VERSION,
  });
});

test("getProgress discards stats recorded under a different module version", () => {
  recordAnswer("Sam", "continents", "africa", true, 50, VERSION);
  assert.notEqual(getProgress("Sam", "continents", VERSION).itemStats.africa, undefined);

  const newVersion = "2026-07-01T00:00:00Z";
  assert.deepEqual(getProgress("Sam", "continents", newVersion), {
    itemStats: {},
    ability: 0,
    version: newVersion,
  });
});

test("getProgress discards stats with no version at all (pre-versioning data)", () => {
  localStorage.setItem(
    "memorygame:progress:Sam:continents",
    JSON.stringify({ itemStats: { africa: { recent: [true], itemOffset: 3 } }, ability: 0.5 }),
  );
  assert.deepEqual(getProgress("Sam", "continents", VERSION), {
    itemStats: {},
    ability: 0,
    version: VERSION,
  });
});

test("recordAnswer creates stats for a new item", () => {
  recordAnswer("Sam", "continents", "africa", true, 50, VERSION);
  assert.deepEqual(getProgress("Sam", "continents", VERSION), {
    itemStats: { africa: { recent: [true], itemOffset: 0.25 } },
    ability: 0.1,
    version: VERSION,
  });
});

test("recordAnswer accumulates recent outcomes across calls", () => {
  recordAnswer("Sam", "continents", "africa", true, 50, VERSION);
  recordAnswer("Sam", "continents", "africa", false, 50, VERSION);
  recordAnswer("Sam", "continents", "africa", true, 50, VERSION);
  assert.deepEqual(getProgress("Sam", "continents", VERSION).itemStats.africa.recent, [
    true,
    false,
    true,
  ]);
});

test("recordAnswer caps the recent window at 5 entries, dropping the oldest", () => {
  for (const outcome of [true, true, true, false, false, true]) {
    recordAnswer("Sam", "continents", "africa", outcome, undefined, VERSION);
  }
  assert.deepEqual(getProgress("Sam", "continents", VERSION).itemStats.africa.recent, [
    true,
    true,
    false,
    false,
    true,
  ]);
});

test("recordAnswer keeps separate stats per player and per module", () => {
  recordAnswer("Sam", "continents", "africa", true, undefined, VERSION);
  recordAnswer("Alex", "continents", "africa", false, undefined, VERSION);
  recordAnswer("Sam", "oceans", "africa", false, undefined, VERSION);
  assert.deepEqual(getProgress("Sam", "continents", VERSION).itemStats.africa.recent, [true]);
  assert.deepEqual(getProgress("Alex", "continents", VERSION).itemStats.africa.recent, [false]);
  assert.deepEqual(getProgress("Sam", "oceans", VERSION).itemStats.africa.recent, [false]);
});

test("recordAnswer starts fresh history for a pre-recency itemStats shape instead of throwing", () => {
  localStorage.setItem(
    "memorygame:progress:Sam:continents",
    JSON.stringify({ itemStats: { africa: { shown: 4, correct: 3 } }, version: VERSION }),
  );
  recordAnswer("Sam", "continents", "africa", true, undefined, VERSION);
  assert.deepEqual(getProgress("Sam", "continents", VERSION).itemStats.africa.recent, [true]);
});

test("probabilityKnown is 0.5 for a neutral-difficulty item with no ability or evidence", () => {
  assert.equal(probabilityKnown(0, 0, 50), 0.5);
});

test("probabilityKnown rises with popularity and falls with rarity, all else equal", () => {
  assert.ok(probabilityKnown(0, 0, 100) > probabilityKnown(0, 0, 50));
  assert.ok(probabilityKnown(0, 0, 0) < probabilityKnown(0, 0, 50));
});

test("getMasteryEstimate gives a fresh player a 0.5 prior on a neutral-popularity item", () => {
  const estimate = getMasteryEstimate("Sam", "continents", "africa", 50, 4, VERSION);
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
  const progress = recordAnswer("Sam", "continents", "africa", true, 50, VERSION);
  assert.equal(progress.ability, 0.1);
  assert.equal(progress.itemStats.africa.itemOffset, 0.25);
});

test("recordAnswer lowers ability and itemOffset after an incorrect answer", () => {
  const progress = recordAnswer("Sam", "continents", "africa", false, 50, VERSION);
  assert.equal(progress.ability, -0.1);
  assert.equal(progress.itemStats.africa.itemOffset, -0.25);
});

test("recordAnswer's itemOffset gain shrinks as more evidence confirms the same outcome", () => {
  const after1 = recordAnswer("Sam", "continents", "africa", true, 50, VERSION);
  const gain1 = after1.itemStats.africa.itemOffset;
  const after2 = recordAnswer("Sam", "continents", "africa", true, 50, VERSION);
  const gain2 = after2.itemStats.africa.itemOffset - gain1;
  assert.ok(gain2 > 0 && gain2 < gain1);
});

test("getMasteryEstimate reflects ability and itemOffset accumulated via recordAnswer", () => {
  recordAnswer("Sam", "continents", "africa", true, 50, VERSION);
  const estimate = getMasteryEstimate("Sam", "continents", "africa", 50, 4, VERSION);
  assert.equal(estimate.ability, 0.1);
  assert.equal(estimate.itemOffset, 0.25);
  assert.equal(estimate.probability, probabilityKnown(0.1, 0.25, 50));
  assert.equal(estimate.probabilityCorrect, probabilityCorrect(0.1, 0.25, 50, 4));
});

test("getItemMasteryEstimate matches getMasteryEstimate given the same progress, item, and popularity", () => {
  recordAnswer("Sam", "continents", "africa", true, 50, VERSION);
  const progress = getProgress("Sam", "continents", VERSION);
  const viaProgress = getItemMasteryEstimate(progress, "africa", 50, 4);
  const viaPlayer = getMasteryEstimate("Sam", "continents", "africa", 50, 4, VERSION);
  assert.deepEqual(viaProgress, viaPlayer);
});

test("isItemMastered is false for a fresh player with no evidence, even for a very popular item", () => {
  const progress = { itemStats: {}, ability: 0 };
  assert.equal(isItemMastered(progress, "africa", 50), false);
  // popularity alone clears MASTERY_KNOWN_THRESHOLD here, but no answer has been recorded yet
  assert.ok(probabilityKnown(0, 0, 90) >= MASTERY_KNOWN_THRESHOLD);
  assert.equal(isItemMastered(progress, "africa", 90), false);
});

test("isItemMastered is true once P(known) crosses MASTERY_KNOWN_THRESHOLD, given evidence", () => {
  const progress = { itemStats: { africa: { recent: [true], itemOffset: 0 } }, ability: 0 };
  assert.ok(probabilityKnown(0, 0, 50) < MASTERY_KNOWN_THRESHOLD);
  assert.equal(isItemMastered(progress, "africa", 50), false);

  const masteredProgress = {
    itemStats: { africa: { recent: [true], itemOffset: 3 } },
    ability: 0,
  };
  assert.ok(probabilityKnown(0, 3, 50) >= MASTERY_KNOWN_THRESHOLD);
  assert.equal(isItemMastered(masteredProgress, "africa", 50), true);
});

test("isItemMastered reaches the threshold after enough correct answers via recordAnswer", () => {
  let progress;
  for (let i = 0; i < 10; i++) {
    progress = recordAnswer("Sam", "continents", "africa", true, 90, VERSION);
  }
  assert.equal(isItemMastered(progress, "africa", 90), true);
});
