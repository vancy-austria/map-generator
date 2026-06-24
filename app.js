const LAYERS = ["Ground", "GroundDecoration", "Buildings", "Decoration", "Interactable"];

const state = {
  mapName: "generated-map",
  width: 32,
  height: 24,
  tileSize: 16,
  sheets: [],
  activeSheetId: null,
  selected: new Set(),
  dragStart: null,
  dragPreview: null,
  sheetZoom: 2,
  mapZoom: 1,
  pools: Object.fromEntries(LAYERS.map((layer) => [layer, []])),
  layers: Object.fromEntries(LAYERS.map((layer) => [layer, null])),
  properties: [{ name: "smashable", type: "bool", value: "true" }],
};

const el = {
  mapName: document.querySelector("#mapName"),
  mapWidth: document.querySelector("#mapWidth"),
  mapHeight: document.querySelector("#mapHeight"),
  tileSize: document.querySelector("#tileSize"),
  resizeMap: document.querySelector("#resizeMap"),
  sheetUpload: document.querySelector("#sheetUpload"),
  fileDrop: document.querySelector("#fileDrop"),
  sheetList: document.querySelector("#sheetList"),
  sheetCanvas: document.querySelector("#sheetCanvas"),
  sheetEmpty: document.querySelector("#sheetEmpty"),
  poolSelect: document.querySelector("#poolSelect"),
  assignSelected: document.querySelector("#assignSelected"),
  resetSelected: document.querySelector("#resetSelected"),
  sheetZoom: document.querySelector("#sheetZoom"),
  sheetZoomValue: document.querySelector("#sheetZoomValue"),
  resetZoom: document.querySelector("#resetZoom"),
  poolSummary: document.querySelector("#poolSummary"),
  layerControls: document.querySelector("#layerControls"),
  mapCanvas: document.querySelector("#mapCanvas"),
  mapZoom: document.querySelector("#mapZoom"),
  mapZoomValue: document.querySelector("#mapZoomValue"),
  resetMapZoom: document.querySelector("#resetMapZoom"),
  visibleLayer: document.querySelector("#visibleLayer"),
  clearMap: document.querySelector("#clearMap"),
  exportTmx: document.querySelector("#exportTmx"),
  tmxOutput: document.querySelector("#tmxOutput"),
  objectName: document.querySelector("#objectName"),
  propertyName: document.querySelector("#propertyName"),
  propertyType: document.querySelector("#propertyType"),
  propertyValue: document.querySelector("#propertyValue"),
  addProperty: document.querySelector("#addProperty"),
  propertyList: document.querySelector("#propertyList"),
};

const sheetCtx = el.sheetCanvas.getContext("2d");
const mapCtx = el.mapCanvas.getContext("2d");

const zoomControls = {
  sheet: {
    get zoom() {
      return state.sheetZoom;
    },
    set zoom(value) {
      state.sheetZoom = value;
    },
    input: el.sheetZoom,
    value: el.sheetZoomValue,
    reset: el.resetZoom,
    redraw: drawSheet,
  },
  map: {
    get zoom() {
      return state.mapZoom;
    },
    set zoom(value) {
      state.mapZoom = value;
    },
    input: el.mapZoom,
    value: el.mapZoomValue,
    reset: el.resetMapZoom,
    redraw: drawMap,
  },
};

function activeSheet() {
  return state.sheets.find((sheet) => sheet.id === state.activeSheetId);
}

function emptyLayerState() {
  return Object.fromEntries(LAYERS.map((layer) => [layer, null]));
}

function emptyPoolState() {
  return Object.fromEntries(LAYERS.map((layer) => [layer, []]));
}

function recalcSheetGrid(sheet) {
  sheet.columns = Math.floor(sheet.image.width / state.tileSize);
  sheet.rows = Math.floor(sheet.image.height / state.tileSize);
}

function tileKey(sheetId, index) {
  return `${sheetId}:${index}`;
}

function parseTileKey(key) {
  const [sheetId, index] = key.split(":");
  return {
    sheetId,
    index: Number(index),
    width: 1,
    height: 1,
  };
}

function tileFromRef(ref) {
  const sheet = state.sheets.find((item) => item.id === ref.sheetId);
  if (!sheet) return null;
  const sx = (ref.index % sheet.columns) * state.tileSize;
  const sy = Math.floor(ref.index / sheet.columns) * state.tileSize;
  return { sheet, sx, sy };
}

