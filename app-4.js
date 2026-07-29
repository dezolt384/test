}

function applyRole(role, options = {}) {
state.role = role === "coordinator" ? "coordinator" : "reader";
document.querySelectorAll(".role-button").forEach((button) => {
button.classList.toggle("is-active", button.dataset.role === state.role);
});
elements.body.classList.toggle("reader-mode", state.role === "reader");
if (state.role === "reader") closeEditor();
if (state.role === "reader") closeBandManager();
if (options.renderView !== false) render();
}

function isMobileLayout() {
return window.matchMedia("(max-width: 820px)").matches;
}

function canDragItems() {
return state.role === "coordinator" && !isMobileLayout();
}

function addDays(date, days) {
const copy = new Date(date);
copy.setDate(copy.getDate() + days);
copy.setHours(12, 0, 0, 0);
return copy;
}

function toISO(date) {
return date.toISOString().slice(0, 10);
}

function parseDate(value) {
return new Date(`${value}T12:00:00`);
}

function formatWeekRange(days) {
const first = days[0];
const last = days[6];
const sameMonth = first.getMonth() === last.getMonth();
if (sameMonth) return `${first.getDate()}-${last.getDate()} ${monthNames[first.getMonth()]} ${first.getFullYear()}`;
return `${first.getDate()} ${monthNames[first.getMonth()]} - ${last.getDate()} ${monthNames[last.getMonth()]} ${last.getFullYear()}`;
}

function formatShortDate(date) {
return `${dayNames[(date.getDay() + 6) % 7]} ${date.getDate()} ${monthNames[date.getMonth()].slice(0, 3)}`;
}

function formatFullDate(date) {
return `${dayNames[(date.getDay() + 6) % 7]} ${date.getDate()} ${monthNames[date.getMonth()]} ${date.getFullYear()}`;
}

function capitalize(value) {
return value.slice(0, 1).toUpperCase() + value.slice(1);
}

function escapeHtml(value) {
return String(value ?? "")
.replaceAll("&", "&amp;")
.replaceAll("<", "&lt;")
.replaceAll(">", "&gt;")
.replaceAll('"', "&quot;")
.replaceAll("'", "&#039;");
}

function createId() {
if (crypto.randomUUID) return crypto.randomUUID();
return `c-${Date.now()}`;
}

function toggleActionMenu(button, menu) {
const willOpen = menu.hidden;
closeActionMenus();
menu.hidden = !willOpen;
button.setAttribute("aria-expanded", willOpen ? "true" : "false");
}

function closeActionMenus(target = null) {
if (target?.closest?.(".card-actions")) return;
document.querySelectorAll(".card-action-menu:not([hidden])").forEach((menu) => {
menu.hidden = true;
const button = menu.closest(".card-actions")?.querySelector(".action-menu-button");
button?.setAttribute("aria-expanded", "false");
});
}

function showToast(message) {
if (!elements.toast) return;
elements.toast.textContent = message;
elements.toast.classList.add("is-visible");
window.clearTimeout(state.toastTimer);
state.toastTimer = window.setTimeout(() => {
elements.toast.classList.remove("is-visible");
}, 1800);
}

async function initRemoteState() {
if (!isRemoteConfigured()) return;
try {
const remote = await fetchRemoteState();
if (remote && hasRemoteData(remote)) {
applyRemoteState(remote, { announce: true });
} else {
if (!isCoordinatorUnlocked()) {
state.remoteLoaded = true;
window.setInterval(refreshRemoteState, REMOTE_SYNC_INTERVAL);
return;
}
await saveRemoteState({ immediate: true });
}
state.remoteLoaded = true;
window.setInterval(refreshRemoteState, REMOTE_SYNC_INTERVAL);
} catch (error) {
console.warn("Supabase non disponibile", error);
showToast("Database condiviso non ancora pronto");
}
}

function isRemoteConfigured() {
return Boolean(SUPABASE_REST_URL && SUPABASE_KEY);
}

function remoteHeaders(extra = {}, options = {}) {
const authorization = options.auth ? getValidAuthSession()?.access_token : SUPABASE_KEY;
return {
apikey: SUPABASE_KEY,
Authorization: `Bearer ${authorization || SUPABASE_KEY}`,
"Content-Type": "application/json",
Prefer: "return=representation",
...extra,
};
}

