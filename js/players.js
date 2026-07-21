import { getPlayers, addPlayer } from "./storage.js";
import { APP_VERSION } from "./version.js";

export function normalizePlayerName(name) {
  return name.trim();
}

export function renderPlayerSelect(container, { onSelectPlayer }) {
  container.innerHTML = "";
  const grid = document.createElement("div");
  grid.className = "tile-grid";

  getPlayers().forEach((name) => {
    const button = document.createElement("button");
    button.className = "tile";
    button.textContent = name;
    button.addEventListener("click", () => onSelectPlayer(name));
    grid.appendChild(button);
  });

  const addButton = document.createElement("button");
  addButton.className = "tile tile-add";
  addButton.textContent = "+ Add Player";
  addButton.addEventListener("click", () => {
    renderAddPlayerForm(grid, addButton, { onSelectPlayer });
  });
  grid.appendChild(addButton);

  container.appendChild(grid);

  const version = document.createElement("p");
  version.className = "app-version";
  version.textContent = `v${APP_VERSION}`;
  container.appendChild(version);
}

function renderAddPlayerForm(grid, addButton, { onSelectPlayer }) {
  const form = document.createElement("div");
  form.className = "add-player-form";

  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Name";

  const confirmButton = document.createElement("button");
  confirmButton.textContent = "Add";
  confirmButton.addEventListener("click", () => {
    const name = normalizePlayerName(input.value);
    if (!name) return;
    addPlayer(name);
    onSelectPlayer(name);
  });

  form.appendChild(input);
  form.appendChild(confirmButton);
  grid.replaceChild(form, addButton);
  input.focus();
}