function stampWidth(ref) {
  return ref.width || 1;
}

function stampHeight(ref) {
  return ref.height || 1;
}

function stampFitsSheet(sheet, index, width, height) {
  const x = index % sheet.columns;
  const y = Math.floor(index / sheet.columns);
  return x + width <= sheet.columns && y + height <= sheet.rows;
}

function stampKey(ref) {
  return `${ref.sheetId}:${ref.index}:${stampWidth(ref)}:${stampHeight(ref)}`;
}

// Convert the marked grid cells into one rectangular reusable stamp.
function selectionToStamp() {
  if (!state.selected.size) return null;
  const refs = Array.from(state.selected).map(parseTileKey);
  const sheetId = refs[0].sheetId;
  if (!refs.every((ref) => ref.sheetId === sheetId)) {
    alert("A multi-tile selection must come from the same spritesheet.");
    return null;
  }

  const sheet = state.sheets.find((item) => item.id === sheetId);
  if (!sheet) return null;

  const points = refs.map((ref) => ({
    x: ref.index % sheet.columns,
    y: Math.floor(ref.index / sheet.columns),
  }));
  const minX = Math.min(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxX = Math.max(...points.map((point) => point.x));
  const maxY = Math.max(...points.map((point) => point.y));
  const width = maxX - minX + 1;
  const height = maxY - minY + 1;

  if (refs.length !== width * height) {
    alert("Multi-tile objects must be one connected rectangular selection.");
    return null;
  }

  return {
    sheetId,
    index: minY * sheet.columns + minX,
    width,
    height,
  };
}

function assignedStampsForActiveSheet() {
  const sheet = activeSheet();
  if (!sheet) return [];
  return LAYERS.flatMap((layer) => state.pools[layer].map((ref) => ({ layer, ref })))
    .filter((entry) => entry.ref.sheetId === sheet.id);
}

function selectedKeysForDrawing() {
  const keys = new Set(state.selected);
  if (state.dragPreview) {
    for (const key of state.dragPreview) keys.add(key);
  }
  return keys;
}

function applyCanvasZoom(canvas, zoom) {
  canvas.style.width = `${canvas.width * zoom}px`;
  canvas.style.height = `${canvas.height * zoom}px`;
}

function updateZoomLabel(control) {
  control.value.textContent = `${control.zoom * 100}%`;
}

function bindZoomControl(control) {
  updateZoomLabel(control);
  control.input.addEventListener("input", () => {
    control.zoom = Number(control.input.value);
    updateZoomLabel(control);
    control.redraw();
  });
  control.reset.addEventListener("click", () => {
    control.zoom = 1;
    control.input.value = "1";
    updateZoomLabel(control);
    control.redraw();
  });
}

function eventToSheetCell(event) {
  const sheet = activeSheet();
  if (!sheet) return null;
  const rect = el.sheetCanvas.getBoundingClientRect();
  const x = Math.floor((event.clientX - rect.left) / (rect.width / el.sheetCanvas.width) / state.tileSize);
  const y = Math.floor((event.clientY - rect.top) / (rect.height / el.sheetCanvas.height) / state.tileSize);
  if (x < 0 || y < 0 || x >= sheet.columns || y >= sheet.rows) return null;
  return { x, y, index: y * sheet.columns + x };
}

function keysInRect(sheet, start, end) {
  const minX = Math.min(start.x, end.x);
  const minY = Math.min(start.y, end.y);
  const maxX = Math.max(start.x, end.x);
  const maxY = Math.max(start.y, end.y);
  const keys = [];
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      keys.push(tileKey(sheet.id, y * sheet.columns + x));
    }
  }
  return keys;
}

function gidForRef(ref) {
  let firstgid = 1;
  for (const sheet of state.sheets) {
    if (sheet.id === ref.sheetId) return firstgid + ref.index;
    firstgid += sheet.columns * sheet.rows;
  }
  return 0;
}

function resizeMapCanvas() {
  el.mapCanvas.width = state.width * state.tileSize;
  el.mapCanvas.height = state.height * state.tileSize;
  mapCtx.setTransform(1, 0, 0, 1, 0, 0);
  applyCanvasZoom(el.mapCanvas, state.mapZoom);
}

