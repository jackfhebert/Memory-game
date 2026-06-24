import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createFakeStorage } from "./helpers/fakeStorage.js";

beforeEach(() => {
  globalThis.localStorage = createFakeStorage();
});

const { countKnownItems, buildModuleTiles, renderModuleSelect, renderModeSelect } =
  await import("../js/modules.js");
const { recordAnswer } = await import("../js/storage.js");

const ITEMS = [
  { id: "africa", name: "Africa", popularity: 90 },
  { id: "asia", name: "Asia", popularity: 20 },
  { id: "europe", name: "Europe", popularity: 50 },
];

test("countKnownItems counts a popular item known after one correct answer", () => {
  const progress = {
    itemStats: {
      africa: { recent: [true] },
      asia: { recent: [false, false] },
    },
  };
  assert.equal(countKnownItems(ITEMS, progress), 1);
});

test("countKnownItems requires two correct answers for an unpopular item", () => {
  const progress = {
    itemStats: {
      asia: { recent: [true] },
    },
  };
  assert.equal(countKnownItems(ITEMS, progress), 0);

  const progressAfterSecondCorrect = {
    itemStats: {
      asia: { recent: [true, true] },
    },
  };
  assert.equal(countKnownItems(ITEMS, progressAfterSecondCorrect), 1);
});

test("countKnownItems is 0 when nothing has been answered", () => {
  assert.equal(countKnownItems(ITEMS, { itemStats: {} }), 0);
});

test("buildModuleTiles combines manifest data with per-module progress", () => {
  recordAnswer("Sam", "continents", "africa", true);
  const modules = [
    { id: "continents", name: "Continents", color: "#4F86C6", icon: "🌍" },
  ];
  const itemsByModuleId = new Map([["continents", ITEMS]]);
  const tiles = buildModuleTiles(modules, itemsByModuleId, "Sam");
  assert.deepEqual(tiles, [
    {
      id: "continents",
      name: "Continents",
      color: "#4F86C6",
      icon: "🌍",
      knownCount: 1,
      totalCount: 3,
    },
  ]);
});

test("renderModuleSelect renders one tile per module and wires up clicks", () => {
  const dom = new JSDOM("<div id=container></div>");
  globalThis.document = dom.window.document;
  const container = dom.window.document.getElementById("container");

  const tiles = [
    { id: "continents", name: "Continents", color: "#4F86C6", icon: "🌍", knownCount: 1, totalCount: 7 },
    { id: "oceans", name: "Oceans", color: "#2BB3A3", icon: "🌊", knownCount: 0, totalCount: 5 },
  ];
  let selected = null;
  renderModuleSelect(container, { tiles, onSelectModule: (id) => (selected = id) });

  const buttons = container.querySelectorAll(".tile");
  assert.equal(buttons.length, 2);
  assert.match(buttons[0].textContent, /Continents/);
  assert.match(buttons[0].textContent, /1 of 7/);

  buttons[1].dispatchEvent(new dom.window.Event("click"));
  assert.equal(selected, "oceans");
});

test("renderModeSelect renders both modes and wires up clicks", () => {
  const dom = new JSDOM("<div id=container></div>");
  globalThis.document = dom.window.document;
  const container = dom.window.document.getElementById("container");

  let selected = null;
  renderModeSelect(container, { onSelectMode: (mode) => (selected = mode) });

  const buttons = container.querySelectorAll(".tile");
  assert.equal(buttons.length, 2);

  buttons[0].dispatchEvent(new dom.window.Event("click"));
  assert.equal(selected, "active-learning");

  buttons[1].dispatchEvent(new dom.window.Event("click"));
  assert.equal(selected, "all-cards");
});
