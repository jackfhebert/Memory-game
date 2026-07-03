import { renderPlayerSelect } from "./players.js";
import {
  getModuleList,
  getModuleItems,
  buildModuleTiles,
  renderModuleSelect,
} from "./modules.js";
import { startFlashcardSession } from "./flashcards.js";

const SCREENS = ["player-select", "module-select", "flashcard"];

const state = {
  player: null,
  moduleId: null,
  moduleVersion: null,
  sessionPoints: 0,
};

export function showScreen(name) {
  SCREENS.forEach((screen) => {
    const el = document.getElementById(`screen-${screen}`);
    if (!el) return;
    el.classList.toggle("active", screen === name);
  });
  renderSessionPointsBar();
}

function screenContainer(name) {
  return document.getElementById(`screen-${name}`);
}

// Running point total for the current play session, carried across module
// switches (not just within one flashcard session) - resets only when a
// player is (re)selected at Player Select. See DESIGN.md "Session Points".
function renderSessionPointsBar() {
  const bar = document.getElementById("session-points-bar");
  if (!bar) return;
  bar.classList.toggle("active", state.player !== null);
  bar.textContent = `⭐ ${state.sessionPoints} points`;
}

function addSessionPoints(points) {
  state.sessionPoints += points;
  renderSessionPointsBar();
}

async function goToPlayerSelect() {
  renderPlayerSelect(screenContainer("player-select"), {
    onSelectPlayer: (player) => {
      state.player = player;
      state.sessionPoints = 0;
      goToModuleSelect();
    },
  });
  showScreen("player-select");
}

async function goToModuleSelect() {
  const modules = await getModuleList();
  const itemsByModuleId = new Map(
    await Promise.all(
      modules.map(async (module) => [module.id, await getModuleItems(module.id)]),
    ),
  );
  const tiles = buildModuleTiles(modules, itemsByModuleId, state.player);
  renderModuleSelect(screenContainer("module-select"), {
    tiles,
    onSelectModule: (moduleId) => {
      state.moduleId = moduleId;
      state.moduleVersion = modules.find((module) => module.id === moduleId).version;
      goToFlashcards();
    },
  });
  showScreen("module-select");
}

async function goToFlashcards() {
  const items = await getModuleItems(state.moduleId);
  startFlashcardSession(screenContainer("flashcard"), {
    player: state.player,
    moduleId: state.moduleId,
    moduleVersion: state.moduleVersion,
    items,
    onExit: goToModuleSelect,
    onPointsEarned: addSessionPoints,
  });
  showScreen("flashcard");
}

function init() {
  goToPlayerSelect();
}

if (typeof document !== "undefined" && document.getElementById("screen-player-select")) {
  init();
}