function drawSheet() {
  const sheet = activeSheet();
  updateZoomLabel(zoomControls.sheet);
  el.sheetEmpty.hidden = Boolean(sheet);
  if (!sheet) {
    el.sheetCanvas.width = 0;
    el.sheetCanvas.height = 0;
    return;
  }

  el.sheetCanvas.width = sheet.columns * state.tileSize;
  el.sheetCanvas.height = sheet.rows * state.tileSize;
  applyCanvasZoom(el.sheetCanvas, state.sheetZoom);
  sheetCtx.clearRect(0, 0, el.sheetCanvas.width, el.sheetCanvas.height);
  sheetCtx.drawImage(sheet.image, 0, 0);
  const selectedForDrawing = selectedKeysForDrawing();

  for (let y = 0; y < sheet.rows; y += 1) {
    for (let x = 0; x < sheet.columns; x += 1) {
      const index = y * sheet.columns + x;
      const xPos = x * state.tileSize;
      const yPos = y * state.tileSize;
      sheetCtx.strokeStyle = "rgba(255,255,255,0.65)";
      sheetCtx.strokeRect(xPos + 0.5, yPos + 0.5, state.tileSize, state.tileSize);
      if (selectedForDrawing.has(tileKey(sheet.id, index))) {
        sheetCtx.fillStyle = "rgba(47, 125, 80, 0.42)";
        sheetCtx.fillRect(xPos, yPos, state.tileSize, state.tileSize);
        sheetCtx.strokeStyle = "#1f5a39";
        sheetCtx.lineWidth = 2;
        sheetCtx.strokeRect(xPos + 1, yPos + 1, state.tileSize - 2, state.tileSize - 2);
        sheetCtx.lineWidth = 1;
      }
    }
  }

  assignedStampsForActiveSheet().forEach(({ layer, ref }) => {
    const x = (ref.index % sheet.columns) * state.tileSize;
    const y = Math.floor(ref.index / sheet.columns) * state.tileSize;
    const width = stampWidth(ref) * state.tileSize;
    const height = stampHeight(ref) * state.tileSize;
    sheetCtx.fillStyle = "rgba(225, 177, 44, 0.24)";
    sheetCtx.fillRect(x, y, width, height);
    sheetCtx.strokeStyle = layer === el.poolSelect.value ? "#e1b12c" : "rgba(157, 77, 43, 0.72)";
    sheetCtx.lineWidth = 3;
    sheetCtx.strokeRect(x + 1.5, y + 1.5, width - 3, height - 3);
    sheetCtx.lineWidth = 1;
  });
}

function drawMap() {
  updateZoomLabel(zoomControls.map);
  resizeMapCanvas();
  mapCtx.clearRect(0, 0, state.width * state.tileSize, state.height * state.tileSize);
  mapCtx.fillStyle = "#dfe7de";
  mapCtx.fillRect(0, 0, state.width * state.tileSize, state.height * state.tileSize);

  const selectedLayer = el.visibleLayer.value;
  for (const layerName of LAYERS) {
    if (selectedLayer !== "all" && selectedLayer !== layerName) continue;
    const layer = state.layers[layerName];
    if (!layer) continue;

    if (layerName === "Interactable") {
      drawObjects(layer.objects);
    } else {
      drawTileLayer(layer.tiles);
    }
  }

  drawGrid();
}

function drawTileLayer(tiles) {
  tiles.forEach((ref, index) => {
    if (!ref) return;
    const tile = tileFromRef(ref);
    if (!tile) return;
    const x = (index % state.width) * state.tileSize;
    const y = Math.floor(index / state.width) * state.tileSize;
    mapCtx.drawImage(tile.sheet.image, tile.sx, tile.sy, state.tileSize, state.tileSize, x, y, state.tileSize, state.tileSize);
  });
}

function drawObjects(objects) {
  objects.forEach((object) => {
    const tile = tileFromRef(object.ref);
    if (!tile) return;
    const width = stampWidth(object.ref) * state.tileSize;
    const height = stampHeight(object.ref) * state.tileSize;
    mapCtx.drawImage(tile.sheet.image, tile.sx, tile.sy, width, height, object.x, object.y, width, height);
    mapCtx.strokeStyle = "#e1b12c";
    mapCtx.lineWidth = 2;
    mapCtx.strokeRect(object.x + 1, object.y + 1, width - 2, height - 2);
    mapCtx.lineWidth = 1;
  });
}

