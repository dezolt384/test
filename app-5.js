ghost.style.width = `${drag.row.getBoundingClientRect().width}px`;
document.body.appendChild(ghost);
drag.ghost = ghost;
updateBandDragGhost(drag, event);
}

function updateBandDragGhost(drag, event) {
if (!drag.ghost) return;
drag.ghost.style.transform = `translate(${event.clientX + 12}px, ${event.clientY + 12}px)`;
}

function getBandDropPosition(event, row) {
const rect = row.getBoundingClientRect();
return event.clientY > rect.top + rect.height / 2 ? "after" : "before";
}

function clearBandDropTargets() {
document.querySelectorAll(".band-row.is-band-drop-before, .band-row.is-band-drop-after").forEach((row) => {
row.classList.remove("is-band-drop-before", "is-band-drop-after");
});
}

function reorderBand(sourceId, targetId, position = "before") {
if (!sourceId || !targetId || sourceId === targetId) return;

pushHistory();
const next = [...state.bands];
const sourceIndex = next.findIndex((band) => band.id === sourceId);
if (sourceIndex < 0) return;

const [source] = next.splice(sourceIndex, 1);
const targetIndex = next.findIndex((band) => band.id === targetId);
if (targetIndex < 0) return;

const insertIndex = position === "after" ? targetIndex + 1 : targetIndex;
next.splice(insertIndex, 0, source);
state.bands = next;
commitState();
}

function addBand(rawName) {
const title = normalizeBandTitle(rawName);
if (!title) return;
if (state.bandEditId) {
updateBand(state.bandEditId, title, elements.bandColor.value);
} else {
const band = createBand(title, state.bands.length, elements.bandColor.value);
state.bands.push(band);
commitState();
}
elements.bandName.value = "";
elements.bandColor.value = "#eefaf7";
state.bandEditId = "";
renderBandManager();
render();
}

function openBandEditor(bandId) {
const band = getBands().find((entry) => entry.id === bandId);
if (!band) return;
state.bandEditId = band.id;
elements.bandName.value = band.title;
elements.bandColor.value = rgbToHex(band.bg || "#eefaf7");
elements.bandName.focus({ preventScroll: true });
}

function toggleBandArchived(bandId, archived) {
const index = state.bands.findIndex((band) => band.id === bandId);
if (index < 0) return;
if (archived && getActiveBands().length <= 1) return;

pushHistory();
state.bands.splice(index, 1, { ...state.bands[index], archived });
commitState();
}

function getAuthors() {
return Array.isArray(state?.authors) ? state.authors : defaultAuthors;
}

function normalizeBandTitle(value) {
return String(value ?? "").trim().replace(/\s+/g, " ").toUpperCase();
}

function createBand(title, index, colorValue) {
const parts = splitBandTitle(title);
const colors = colorValue
? { bg: colorValue, line: shadeColor(colorValue, -18), ink: shadeColor(colorValue, -46) }
: customBandPalette[index % customBandPalette.length];
return {
id: createBandId(title),
title,
top: parts.top,
bottom: parts.bottom,
chip: toChipLabel(title),
archived: false,
...colors,
};
}

function splitBandTitle(title) {
const apertura = title.match(/^(APERTURA)\s+(.+)$/);
if (apertura) return { top: apertura[1], bottom: apertura[2] };

const words = title.split(" ");
if (words.length === 1) return { top: "", bottom: title };
return { top: words[0], bottom: words.slice(1).join(" ") };
}