async function fetchRemoteState() {
const response = await fetch(`${SUPABASE_REST_URL}/app_state?id=eq.${encodeURIComponent(REMOTE_STATE_ID)}&select=*`, {
headers: remoteHeaders({ Accept: "application/json" }),
});
if (!response.ok) throw new Error(`Lettura Supabase fallita: ${response.status}`);
const rows = await response.json();
return Array.isArray(rows) ? rows[0] : null;
}

function hasRemoteData(remote) {
return Boolean(
(Array.isArray(remote.items) && remote.items.length) ||
(Array.isArray(remote.bands) && remote.bands.length) ||
(Array.isArray(remote.authors) && remote.authors.length),
);
}

function applyRemoteState(remote, options = {}) {
state.items = normalizeItems(Array.isArray(remote.items) && remote.items.length ? remote.items : state.items);
state.bands = normalizeBands(Array.isArray(remote.bands) && remote.bands.length ? remote.bands : state.bands, state.items);
state.authors = normalizeAuthors(Array.isArray(remote.authors) && remote.authors.length ? remote.authors : state.authors);
state.remoteUpdatedAt = remote.updated_at || "";
saveItems();
saveBands();
saveAuthors();
renderBandOptions();
renderBandManager();
render();
if (options.announce) showToast("Database condiviso collegato");
}

async function refreshRemoteState() {
if (!state.remoteLoaded || state.remoteSaving || !isAllSidePanelsClosed()) return;
try {
const remote = await fetchRemoteState();
if (!remote?.updated_at || remote.updated_at === state.remoteUpdatedAt) return;
applyRemoteState(remote);
} catch (error) {
console.warn("Aggiornamento Supabase fallito", error);
}
}

function queueRemoteSave() {
if (!isRemoteConfigured()) return;
window.clearTimeout(state.remoteSaveTimer);
state.remoteSaveTimer = window.setTimeout(() => saveRemoteState(), 450);
}

async function saveRemoteState(options = {}) {
if (!isRemoteConfigured()) return;
if (!options.immediate && !state.remoteLoaded) return;
if (!isCoordinatorUnlocked()) {
applyRole("reader");
showToast("Accedi come coordinatore per salvare");
return;
}
state.remoteSaving = true;
const payload = {
id: REMOTE_STATE_ID,
items: state.items,
bands: state.bands,
authors: state.authors,
updated_at: new Date().toISOString(),
};
try {
const response = await fetch(`${SUPABASE_REST_URL}/app_state?id=eq.${encodeURIComponent(REMOTE_STATE_ID)}`, {
method: "PATCH",
headers: remoteHeaders({}, { auth: true }),
body: JSON.stringify(payload),
});
if (!response.ok) throw new Error(`Scrittura Supabase fallita: ${response.status}`);
const rows = await response.json();
state.remoteUpdatedAt = rows?.[0]?.updated_at || payload.updated_at;
} catch (error) {
console.warn("Salvataggio Supabase fallito", error);
showToast("Salvataggio condiviso non riuscito");
} finally {
state.remoteSaving = false;
}
}

function loadItems() {
try {
const saved = localStorage.getItem(STORAGE_KEY);
return normalizeItems(saved ? JSON.parse(saved) : initialItems);
} catch {
return normalizeItems(initialItems);
}
}

function saveItems() {
localStorage.setItem(STORAGE_KEY, JSON.stringify(state.items));
}

function getBands() {
return state?.bands?.length ? state.bands : defaultBands;
}

function getManagementWeekStart() {
const currentWeek = startOfWeek(initialDate);
return state.currentWeekStart < currentWeek ? currentWeek : state.currentWeekStart;
}

function isBandActiveOnDate(band, date) {
if (!band || !date) return false;
const iso = typeof date === "string" ? date : toISO(date);
const periods = Array.isArray(band.periods) ? band.periods : [];
const inHistoricalPeriod = periods.some((period) => {
if (!period?.from || !period?.until) return false;
return iso >= period.from && iso <= period.until;
});
if (inHistoricalPeriod) return true;
if (band.retired && periods.length) return false;
if (band.activeFrom && iso < band.activeFrom) return false;
if (band.activeUntil && iso > band.activeUntil) return false;
return true;
}

