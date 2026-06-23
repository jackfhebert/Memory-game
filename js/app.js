import { renderPlayerSelect } from "./players.js";
import {
  getModuleList,
  getModuleItems,
  buildModuleTiles,
  renderModuleSelect,
  renderModeSelect,
} from "./modules.js";
import { startFlashcardSession } from "./flashcards.js";

const SCREENS = [
  "player-select",
  "module-select",
  "mode-select",
  "flashcard",
];

const state = {
  player: null,
  moduleId: null,
  mode: null,
};

export function showScreen(name) {
  SCREENS.forEach((screen) => {
    const el = document.getElementById(`screen-${screen}`);
    if (!el) return;
    el.classList.toggle("active", screen === name);
  });
}

function screenContainer(name) {
  return document.getElementById(`screen-${name}`);
}

async function goToPlayerSelect() {
  renderPlayerSelect(screenContainer("player-select"), {
    onSelectPlayer: (player) => {
      state.player = player;
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
      goToModeSelect(itemsByModuleId.get(moduleId).length);
    },
  });
  showScreen("module-select");
}

function goToModeSelect(totalCount) {
  renderModeSelect(screenContainer("mode-select"), {
    totalCount,
    onSelectMode: (mode) => {
      state.mode = mode;
      goToFlashcards();
    },
  });
  showScreen("mode-select");
}

async function goToFlashcards() {
  const items = await getModuleItems(state.moduleId);
  startFlashcardSession(screenContainer("flashcard"), {
    player: state.player,
    moduleId: state.moduleId,
    items,
    mode: state.mode,
    onExit: goToModuleSelect,
  });
  showScreen("flashcard");
}

function init() {
  goToPlayerSelect();
}

if (typeof document !== "undefined" && document.getElementById("screen-player-select")) {
  init();
}