function rgbToHex(value) {
const match = String(value ?? "").match(/#([0-9a-fA-F]{6})/);
if (match) return `#${match[1].toLowerCase()}`;
return "#eefaf7";
}

function shadeColor(hex, percent) {
const clean = String(hex || "").replace("#", "");
if (!/^[0-9a-fA-F]{6}$/.test(clean)) return hex;
const num = parseInt(clean, 16);
const amt = Math.round(2.55 * percent);
const r = Math.max(0, Math.min(255, (num >> 16) + amt));
const g = Math.max(0, Math.min(255, ((num >> 8) & 0x00ff) + amt));
const b = Math.max(0, Math.min(255, (num & 0x0000ff) + amt));
return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

function toChipLabel(title) {
return title
.toLocaleLowerCase("it-IT")
.replace(/(^|\s)\p{L}/gu, (letter) => letter.toLocaleUpperCase("it-IT"))
.slice(0, 24);
}

function createBandId(title) {
const base = title
.toLocaleLowerCase("it-IT")
.normalize("NFD")
.replace(/[\u0300-\u036f]/g, "")
.replace(/[^a-z0-9]+/g, "-")
.replace(/^-|-$/g, "")
.slice(0, 28) || "fascia";
let id = base;
let counter = 2;
while (getBands().some((band) => band.id === id)) {
id = `${base}-${counter}`;
counter += 1;
}
return id;
}

function loadAuthors() {
try {
const saved = localStorage.getItem(AUTHOR_STORAGE_KEY);
if (!saved) return normalizeAuthors(defaultAuthors);
return normalizeAuthors(JSON.parse(saved));
} catch {
return normalizeAuthors(defaultAuthors);
}
}

function saveAuthors() {
localStorage.setItem(AUTHOR_STORAGE_KEY, JSON.stringify(state.authors));
}

function normalizeAuthors(authors) {
const normalized = uniqueAuthors(Array.isArray(authors) ? authors : defaultAuthors);
return normalized.sort((a, b) => a.localeCompare(b, "it-IT", { sensitivity: "base" }));
}

function parseTags(value) {
return uniqueAuthors(
String(value ?? "")
.split(",")
.map((tag) => tag.trim())
.filter(Boolean),
);
}

function formatTags(tags) {
return Array.isArray(tags) ? tags.join(", ") : "";
}

function pushHistory() {
state.undoStack.push(snapshotState());
if (state.undoStack.length > 40) state.undoStack.shift();
state.redoStack = [];
updateHistoryButtons();
}

function undo() {
const previous = state.undoStack.pop();
if (!previous) return;
state.redoStack.push(snapshotState());
restoreSnapshot(previous);
}

function redo() {
const next = state.redoStack.pop();
if (!next) return;
state.undoStack.push(snapshotState());
restoreSnapshot(next);
}

function snapshotState() {
return {
items: cloneData(state.items),
bands: cloneData(state.bands),
authors: cloneData(state.authors),
currentWeekStart: state.currentWeekStart.toISOString(),
selectedDate: state.selectedDate,
view: state.view,
status: state.status,
query: state.query,
role: state.role,
};
}

function restoreSnapshot(snapshot) {
state.items = cloneData(snapshot.items);
state.bands = cloneData(snapshot.bands);
state.authors = cloneData(snapshot.authors);
state.bandEditId = "";
state.currentWeekStart = new Date(snapshot.currentWeekStart);
state.selectedDate = snapshot.selectedDate;
state.view = snapshot.view;
state.status = snapshot.status;
state.query = snapshot.query;
const restoredRole = snapshot.role === "coordinator" && isCoordinatorUnlocked() ? "coordinator" : "reader";
applyRole(restoredRole, { renderView: false });
commitState({ skipHistory: true });
}

function cloneData(value) {
return JSON.parse(JSON.stringify(value));
}

function updateHistoryButtons() {
elements.undoButton.disabled = !state.undoStack.length;
elements.redoButton.disabled = !state.redoStack.length;
}

function commitState(options = {}) {
saveItems();
saveBands();
saveAuthors();
if (!options.skipRemote) queueRemoteSave();
renderBandOptions();
renderBandManager();
render();
if (!options.skipHistory) updateHistoryButtons();
}

function loadBands() {
try {
const saved = localStorage.getItem(BAND_STORAGE_KEY);
if (!saved) return defaultBands.map((band) => ({ ...band }));
return normalizeBands(JSON.parse(saved));
} catch {
return defaultBands.map((band) => ({ ...band }));
}
}

function saveBands() {
localStorage.setItem(BAND_STORAGE_KEY, JSON.stringify(state.bands));
}

function normalizeBands(bands) {
const source = Array.isArray(bands) && bands.length ? bands : defaultBands;
const seen = new Set();
const normalized = source.map((band, index) => {
const fallback = defaultBands.find((entry) => entry.id === band.id);
const merged = { ...(fallback || {}), ...band };
const title = normalizeBandTitle(merged.title || merged.bottom || merged.id);
const parts = splitBandTitle(title);
const colors = merged.bg ? merged : customBandPalette[index % customBandPalette.length];
let id = String(
merged.id ||
title
.toLocaleLowerCase("it-IT")
.normalize("NFD")
.replace(/[\u0300-\u036f]/g, "")
.replace(/[^a-z0-9]+/g, "-")
.replace(/^-|-$/g, "")
.slice(0, 28) ||
`fascia-${index + 1}`,
);
if (seen.has(id)) id = `${id}-${index + 1}`;
seen.add(id);
return {
id,
title,
top: merged.top || parts.top,
bottom: merged.bottom || parts.bottom,
chip: merged.chip || toChipLabel(title),
archived: Boolean(merged.archived),
bg: colors.bg,
line: colors.line,
ink: colors.ink,
};
});

return normalized.some((band) => !band.archived)
? normalized
: normalized.map((band, index) => (index === 0 ? { ...band, archived: false } : band));
}

function splitInlineAuthor(value) {
const text = String(value ?? "").trim();
const dashMatch = text.match(/^(.*\S)\s+[-–—]\s+([^-–—]+)$/);
if (dashMatch && looksLikeAuthor(dashMatch[2])) {
return { title: dashMatch[1].trim(), author: normalizeAuthorName(dashMatch[2]) };
}

const parenMatch = text.match(/^(.*\S)\s+\(([^()]+)\)$/);
if (parenMatch && looksLikeAuthor(parenMatch[2])) {
return { title: parenMatch[1].trim(), author: normalizeAuthorName(parenMatch[2]) };
}

return { title: text, author: "" };
}

function looksLikeAuthor(value) {
const text = String(value ?? "").trim();
return Boolean(text && text.length <= 34 && /^[\p{L}\s.'-]+$/u.test(text) && text.split(/\s+/).length <= 4);
}

function normalizeAuthorName(value) {
return String(value ?? "").trim().replace(/\s+/g, " ");
}

function getTitleAuthors(title) {
return uniqueAuthors(
String(title ?? "")
.replace(/\r\n/g, "\n")
.split("\n")
.map((line) => line.trim().replace(/^(?:[-*]|\u2022)\s*/, ""))
.map((line) => splitInlineAuthor(line).author)
.filter(Boolean),
);
}

function getItemAuthors(item) {
const authors = uniqueAuthors([item.author, ...getTitleAuthors(item.title)].filter(Boolean));
return authors.length ? authors : ["Senza autore"];
}

function itemsForAuthor(author) {
const key = normalizeAuthorName(author).toLocaleLowerCase("it-IT");
return state.items.filter((item) =>
getItemAuthors(item).some((itemAuthor) => itemAuthor.toLocaleLowerCase("it-IT") === key),
);
}

function formatMonth(monthKey) {
const [year, month] = monthKey.split("-").map(Number);
return `${monthNames[month - 1]} ${year}`;
}

function uniqueAuthors(authors) {
const seen = new Set();
return authors.reduce((unique, author) => {
const clean = normalizeAuthorName(author);
const key = clean.toLocaleLowerCase("it-IT");
if (!clean || seen.has(key)) return unique;
seen.add(key);
unique.push(clean);
return unique;
}, []);
}

function normalizeItems(items) {
return items.map((item) => {
if (item.live && item.slot === "appuntamento") {
return { ...item, slot: "dirette", appointment: false };
}
return {
...item,
tags: Array.isArray(item.tags) ? item.tags : parseTags(item.tags || ""),
live: Boolean(item.live || item.slot === "dirette"),
appointment: Boolean(item.appointment || item.slot === "appuntamento"),
};
});
}
