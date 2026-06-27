import { getProgress, isItemMastered } from "./storage.js";
import { ACTIVE_LEARNING_POOL_SIZE } from "./flashcards.js";

let manifestCache = null;
const itemsCache = new Map();

export async function getModuleList() {
  if (!manifestCache) {
    const res = await fetch("data/modules.json");
    manifestCache = await res.json();
  }
  return manifestCache;
}

export async function getModuleItems(moduleId) {
  if (!itemsCache.has(moduleId)) {
    const modules = await getModuleList();
    const entry = modules.find((m) => m.id === moduleId);
    const res = await fetch(`data/${entry.dataFile}`);
    itemsCache.set(moduleId, await res.json());
  }
  return itemsCache.get(moduleId);
}

export function countKnownItems(items, progress) {
  return items.filter((item) => isItemMastered(progress, item.id, item.popularity)).length;
}

export function buildModuleTiles(modules, itemsByModuleId, player) {
  return modules.map((module) => {
    const items = itemsByModuleId.get(module.id) || [];
    const progress = getProgress(player, module.id, module.version);
    return {
      id: module.id,
      name: module.name,
      color: module.color,
      icon: module.icon,
      knownCount: countKnownItems(items, progress),
      totalCount: items.length,
    };
  });
}

export function renderModuleSelect(container, { tiles, onSelectModule }) {
  container.innerHTML = "";
  const grid = document.createElement("div");
  grid.className = "tile-grid";

  tiles.forEach((tile) => {
    const button = document.createElement("button");
    button.className = "tile";
    button.style.setProperty("--tile-color", tile.color);

    const icon = document.createElement("span");
    icon.className = "tile-icon";
    icon.textContent = tile.icon;
    button.appendChild(icon);

    const name = document.createElement("span");
    name.className = "tile-name";
    name.textContent = tile.name;
    button.appendChild(name);

    const progress = document.createElement("span");
    progress.className = "tile-progress";
    progress.textContent = `${tile.knownCount} of ${tile.totalCount}`;
    button.appendChild(progress);

    button.addEventListener("click", () => onSelectModule(tile.id));
    grid.appendChild(button);
  });

  container.appendChild(grid);
}

export function buildModeOptions(totalCount) {
  const starterCount = Math.min(ACTIVE_LEARNING_POOL_SIZE, totalCount);
  return [
    {
      id: "active-learning",
      label: "Active Learning",
      description: `${starterCount} cards to start, then more as you learn`,
    },
    {
      id: "all-cards",
      label: "All Cards",
      description: `All ${totalCount} cards`,
    },
  ];
}

export function renderModeSelect(container, { totalCount, onSelectMode }) {
  container.innerHTML = "";
  const grid = document.createElement("div");
  grid.className = "tile-grid";

  buildModeOptions(totalCount).forEach((mode) => {
    const button = document.createElement("button");
    button.className = "tile";

    const label = document.createElement("span");
    label.className = "tile-name";
    label.textContent = mode.label;
    button.appendChild(label);

    const description = document.createElement("span");
    description.className = "tile-description";
    description.textContent = mode.description;
    button.appendChild(description);

    button.addEventListener("click", () => onSelectMode(mode.id));
    grid.appendChild(button);
  });

  container.appendChild(grid);
}
