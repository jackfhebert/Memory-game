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

test("countKnownItems counts items whose P(known) has crossed the mastery threshold", () => {
  const progress = {
    itemStats: {
      // popularity 90, ability 0 -> well past the mastery threshold, with evidence
      africa: { recent: [true], itemOffset: 3 },
      // popularity 20, answered but no offset evidence yet -> below threshold
      asia: { recent: [true], itemOffset: 0 },
    },
    ability: 0,
  };
  assert.equal(countKnownItems(ITEMS, progress), 1);
});

test("countKnownItems requires more itemOffset evidence for a less popular item", () => {
  const progress = { itemStats: { asia: { recent: [true], itemOffset: 1 } }, ability: 0 };
  assert.equal(countKnownItems(ITEMS, progress), 0);

  const progressWithMoreEvidence = {
    itemStats: { asia: { recent: [true], itemOffset: 5 } },
    ability: 0,
  };
  assert.equal(countKnownItems(ITEMS, progressWithMoreEvidence), 1);
});

test("countKnownItems is 0 when nothing has been answered, even for a popular item", () => {
  assert.equal(countKnownItems(ITEMS, { itemStats: {}, ability: 0 }), 0);
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
