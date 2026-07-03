import { getProgress, isItemMastered } from "./storage.js";

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

// Recall variants share a `name` with their base item (see DESIGN.md,
// "Recall Variants") so module totals count distinct names, not raw
// entries. Keeping the first occurrence in file order means the base
// item - authored ahead of its variants - decides the name's mastery.
function dedupeByName(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (seen.has(item.name)) return false;
    seen.add(item.name);
    return true;
  });
}

export function countKnownItems(items, progress) {
  return dedupeByName(items).filter((item) =>
    isItemMastered(progress, item.id, item.popularity),
  ).length;
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
      totalCount: dedupeByName(items).length,
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