function getBandsForDate(date) {
return getBands().filter((band) => isBandActiveOnDate(band, date));
}

function getActiveBands(date = toISO(getManagementWeekStart())) {
return getBandsForDate(date);
}

function findBand(id) {
return getBands().find((band) => band.id === id) || null;
}

function getBand(id) {
return findBand(id) || getBands()[0] || defaultBands[0];
}

function getBandIndex(id) {
const index = getBands().findIndex((band) => band.id === id);
return index >= 0 ? index : 999;
}

function applyBandStyle(element, band, index) {
const colors = band.bg ? band : customBandPalette[index % customBandPalette.length];
element.style.setProperty("--slot-bg", colors.bg);
element.style.setProperty("--slot-line", colors.line);
element.style.setProperty("--slot-ink", colors.ink);
}

function applyBandFlags(item, slot) {
const kind = findBand(slot)?.kind || slot;
item.live = kind === "dirette";
item.appointment = kind === "appuntamento";
}

function renderBandOptions() {
const current = elements.itemSlot.value;
const date = elements.itemDate.value || state.selectedDate;
elements.itemSlot.replaceChildren();
const currentBand = findBand(current);
const bands = [...getActiveBands(date)];
const existing = state.items.find((item) => item.id === elements.itemId.value);
const canKeepHistoricalBand = existing && existing.date === date && existing.slot === current;
if (canKeepHistoricalBand && currentBand && !bands.some((band) => band.id === currentBand.id)) bands.push(currentBand);
bands.forEach((band) => {
const option = document.createElement("option");
option.value = band.id;
option.textContent = band.title;
elements.itemSlot.appendChild(option);
});
elements.itemSlot.value = bands.some((band) => band.id === current) ? current : bands[0]?.id || "";
}

function updateBand(bandId, title, color) {
const index = state.bands.findIndex((band) => band.id === bandId);
if (index < 0) return;
const current = state.bands[index];
const effectiveDate = toISO(getManagementWeekStart());
const hasHistoricalItems = state.items.some((item) => item.slot === bandId && item.date < effectiveDate);
const next = { ...current, title };
const parts = splitBandTitle(title);
next.top = parts.top;
next.bottom = parts.bottom;
next.chip = toChipLabel(title);
if (color) {
next.bg = color;
next.line = shadeColor(color, -18);
next.ink = shadeColor(color, -46);
}
if (hasHistoricalItems && isBandActiveOnDate(current, effectiveDate)) {
const historical = {
...current,
activeUntil: toISO(addDays(parseDate(effectiveDate), -1)),
retired: true,
};
const replacement = {
...next,
id: createUniqueBandId(title),
activeFrom: effectiveDate,
retired: false,
};
state.items.forEach((item) => {
if (item.slot === bandId && item.date >= effectiveDate) item.slot = replacement.id;
});
state.bands.splice(index, 1, historical, replacement);
} else {
state.bands.splice(index, 1, next);
}
commitState();
}

function renderBandManager() {
elements.bandList.replaceChildren();
const effectiveWeek = getManagementWeekStart();
const effectiveIso = toISO(effectiveWeek);
const activeBands = getActiveBands(effectiveIso);
elements.bandContext.textContent = `In uso dal ${formatFullDate(effectiveWeek)}`;
elements.bandHistoryNote.textContent = `${getBands().filter((band) => !isBandActiveOnDate(band, effectiveIso)).length} fasce storiche conservate automaticamente`;
renderBandSection("Fasce della settimana", activeBands, true);
renderUnassignedBandWarnings(effectiveIso);
}