function drawGrid() {
  mapCtx.strokeStyle = "rgba(31,42,36,0.12)";
  for (let x = 0; x <= state.width; x += 1) {
    mapCtx.beginPath();
    mapCtx.moveTo(x * state.tileSize + 0.5, 0);
    mapCtx.lineTo(x * state.tileSize + 0.5, state.height * state.tileSize);
    mapCtx.stroke();
  }
  for (let y = 0; y <= state.height; y += 1) {
    mapCtx.beginPath();
    mapCtx.moveTo(0, y * state.tileSize + 0.5);
    mapCtx.lineTo(state.width * state.tileSize, y * state.tileSize + 0.5);
    mapCtx.stroke();
  }
}

function randomFrom(pool) {
  return pool[Math.floor(Math.random() * pool.length)];
}

// Only object-like layers reserve cells against each other.
function collisionLayerNames(layerName) {
  if (["Buildings", "Decoration", "Interactable"].includes(layerName)) {
    return ["Buildings", "Decoration", "Interactable"].filter((name) => name !== layerName);
  }
  return [];
}

// Buildings, Decoration, and Interactable share collision space.
function blockedCellsFor(layerName) {
  const blocked = new Set();
  for (const otherLayerName of collisionLayerNames(layerName)) {
    const layer = state.layers[otherLayerName];
    if (!layer) continue;

    if (layer.type === "tilelayer") {
      layer.tiles.forEach((ref, index) => {
        if (ref) blocked.add(index);
      });
    }

    if (layer.type === "objectgroup") {
      layer.objects.forEach((object) => {
        const startX = Math.floor(object.x / state.tileSize);
        const startY = Math.floor(object.y / state.tileSize);
        for (let dy = 0; dy < stampHeight(object.ref); dy += 1) {
          for (let dx = 0; dx < stampWidth(object.ref); dx += 1) {
            blocked.add((startY + dy) * state.width + startX + dx);
          }
        }
      });
    }
  }
  return blocked;
}

function canPlaceStamp(tiles, cell, ref, blocked = new Set()) {
  const x = cell % state.width;
  const y = Math.floor(cell / state.width);
  if (x + stampWidth(ref) > state.width || y + stampHeight(ref) > state.height) return false;

  for (let dy = 0; dy < stampHeight(ref); dy += 1) {
    for (let dx = 0; dx < stampWidth(ref); dx += 1) {
      const targetCell = (y + dy) * state.width + x + dx;
      if (blocked.has(targetCell) || tiles[targetCell]) return false;
    }
  }
  return true;
}

function placeStamp(tiles, cell, ref) {
  const x = cell % state.width;
  const y = Math.floor(cell / state.width);
  const tile = tileFromRef(ref);
  if (!tile) return;
  for (let dy = 0; dy < stampHeight(ref); dy += 1) {
    for (let dx = 0; dx < stampWidth(ref); dx += 1) {
      tiles[(y + dy) * state.width + x + dx] = {
        sheetId: ref.sheetId,
        index: ref.index + dy * tile.sheet.columns + dx,
        width: 1,
        height: 1,
      };
    }
  }
}

function generateTileLayer(layerName, density) {
  const pool = state.pools[layerName];
  const tiles = Array.from({ length: state.width * state.height }, () => null);
  const blocked = blockedCellsFor(layerName);
  const target = layerName === "Ground"
    ? state.width * state.height
    : Math.floor(state.width * state.height * density);
  let placedCells = 0;
  let attempts = 0;

  while (placedCells < target && attempts < state.width * state.height * 30) {
    attempts += 1;
    const ref = randomFrom(pool);
    const cell = Math.floor(Math.random() * tiles.length);
    if (!canPlaceStamp(tiles, cell, ref, blocked)) continue;
    placeStamp(tiles, cell, ref);
    placedCells += stampWidth(ref) * stampHeight(ref);
  }

  return tiles;
}

// Interactable objects are exported as Tiled objects, so they track occupied cells separately.
function canPlaceObject(occupied, cell, ref, blocked = new Set()) {
  const x = cell % state.width;
  const y = Math.floor(cell / state.width);
  if (x + stampWidth(ref) > state.width || y + stampHeight(ref) > state.height) return false;

  for (let dy = 0; dy < stampHeight(ref); dy += 1) {
    for (let dx = 0; dx < stampWidth(ref); dx += 1) {
      const targetCell = (y + dy) * state.width + x + dx;
      if (blocked.has(targetCell) || occupied.has(targetCell)) return false;
    }
  }
  return true;
}

