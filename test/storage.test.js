import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createFakeStorage } from "./helpers/fakeStorage.js";

beforeEach(() => {
  globalThis.localStorage = createFakeStorage();
});

const { getPlayers, addPlayer, getProgress, recordAnswer } = await import(
  "../js/storage.js"
);

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
    itemStats: { africa: { shown: 1, correct: 1 } },
  });
});

test("recordAnswer accumulates shown/correct counts across calls", () => {
  recordAnswer("Sam", "continents", "africa", true);
  recordAnswer("Sam", "continents", "africa", false);
  recordAnswer("Sam", "continents", "africa", true);
  assert.deepEqual(getProgress("Sam", "continents"), {
    itemStats: { africa: { shown: 3, correct: 2 } },
  });
});

test("recordAnswer keeps separate stats per player and per module", () => {
  recordAnswer("Sam", "continents", "africa", true);
  recordAnswer("Alex", "continents", "africa", false);
  recordAnswer("Sam", "oceans", "africa", false);
  assert.deepEqual(getProgress("Sam", "continents").itemStats.africa, {
    shown: 1,
    correct: 1,
  });
  assert.deepEqual(getProgress("Alex", "continents").itemStats.africa, {
    shown: 1,
    correct: 0,
  });
  assert.deepEqual(getProgress("Sam", "oceans").itemStats.africa, {
    shown: 1,
    correct: 0,
  });
});