function renderUnassignedBandWarnings(effectiveIso) {
const orphaned = state.items.filter((item) => item.date >= effectiveIso && !isBandActiveOnDate(findBand(item.slot), item.date));
const groups = groupBy(orphaned, (item) => item.slot);
const bandIds = Object.keys(groups);
if (!bandIds.length) return;

const section = document.createElement("section");
section.className = "band-section band-warning-section";
section.innerHTML = `<div class="band-section-title"><span>Da ricollocare</span><span>${orphaned.length}</span></div>`;
bandIds.forEach((bandId) => {
const band = findBand(bandId) || { title: bandId || "Fascia non disponibile" };
const row = document.createElement("div");
row.className = "band-row band-warning-row";
row.innerHTML = `<span class="band-marker"></span><div class="band-row-text"><strong>${escapeHtml(band.title)}</strong><small>${groups[bandId].length} contenuti</small></div>`;
const action = document.createElement("button");
action.type = "button";
action.className = "mini-button";
action.textContent = "Ricolloca";
action.addEventListener("click", () => openBandRemoval(bandId, { forceCurrent: true }));
row.appendChild(action);
section.appendChild(row);
});
elements.bandList.appendChild(section);
}

function renderBandSection(title, bands, canReorder) {
if (!bands.length) return;
const section = document.createElement("section");
section.className = "band-section";
section.innerHTML = `<div class="band-section-title"><span>${escapeHtml(title)}</span><span>${bands.length}</span></div>`;
bands.forEach((band, index) => {
const row = document.createElement("div");
row.className = "band-row";
row.dataset.bandId = band.id;
applyBandStyle(row, band, index);
if (canReorder) row.addEventListener("pointerdown", (event) => startBandPointerDrag(event, band.id, row));

const marker = document.createElement("span");
marker.className = "band-marker";

const text = document.createElement("div");
text.className = "band-row-text";
text.innerHTML = `<strong>${escapeHtml(band.title)}</strong>`;

const toggle = document.createElement("button");
toggle.type = "button";
toggle.className = "mini-button";
toggle.textContent = "Rimuovi";
toggle.addEventListener("click", () => openBandRemoval(band.id));

const edit = document.createElement("button");
edit.type = "button";
edit.className = "mini-button";
edit.textContent = "Modifica";
edit.addEventListener("click", () => openBandEditor(band.id));

row.append(marker, text, edit, toggle);
section.appendChild(row);
});
elements.bandList.appendChild(section);
}

function startBandPointerDrag(event, bandId, row) {
if (state.role !== "coordinator") return;
if (isMobileLayout()) return;
if (event.button !== undefined && event.button !== 0) return;
if (event.target.closest("button, input, select, textarea, label")) return;

state.bandPointerDrag = {
bandId,
row,
startX: event.clientX,
startY: event.clientY,
active: false,
overRow: null,
dropPosition: "before",
ghost: null,
};

document.addEventListener("pointermove", handleBandPointerDragMove);
document.addEventListener("pointerup", finishBandPointerDrag);
document.addEventListener("pointercancel", finishBandPointerDrag);
}

function handleBandPointerDragMove(event) {
const drag = state.bandPointerDrag;
if (!drag) return;

const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
if (!drag.active && distance < 6) return;

if (!drag.active) {
drag.active = true;
state.draggedBandId = drag.bandId;
elements.body.classList.add("is-dragging-band");
drag.row.classList.add("is-band-dragging");
createBandDragGhost(drag, event);
}

event.preventDefault();
updateBandDragGhost(drag, event);
const hovered = document.elementFromPoint(event.clientX, event.clientY);
const target = hovered?.closest(".band-row");
clearBandDropTargets();

if (target && target.dataset.bandId && target.dataset.bandId !== drag.bandId) {
drag.overRow = target;
drag.dropPosition = getBandDropPosition(event, target);
target.classList.add(`is-band-drop-${drag.dropPosition}`);
} else {
drag.overRow = null;
}
}

function finishBandPointerDrag(event) {
document.removeEventListener("pointermove", handleBandPointerDragMove);
document.removeEventListener("pointerup", finishBandPointerDrag);
document.removeEventListener("pointercancel", finishBandPointerDrag);

const drag = state.bandPointerDrag;
state.bandPointerDrag = null;
state.draggedBandId = "";
elements.body.classList.remove("is-dragging-band");
clearBandDropTargets();

if (!drag) return;
drag.row.classList.remove("is-band-dragging");
drag.ghost?.remove();

if (drag.active && event.type === "pointerup" && drag.overRow) {
reorderBand(drag.bandId, drag.overRow.dataset.bandId, drag.dropPosition);
}
}

function createBandDragGhost(drag, event) {
const ghost = drag.row.cloneNode(true);
ghost.classList.add("drag-ghost", "band-drag-ghost");
