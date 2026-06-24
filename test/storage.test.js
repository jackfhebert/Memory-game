import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createFakeStorage } from "./helpers/fakeStorage.js";

beforeEach(() => {
  globalThis.localStorage = createFakeStorage();
});

const { getPlayers, addPlayer, getProgress, recordAnswer, isItemKnown } =
  await import("../js/storage.js");

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
  assert.deepEqual(getProgress("Sam", "continents"), { itemStats: {} });
});

test("getProgress defaults to empty itemStats on corrupt JSON", () => {
  localStorage.setItem("memorygame:progress:Sam:continents", "not json");
  assert.deepEqual(getProgress("Sam", "continents"), { itemStats: {} });
});

test("recordAnswer creates stats for a new item", () => {
  recordAnswer("Sam", "continents", "africa", true);
  assert.deepEqual(getProgress("Sam", "continents"), {
    itemStats: { africa: { recent: [true] } },
  });
});

test("recordAnswer accumulates recent outcomes across calls", () => {
  recordAnswer("Sam", "continents", "africa", true);
  recordAnswer("Sam", "continents", "africa", false);
  recordAnswer("Sam", "continents", "africa", true);
  assert.deepEqual(getProgress("Sam", "continents"), {
    itemStats: { africa: { recent: [true, false, true] } },
  });
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
  assert.deepEqual(getProgress("Sam", "continents").itemStats.africa, {
    recent: [true],
  });
  assert.deepEqual(getProgress("Alex", "continents").itemStats.africa, {
    recent: [false],
  });
  assert.deepEqual(getProgress("Sam", "oceans").itemStats.africa, {
    recent: [false],
  });
});

test("isItemKnown is false when there's no answer history", () => {
  assert.equal(isItemKnown(undefined), false);
  assert.equal(isItemKnown({ recent: [] }), false);
});

test("isItemKnown is true once the recent correct rate reaches 80%", () => {
  assert.equal(isItemKnown({ recent: [true] }), true);
  assert.equal(isItemKnown({ recent: [true, true, true, true, false] }), true);
  assert.equal(
    isItemKnown({ recent: [true, true, true, false, false] }),
    false,
  );
});

test("isItemKnown reflects a drop in recent performance, not just lifetime correct answers", () => {
  const stats = { recent: [true, false, false, false, false] };
  assert.equal(isItemKnown(stats), false);
});