function occupyObject(occupied, cell, ref) {
  const x = cell % state.width;
  const y = Math.floor(cell / state.width);
  for (let dy = 0; dy < stampHeight(ref); dy += 1) {
    for (let dx = 0; dx < stampWidth(ref); dx += 1) {
      occupied.add((y + dy) * state.width + x + dx);
    }
  }
}

function generateLayer(layerName, density) {
  const pool = state.pools[layerName];
  if (!pool.length) {
    alert(`The "${layerName}" pool is empty.`);
    return;
  }

  if (layerName === "Interactable") {
    const count = Math.floor(state.width * state.height * density);
    const occupied = new Set();
    const blocked = blockedCellsFor(layerName);
    const objects = [];
    let attempts = 0;
    while (objects.length < count && occupied.size < state.width * state.height && attempts < state.width * state.height * 30) {
      attempts += 1;
      const cell = Math.floor(Math.random() * state.width * state.height);
      const ref = randomFrom(pool);
      if (!canPlaceObject(occupied, cell, ref, blocked)) continue;
      occupyObject(occupied, cell, ref);
      objects.push({
        id: objects.length + 1,
        name: el.objectName.value.trim() || "interactable",
        x: (cell % state.width) * state.tileSize,
        y: Math.floor(cell / state.width) * state.tileSize,
        ref,
        properties: structuredClone(state.properties),
      });
    }
    state.layers[layerName] = { type: "objectgroup", objects };
  } else {
    const tiles = generateTileLayer(layerName, density);
    state.layers[layerName] = { type: "tilelayer", tiles };
  }

  renderAll();
}

function clearLayer(layerName) {
  state.layers[layerName] = null;
  renderAll();
}

function renderSheets() {
  el.sheetList.classList.toggle("empty", state.sheets.length === 0);
  el.sheetList.innerHTML = state.sheets.length
    ? state.sheets.map((sheet) => `
        <div class="sheet-item ${sheet.id === state.activeSheetId ? "active" : ""}" data-sheet="${sheet.id}">
          <strong>${escapeHtml(sheet.name)}</strong><br />
          ${sheet.columns} x ${sheet.rows} Tiles
        </div>
      `).join("")
    : "No sheets loaded yet.";
}

function renderPools() {
  el.poolSummary.innerHTML = LAYERS.map((layer) => `
    <div class="pool-item" data-pool-item="${layer}">
      <div>
        <strong>${layer}</strong><br />
        ${state.pools[layer].length} objects marked
      </div>
      <button class="icon-button danger" data-reset-pool="${layer}" title="Reset ${layer} pool" aria-label="Reset ${layer} pool">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M3 6h18" />
          <path d="M8 6V4h8v2" />
          <path d="M19 6l-1 14H6L5 6" />
          <path d="M10 11v6" />
          <path d="M14 11v6" />
        </svg>
      </button>
    </div>
  `).join("");
}

function renderLayerControls() {
  el.layerControls.innerHTML = LAYERS.map((layer) => {
    const density = layer === "Ground" ? 100 : layer === "Interactable" ? 8 : 20;
    const current = state.layers[layer];
    const detail = current?.type === "objectgroup" ? `${current.objects.length} objects` : current ? `${current.tiles.filter(Boolean).length} tiles` : "not generated";
    return `
      <div class="layer-card">
        <header><span>${layer}</span><small>${detail}</small></header>
        <div class="row">
          <label>Density %
            <input data-density="${layer}" type="number" min="0" max="100" value="${density}" ${layer === "Ground" ? "disabled" : ""} />
          </label>
          <button data-generate="${layer}" class="primary">Generate</button>
        </div>
        <button data-clear-layer="${layer}" class="danger">Remove Layer</button>
      </div>
    `;
  }).join("");
}

function renderProperties() {
  el.propertyList.classList.toggle("empty", state.properties.length === 0);

  el.propertyList.innerHTML = state.properties.length
    ? state.properties.map((property, index) => `
        <div class="property-item">
          <div>
            <strong>${escapeHtml(property.name)}</strong><br />
            <span>${escapeHtml(property.type)} = ${escapeHtml(property.value)}</span>
          </div>

          <button class="icon-button danger" data-remove-property="${index}" title="Remove property" aria-label="Remove property">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M3 6h18" />
              <path d="M8 6V4h8v2" />
              <path d="M19 6l-1 14H6L5 6" />
              <path d="M10 11v6" />
              <path d="M14 11v6" />
            </svg>
          </button>
        </div>
      `).join("")
    : "No properties yet.";
}

function renderAll() {
  renderSheets();
  renderPools();
  renderLayerControls();
  renderProperties();
  drawSheet();
  drawMap();
}

// Create a Tiled-compatible TMX file with CSV tile layers and object groups.
function exportTmx() {
  const mapName = sanitizeName(el.mapName.value || "generated-map");
  const tilesets = [];
  let firstgid = 1;
  for (const sheet of state.sheets) {
    const tileCount = sheet.columns * sheet.rows;
    tilesets.push(`<tileset firstgid="${firstgid}" name="${escapeXml(sheet.name)}" tilewidth="${state.tileSize}" tileheight="${state.tileSize}" tilecount="${tileCount}" columns="${sheet.columns}">
  <image source="${escapeXml(sheet.name)}" width="${sheet.columns * state.tileSize}" height="${sheet.rows * state.tileSize}"/>
</tileset>`);
    firstgid += tileCount;
  }

  const layerXml = LAYERS.map((layerName) => {
    const layer = state.layers[layerName];
    if (!layer) return "";
    if (layer.type === "objectgroup") {
      const objects = layer.objects.map((object) => {
        const props = object.properties.map((property) => `      <property name="${escapeXml(property.name)}" type="${property.type}" value="${escapeXml(property.value)}"/>`).join("\n");
        const width = stampWidth(object.ref) * state.tileSize;
        const height = stampHeight(object.ref) * state.tileSize;
        return `  <object id="${object.id}" name="${escapeXml(object.name)}" gid="${gidForRef(object.ref)}" x="${object.x}" y="${object.y + height}" width="${width}" height="${height}">
    <properties>
${props}
    </properties>
  </object>`;
      }).join("\n");
      return `<objectgroup name="${layerName}">
${objects}
</objectgroup>`;
    }

    const rows = [];
    for (let y = 0; y < state.height; y += 1) {
      const row = layer.tiles.slice(y * state.width, (y + 1) * state.width).map((ref) => ref ? gidForRef(ref) : 0).join(",");
      rows.push(row);
    }
    return `<layer name="${layerName}" width="${state.width}" height="${state.height}">
  <data encoding="csv">
${rows.join(",\n")}
  </data>
</layer>`;
  }).filter(Boolean).join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<map version="1.10" tiledversion="1.10.2" orientation="orthogonal" renderorder="right-down" width="${state.width}" height="${state.height}" tilewidth="${state.tileSize}" tileheight="${state.tileSize}" infinite="0" nextlayerid="99" nextobjectid="999">
${tilesets.join("\n")}
${layerXml}
</map>`;

  el.tmxOutput.value = xml;
  download(`${mapName}.tmx`, xml);
}

function download(filename, text) {
  const blob = new Blob([text], { type: "application/xml" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
}

function escapeXml(value) {
  return escapeHtml(value);
}

function sanitizeName(value) {
  return value.trim().replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "") || "generated-map";
}

async function addSpritesheetFiles(fileList) {
  const files = Array.from(fileList).filter((file) => file.type.startsWith("image/"));
  for (const file of files) {
    const image = new Image();
    image.src = URL.createObjectURL(file);
    await image.decode();
    const sheet = {
      id: crypto.randomUUID(),
      name: file.name,
      image,
      columns: 0,
      rows: 0,
    };
    recalcSheetGrid(sheet);
    state.sheets.push(sheet);
    state.activeSheetId = sheet.id;
  }
  state.selected.clear();
  renderAll();
}

el.sheetUpload.addEventListener("change", async (event) => {
  await addSpritesheetFiles(event.target.files);
  event.target.value = "";
});

el.fileDrop.addEventListener("dragover", (event) => {
  event.preventDefault();
  el.fileDrop.classList.add("drag-over");
});

el.fileDrop.addEventListener("dragleave", () => {
  el.fileDrop.classList.remove("drag-over");
});

el.fileDrop.addEventListener("drop", async (event) => {
  event.preventDefault();
  el.fileDrop.classList.remove("drag-over");
  await addSpritesheetFiles(event.dataTransfer.files);
});

el.sheetList.addEventListener("click", (event) => {
  const item = event.target.closest("[data-sheet]");
  if (!item) return;
  state.activeSheetId = item.dataset.sheet;
  state.selected.clear();
  state.dragStart = null;
  state.dragPreview = null;
  renderAll();
});

el.sheetCanvas.addEventListener("pointerdown", (event) => {
  const sheet = activeSheet();
  if (!sheet) return;
  const cell = eventToSheetCell(event);
  if (!cell) return;
  el.sheetCanvas.setPointerCapture(event.pointerId);
  state.dragStart = cell;
  state.dragPreview = [tileKey(sheet.id, cell.index)];
  drawSheet();
});

el.sheetCanvas.addEventListener("pointermove", (event) => {
  const sheet = activeSheet();
  if (!sheet || !state.dragStart) return;
  const cell = eventToSheetCell(event);
  if (!cell) return;
  state.dragPreview = keysInRect(sheet, state.dragStart, cell);
  drawSheet();
});

el.sheetCanvas.addEventListener("pointerup", (event) => {
  const sheet = activeSheet();
  if (!sheet || !state.dragStart) return;
  const cell = eventToSheetCell(event) || state.dragStart;
  const keys = keysInRect(sheet, state.dragStart, cell);
  const replaceSelection = !event.ctrlKey && !event.metaKey && !event.shiftKey;
  if (replaceSelection) state.selected.clear();
  keys.forEach((key) => state.selected.add(key));
  state.dragStart = null;
  state.dragPreview = null;
  drawSheet();
});

el.sheetCanvas.addEventListener("pointercancel", () => {
  state.dragStart = null;
  state.dragPreview = null;
  drawSheet();
});

el.assignSelected.addEventListener("click", () => {
  const layer = el.poolSelect.value;
  const ref = selectionToStamp();
  if (!ref) return;
  const existing = new Set(state.pools[layer].map(stampKey));
  if (!existing.has(stampKey(ref))) state.pools[layer].push(ref);
  state.selected.clear();
  renderAll();
});

el.resetSelected.addEventListener("click", () => {
  state.selected.clear();
  state.dragStart = null;
  state.dragPreview = null;
  drawSheet();
});

el.poolSummary.addEventListener("click", (event) => {
  const button = event.target.closest("[data-reset-pool]");
  if (!button) return;
  const layer = button.dataset.resetPool;
  state.pools[layer] = [];
  state.layers[layer] = null;
  state.selected.clear();
  renderAll();
});

el.layerControls.addEventListener("click", (event) => {
  const generateButton = event.target.closest("[data-generate]");
  const clearButton = event.target.closest("[data-clear-layer]");
  if (generateButton) {
    const layerName = generateButton.dataset.generate;
    const densityInput = el.layerControls.querySelector(`[data-density="${layerName}"]`);
    generateLayer(layerName, Number(densityInput.value) / 100);
  }
  if (clearButton) clearLayer(clearButton.dataset.clearLayer);
});

el.resizeMap.addEventListener("click", () => {
  const nextTileSize = Number(el.tileSize.value);
  const tileSizeChanged = nextTileSize !== state.tileSize;
  state.mapName = el.mapName.value;
  state.width = Number(el.mapWidth.value);
  state.height = Number(el.mapHeight.value);
  state.tileSize = nextTileSize;
  state.layers = emptyLayerState();
  state.selected.clear();
  state.dragStart = null;
  state.dragPreview = null;

  if (tileSizeChanged) {
    state.sheets.forEach(recalcSheetGrid);
    state.pools = emptyPoolState();
  }

  renderAll();
});

el.clearMap.addEventListener("click", () => {
  state.layers = emptyLayerState();
  renderAll();
});

el.visibleLayer.addEventListener("change", drawMap);
el.poolSelect.addEventListener("change", drawSheet);
el.exportTmx.addEventListener("click", exportTmx);

el.addProperty.addEventListener("click", () => {
  const name = el.propertyName.value.trim();
  if (!name) return;
  state.properties.push({
    name,
    type: el.propertyType.value,
    value: el.propertyValue.value.trim() || (el.propertyType.value === "bool" ? "true" : ""),
  });
  el.propertyName.value = "";
  el.propertyValue.value = "";
  renderProperties();
});

el.propertyList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-property]");
  if (!button) return;
  state.properties.splice(Number(button.dataset.removeProperty), 1);
  renderProperties();
});

window.addEventListener("resize", drawMap);
bindZoomControl(zoomControls.sheet);
bindZoomControl(zoomControls.map);
renderAll();
