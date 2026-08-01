// Hot path: keep daily work small and load historical data only when requested.
var HOT_WINDOW_DAYS = 28;
var HOT_PAGE_SIZE = 60;
var HOT_SEARCH_DELAY = 180;
var ACTIVE_DATA_YEAR = initialDate.getFullYear();
var ACTIVE_DATA_START = `${ACTIVE_DATA_YEAR}-01-01`;
var CONTENT_SELECT_FIELDS = [
"id",
"title",
"content_date",
"slot",
"author",
"status",
"tags",
"live",
"appointment",
"sort_order",
"version",
"updated_at",
"updated_by_email",
"deleted_at",
"deleted_by_email",
].join(",");

function ensureHotPathState() {
if (!state.loadedRanges) state.loadedRanges = [];
if (!state.availableYears) state.availableYears = [];
if (!state.pendingRemoteItemIds) state.pendingRemoteItemIds = new Set();
if (!state.archiveCache) state.archiveCache = new Map();
if (!state.searchState) state.searchState = null;
if (!state.pendingHistory) state.pendingHistory = null;
if (typeof state.remoteConfigDirty !== "boolean") state.remoteConfigDirty = false;
if (typeof state.fullArchiveLoaded !== "boolean") state.fullArchiveLoaded = false;
if (typeof state.fullArchiveLoading !== "boolean") state.fullArchiveLoading = false;
if (!Number.isFinite(state.lastRemoteRefreshAt)) state.lastRemoteRefreshAt = 0;
}

function loadItems() {
try {
const saved = localStorage.getItem("redazione-dashboard-operational-v1");
return normalizeItems(saved ? JSON.parse(saved) : initialItems);
} catch {
return normalizeItems(initialItems);
}
}

function saveItems() {
ensureHotPathState();
const todayStart = startOfWeek(initialDate);
const from = toISO(addDays(todayStart, -HOT_WINDOW_DAYS));
const to = toISO(addDays(todayStart, HOT_WINDOW_DAYS + 6));
const cached = state.items.filter((item) => item.date >= from && item.date <= to);
try {
localStorage.setItem("redazione-dashboard-operational-v1", JSON.stringify(cached));
localStorage.removeItem("redazione-dashboard-v3");
} catch (error) {
console.warn("Cache locale non aggiornata", error);
}
}

function getOperationalRange(date = state.currentWeekStart) {
const weekStart = startOfWeek(date instanceof Date ? date : parseDate(date));
return {
from: toISO(addDays(weekStart, -HOT_WINDOW_DAYS)),
to: toISO(addDays(weekStart, HOT_WINDOW_DAYS + 6)),
};
}

function addLoadedRange(from, to) {
ensureHotPathState();
const ranges = [...state.loadedRanges, { from, to }].sort((a, b) => a.from.localeCompare(b.from));
state.loadedRanges = ranges.reduce((merged, range) => {
const last = merged[merged.length - 1];
if (!last || range.from > toISO(addDays(parseDate(last.to), 1))) {
merged.push({ ...range });
return merged;
}
if (range.to > last.to) last.to = range.to;
return merged;
}, []);
}

function isRangeLoaded(from, to) {
ensureHotPathState();
return state.loadedRanges.some((range) => range.from <= from && range.to >= to);
}

function isLoadedDate(date) {
return isRangeLoaded(date, date);
}

function buildContentsUrl({ from = "", to = "", order = "content_date.asc,slot.asc,sort_order.asc,id.asc" } = {}) {
const url = new URL(`${SUPABASE_REST_URL}/contents`);
url.searchParams.set("select", CONTENT_SELECT_FIELDS);
url.searchParams.set("deleted_at", "is.null");
url.searchParams.set("content_date", `gte.${from || ACTIVE_DATA_START}`);
if (to) url.searchParams.append("content_date", `lte.${to}`);
url.searchParams.set("order", order);
return url;
}

async function fetchRowsPage(url, headers, offset = 0, limit = CONTENT_PAGE_SIZE, count = false) {
const response = await fetch(url, {
headers: {
...headers,
Range: `${offset}-${offset + limit - 1}`,
...(count ? { Prefer: "count=exact" } : {}),
},
});
if ([404, 406].includes(response.status)) {
const error = new Error("Schema concorrente non ancora attivo");
error.concurrentUnavailable = true;
throw error;
}
if (!response.ok) throw new Error(`Lettura contenuti fallita: ${response.status}`);
const rows = await response.json();
if (!Array.isArray(rows)) throw new Error("Risposta contenuti non valida");
const match = (response.headers.get("content-range") || "").match(/\/(\d+|\*)$/);
return {
rows,
total: match && match[1] !== "*" ? Number(match[1]) : null,
};
}

async function fetchContentRowsRange(headers, from, to) {
const url = buildContentsUrl({ from, to });
const first = await fetchRowsPage(url, headers, 0, CONTENT_PAGE_SIZE, true);
if (!Number.isFinite(first.total) || first.total <= first.rows.length) return first.rows;
const offsets = [];
for (let offset = CONTENT_PAGE_SIZE; offset < first.total; offset += CONTENT_PAGE_SIZE) offsets.push(offset);
const pages = await Promise.all(offsets.map((offset) => fetchRowsPage(url, headers, offset)));
return [first.rows, ...pages.map((page) => page.rows)].flat();
}

async function fetchRecentDeletedRows(headers) {
const cutoff = new Date(Date.now() - COLLAB_TRASH_DAYS * 86400000).toISOString();
const url = new URL(`${SUPABASE_REST_URL}/contents`);
url.searchParams.set("select", CONTENT_SELECT_FIELDS);
url.searchParams.set("deleted_at", "not.is.null");
url.searchParams.append("deleted_at", `gte.${cutoff}`);
url.searchParams.set("content_date", `gte.${ACTIVE_DATA_START}`);
url.searchParams.set("order", "deleted_at.desc");
return (await fetchRowsPage(url, headers, 0, 250)).rows;
}

async function fetchConcurrentState() {
ensureHotPathState();
const options = { auth: Boolean(getValidAuthSession()?.access_token) };
const headers = remoteHeaders({ Accept: "application/json" }, options);
const range = getOperationalRange(state.currentWeekStart);
const [configResponse, activeRows, deletedRows] = await Promise.all([
fetch(`${SUPABASE_REST_URL}/app_config?id=eq.${encodeURIComponent(REMOTE_STATE_ID)}&select=*`, { headers }),
fetchContentRowsRange(headers, range.from, range.to),
fetchRecentDeletedRows(headers),
]);
if ([404, 406].includes(configResponse.status)) {
const error = new Error("Schema concorrente non ancora attivo");
error.concurrentUnavailable = true;
throw error;
}
if (!configResponse.ok) throw new Error(`Lettura condivisa fallita: ${configResponse.status}`);
const configs = await configResponse.json();
return {
_mode: "rows",
config: Array.isArray(configs) ? configs[0] : null,
rows: [...activeRows, ...deletedRows],
range,
years: [ACTIVE_DATA_YEAR],
};
}

function mergeConcurrentRows(rows, range = null, options = {}) {
ensureHotPathState();
const pendingIds = state.pendingRemoteItemIds;
const remoteItems = rows.map(rowToItem);
const activeItems = remoteItems.filter((item) => !item._deletedAt);
const remoteIds = new Set(activeItems.map((item) => item.id));

if (range) {
state.items = state.items.filter((item) => {
if (item.date < range.from || item.date > range.to) return true;
if (pendingIds.has(item.id)) return true;
return remoteIds.has(item.id) && !activeItems.some((entry) => entry.id === item.id);
});
}

const localById = new Map(state.items.map((item) => [item.id, item]));
activeItems.forEach((item) => {
if (pendingIds.has(item.id)) return;
const current = localById.get(item.id);
if (current) Object.assign(current, item);
else {
state.items.push(item);
localById.set(item.id, item);
}
});

remoteItems.forEach((item) => {
if (!pendingIds.has(item.id)) state.remoteItemSnapshots.set(item.id, item);
});
const deleted = remoteItems.filter((item) => item._deletedAt);
if (deleted.length || options.replaceDeleted) {
const deletedById = new Map(state.deletedItems.map((item) => [item.id, item]));
deleted.forEach((item) => deletedById.set(item.id, item));
state.deletedItems = [...deletedById.values()];
}
if (range) addLoadedRange(range.from, range.to);
}

function applyConcurrentState(remote, options = {}) {
ensureCollaborationState();
ensureHotPathState();
if (options.initial || !state.remoteLoaded) {
state.remoteItemSnapshots = new Map();
state.deletedItems = [];
state.loadedRanges = [];
}
mergeConcurrentRows(Array.isArray(remote.rows) ? remote.rows : [], remote.range || null, {
replaceDeleted: options.initial || !state.remoteLoaded,
});

if (remote.config) {
state.bands = normalizeBands(
Array.isArray(remote.config.bands) && remote.config.bands.length ? remote.config.bands : state.bands,
state.items,
);
state.authors = normalizeAuthors(
Array.isArray(remote.config.authors) && remote.config.authors.length ? remote.config.authors : state.authors,
);
state.remoteConfigSnapshot = cloneData(remote.config);
}
if (Array.isArray(remote.years) && remote.years.length) state.availableYears = remote.years;

state.remoteUpdatedAt = remote.config?.updated_at || state.remoteUpdatedAt || "";
state.lastRemoteRefreshAt = Date.now();
state.remoteDirty = state.pendingRemoteItemIds.size > 0 || state.remoteConfigDirty;
invalidateItemIndexes();
saveItems();
saveBands();
saveAuthors();
renderBandOptions();
renderBandManager();
render();
renderPresenceNotice();
if (options.announce) showToast("Collaborazione in tempo reale attiva");
}

async function initRemoteState() {
if (!isRemoteConfigured()) return;
ensureCollaborationState();
ensureHotPathState();
setSyncStatus("loading", "Collegamento...");
try {
await ensureCoordinatorSession();
const remote = await fetchConcurrentState();
state.remoteMode = "rows";
applyConcurrentState(remote, { announce: true, initial: true });
state.remoteLoaded = true;
setSyncStatus("online", "Aggiornato");
startRealtimeCollaboration();
startEfficientRefreshSchedule();
} catch (error) {
if (error.concurrentUnavailable) {
await initLegacyRemoteState();
return;
}
console.warn("Supabase non disponibile", error);
setSyncStatus("offline", "Non collegato");
showToast("Database condiviso non disponibile");
}
}

function refreshRemoteStateWhenVisible(force = false) {
if (document.visibilityState !== "visible") return;
ensureHotPathState();
const stale = Date.now() - state.lastRemoteRefreshAt >= COLLAB_STALE_REFRESH_INTERVAL;
if (!force && !stale) return;
refreshRemoteState();
}

function startEfficientRefreshSchedule() {
ensureHotPathState();
if (state.fullRefreshTimer) window.clearInterval(state.fullRefreshTimer);
state.fullRefreshTimer = window.setInterval(
() => refreshRemoteStateWhenVisible(true),
COLLAB_FULL_REFRESH_INTERVAL,
);
if (state.efficientRefreshBound) return;
state.efficientRefreshBound = true;
window.addEventListener("focus", () => refreshRemoteStateWhenVisible());
document.addEventListener("visibilitychange", () => refreshRemoteStateWhenVisible());
}

async function ensureContentRangeLoaded(from, to) {
ensureHotPathState();
if (state.remoteMode !== "rows" || isRangeLoaded(from, to)) return;
if (state.remoteDirty) await saveRemoteState({ immediate: true });
const options = { auth: Boolean(getValidAuthSession()?.access_token) };
const headers = remoteHeaders({ Accept: "application/json" }, options);
const rows = await fetchContentRowsRange(headers, from, to);
mergeConcurrentRows(rows, { from, to });
invalidateItemIndexes();
saveItems();
}

async function ensureOperationalWindow(date) {
const range = getOperationalRange(date);
await ensureContentRangeLoaded(range.from, range.to);
}

function showNavigationLoading() {
elements.contentView.innerHTML = '<div class="empty-state">Caricamento settimana...</div>';
}

async function changeWeek(delta) {
state.currentWeekStart = addDays(state.currentWeekStart, delta);
state.selectedDate = toISO(state.currentWeekStart);
const weekFrom = toISO(state.currentWeekStart);
const weekTo = toISO(addDays(state.currentWeekStart, 6));
if (state.remoteMode !== "rows" || isRangeLoaded(weekFrom, weekTo)) {
render();
return;
}
render();
showNavigationLoading();
try {
await ensureOperationalWindow(state.currentWeekStart);
render();
} catch (error) {
console.warn("Settimana non caricata", error);
renderEmpty("Impossibile caricare la settimana");
}
}

async function changeSelectedDay(delta) {
const nextDate = addDays(parseDate(state.selectedDate), delta);
state.selectedDate = toISO(nextDate);
state.currentWeekStart = startOfWeek(nextDate);
state.view = "day";
document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("is-active", tab.dataset.view === "day"));
if (state.remoteMode !== "rows" || isLoadedDate(state.selectedDate)) {
render();
return;
}
render();
showNavigationLoading();
await ensureOperationalWindow(nextDate);
render();
}

async function goToday(view = state.view) {
const today = new Date();
today.setHours(12, 0, 0, 0);
state.currentWeekStart = startOfWeek(today);
state.selectedDate = toISO(today);
state.view = view || "week";
state.query = "";
state.searchState = null;
state.authorDetail = "";
elements.searchInput.value = "";
closeEditor();
closeBandManager();
document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("is-active", tab.dataset.view === state.view));
if (state.remoteMode === "rows" && !isLoadedDate(state.selectedDate)) {
showNavigationLoading();
await ensureOperationalWindow(today);
}
render();
}

async function fetchFirstItemForYear(year) {
const headers = remoteHeaders(
{ Accept: "application/json" },
{ auth: Boolean(getValidAuthSession()?.access_token) },
);
const url = buildContentsUrl({
from: `${year}-01-01`,
to: `${year}-12-31`,
order: "content_date.asc,slot.asc,sort_order.asc,id.asc",
});
return (await fetchRowsPage(url, headers, 0, 1)).rows[0] || null;
}

async function jumpToYear(year) {
let firstItem = state.items
.filter((item) => item.date.startsWith(`${year}-`))
.sort(compareItems)[0];
if (!firstItem && state.remoteMode === "rows") {
showNavigationLoading();
const row = await fetchFirstItemForYear(year);
if (!row) return;
firstItem = rowToItem(row);
}
if (!firstItem) return;
const date = parseDate(firstItem.date);
state.currentWeekStart = startOfWeek(date);
state.selectedDate = firstItem.date;
state.view = "week";
state.query = "";
state.searchState = null;
state.authorDetail = "";
elements.searchInput.value = "";
document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("is-active", tab.dataset.view === "week"));
await ensureOperationalWindow(date);
render();
}

async function fetchAllContentRows(headers) {
const url = buildContentsUrl();
const first = await fetchRowsPage(url, headers, 0, CONTENT_PAGE_SIZE, true);
if (!Number.isFinite(first.total) || first.total <= first.rows.length) return first.rows;
const offsets = [];
for (let offset = CONTENT_PAGE_SIZE; offset < first.total; offset += CONTENT_PAGE_SIZE) offsets.push(offset);
const pages = await Promise.all(offsets.map((offset) => fetchRowsPage(url, headers, offset)));
return [first.rows, ...pages.map((page) => page.rows)].flat();
}

async function ensureFullArchiveLoaded() {
ensureHotPathState();
if (state.remoteMode !== "rows" || state.fullArchiveLoaded || state.fullArchiveLoading) return;
state.fullArchiveLoading = true;
setSyncStatus("loading", "Caricamento archivio...");
try {
const headers = remoteHeaders(
{ Accept: "application/json" },
{ auth: Boolean(getValidAuthSession()?.access_token) },
);
const rows = await fetchAllContentRows(headers);
mergeConcurrentRows(rows);
state.fullArchiveLoaded = true;
invalidateItemIndexes();
setSyncStatus("online", "Archivio pronto");
} finally {
state.fullArchiveLoading = false;
}
}

async function openBandManager() {
if (state.role === "reader") return;
elements.editorPanel.classList.add("is-hidden");
elements.bandPanel.classList.remove("is-hidden");
elements.body.classList.add("editor-open");
elements.bandList.innerHTML = '<div class="empty-state compact-empty">Preparazione archivio fasce...</div>';
await ensureFullArchiveLoaded();
renderBandManager();
elements.bandName.focus({ preventScroll: true });
}

function normalizeArchiveQuery(value) {
return String(value || "")
.trim()
.toLocaleLowerCase("it-IT")
.replace(/[,*(){}%_]/g, " ")
.replace(/\s+/g, " ");
}

function scheduleArchiveSearch(value, immediate = false) {
ensureHotPathState();
const query = normalizeArchiveQuery(value);
state.query = query;
window.clearTimeout(state.searchDebounceTimer);
if (!query) {
state.searchState = null;
invalidateItemIndexes();
render();
return;
}
state.searchState = { query, items: [], total: 0, loading: true, offset: 0 };
invalidateItemIndexes();
render();
state.searchDebounceTimer = window.setTimeout(() => loadSearchPage(true), immediate ? 0 : HOT_SEARCH_DELAY);
}

async function loadSearchPage(reset = false) {
ensureHotPathState();
const query = state.query;
if (!query) return;
const requestQuery = query;
const current = reset || state.searchState?.query !== query
? { query, items: [], total: 0, loading: true, offset: 0 }
: state.searchState;
if (current.loading && !reset && current.items.length) return;
current.loading = true;
state.searchState = current;
render();

try {
if (state.remoteMode !== "rows") {
const items = state.items.filter((item) => {
const searchable = [item.title, item.author, ...getTitleAuthors(item.title), ...(item.tags || [])]
.join(" ")
.toLocaleLowerCase("it-IT");
return searchable.includes(query);
});
state.searchState = { query, items, total: items.length, loading: false, offset: items.length };
invalidateItemIndexes();
render();
return;
}

const url = new URL(`${SUPABASE_REST_URL}/contents`);
url.searchParams.set("select", CONTENT_SELECT_FIELDS);
url.searchParams.set("deleted_at", "is.null");
url.searchParams.set("content_date", `gte.${ACTIVE_DATA_START}`);
url.searchParams.set("or", `(title.ilike.*${query}*,author.ilike.*${query}*)`);
url.searchParams.set("order", "content_date.desc,slot.asc,sort_order.asc,id.asc");
const headers = remoteHeaders(
{ Accept: "application/json" },
{ auth: Boolean(getValidAuthSession()?.access_token) },
);
const page = await fetchRowsPage(url, headers, reset ? 0 : current.offset, HOT_PAGE_SIZE, true);
if (state.query !== requestQuery) return;
const nextItems = page.rows.map(rowToItem);
mergeConcurrentRows(page.rows);
const byId = new Map((reset ? [] : current.items).map((item) => [item.id, item]));
nextItems.forEach((item) => byId.set(item.id, item));
state.searchState = {
query,
items: [...byId.values()],
total: Number.isFinite(page.total) ? page.total : byId.size,
loading: false,
offset: (reset ? 0 : current.offset) + page.rows.length,
};
invalidateItemIndexes();
render();
} catch (error) {
console.warn("Ricerca archivio fallita", error);
if (state.searchState?.query === requestQuery) {
state.searchState.loading = false;
state.searchState.error = true;
render();
}
}
}

function filteredItems() {
ensureHotPathState();
if (!state.query) return state.items;
if (state.searchState?.query === state.query) return state.searchState.items;
return [];
}

function renderSearchResults() {
ensureHotPathState();
const search = state.searchState;
if (!search || search.query !== state.query || (search.loading && !search.items.length)) {
renderEmpty("Ricerca nell'archivio...");
return;
}
if (search.error && !search.items.length) {
renderEmpty("Ricerca non disponibile");
return;
}
const items = [...search.items].sort((a, b) => b.date.localeCompare(a.date) || compareItems(a, b));
if (!items.length) {
renderEmpty("Nessun risultato");
return;
}

const wrapper = document.createElement("div");
wrapper.className = "group-view";
const header = document.createElement("div");
header.className = "archive-header";
header.innerHTML = `<div><span>Ricerca archivio</span><strong>${escapeHtml(state.query)}</strong></div><em>${search.total} risultati</em>`;
wrapper.appendChild(header);
const groups = groupBy(items, (item) => item.date);
Object.keys(groups).sort().reverse().forEach((date) => {
const block = document.createElement("section");
block.className = "group-block";
block.innerHTML = `<div class="group-header"><span>${escapeHtml(formatFullDate(parseDate(date)))}</span><span>${groups[date].length}</span></div>`;
const list = document.createElement("div");
list.className = "group-items";
groups[date].sort(compareItems).forEach((item) => list.appendChild(createCard(item)));
block.appendChild(list);
wrapper.appendChild(block);
});
if (search.items.length < search.total) {
const loadMore = document.createElement("button");
loadMore.type = "button";
loadMore.className = "secondary-button archive-load-more";
loadMore.disabled = search.loading;
loadMore.textContent = search.loading ? "Caricamento..." : `Carica altri · ${search.total - search.items.length} rimanenti`;
loadMore.addEventListener("click", () => loadSearchPage(false));
wrapper.appendChild(loadMore);
}
elements.contentView.innerHTML = "";
elements.contentView.appendChild(wrapper);
}

function getArchiveSpec(view) {
if (view === "live") return { title: "Dirette", predicate: isLiveItem, filter: "(live.eq.true,slot.eq.dirette)" };
if (view === "appointments") {
return { title: "Appuntamenti", predicate: isAppointmentItem, filter: "(appointment.eq.true,slot.eq.appuntamento)" };
}
return {
title: "Riunioni",
predicate: isMeetingItem,
filter: "(slot.eq.riunioni)",
};
}

async function loadContentArchivePage(view, reset = false) {
ensureHotPathState();
const spec = getArchiveSpec(view);
const current = reset || !state.archiveCache.has(view)
? { items: [], total: 0, offset: 0, loading: true }
: state.archiveCache.get(view);
if (current.loading && !reset && current.items.length) return;
current.loading = true;
state.archiveCache.set(view, current);
if (state.view === view) render();
try {
if (view === "meetings") {
await ensureFullArchiveLoaded();
const allMeetings = state.items
.filter(spec.predicate)
.sort((a, b) => b.date.localeCompare(a.date) || compareItems(a, b));
const offset = reset ? 0 : current.offset;
const nextItems = allMeetings.slice(offset, offset + HOT_PAGE_SIZE);
const byId = new Map((reset ? [] : current.items).map((item) => [item.id, item]));
nextItems.forEach((item) => byId.set(item.id, item));
state.archiveCache.set(view, {
items: [...byId.values()],
total: allMeetings.length,
offset: offset + nextItems.length,
loading: false,
});
if (state.view === view) render();
return;
}
const url = new URL(`${SUPABASE_REST_URL}/contents`);
url.searchParams.set("select", CONTENT_SELECT_FIELDS);
url.searchParams.set("deleted_at", "is.null");
url.searchParams.set("content_date", `gte.${ACTIVE_DATA_START}`);
url.searchParams.set("or", spec.filter);
url.searchParams.set("order", "content_date.desc,sort_order.asc,id.asc");
const headers = remoteHeaders(
{ Accept: "application/json" },
{ auth: Boolean(getValidAuthSession()?.access_token) },
);
const page = await fetchRowsPage(url, headers, reset ? 0 : current.offset, HOT_PAGE_SIZE, true);
const nextItems = page.rows.map(rowToItem);
mergeConcurrentRows(page.rows);
const byId = new Map((reset ? [] : current.items).map((item) => [item.id, item]));
nextItems.forEach((item) => byId.set(item.id, item));
state.archiveCache.set(view, {
items: [...byId.values()],
total: Number.isFinite(page.total) ? page.total : byId.size,
offset: (reset ? 0 : current.offset) + page.rows.length,
loading: false,
});
invalidateItemIndexes();
if (state.view === view) render();
} catch (error) {
console.warn(`Archivio ${view} non disponibile`, error);
current.loading = false;
current.error = true;
state.archiveCache.set(view, current);
if (state.view === view) render();
}
}

function renderContentArchive(title, predicate) {
ensureHotPathState();
if (state.remoteMode !== "rows") {
renderLocalContentArchive(title, predicate);
return;
}
const view = state.view;
const cache = state.archiveCache.get(view);
if (!cache) {
state.archiveCache.set(view, { items: [], total: 0, offset: 0, loading: true });
loadContentArchivePage(view, true);
renderEmpty("Caricamento archivio...");
return;
}
if (cache.loading && !cache.items.length) {
renderEmpty("Caricamento archivio...");
return;
}
if (cache.error && !cache.items.length) {
renderEmpty("Archivio non disponibile");
return;
}

const weekSet = new Set(getWeekDays().map((day) => toISO(day)));
const weekCount = getRenderItemsForDates([...weekSet]).filter(predicate).length;
const items = [...cache.items].sort((a, b) => b.date.localeCompare(a.date) || compareItems(a, b));
const wrapper = document.createElement("div");
wrapper.className = "group-view content-archive";
const header = document.createElement("div");
header.className = "archive-header content-archive-header";
header.innerHTML = `
<div><span>Archivio contenuti</span><strong>${escapeHtml(title)}</strong></div>
<div class="content-archive-week"><strong>${weekCount}</strong><span>questa settimana</span></div>
<em>${cache.total} totali</em>
`;
wrapper.appendChild(header);
if (!items.length) {
const empty = document.createElement("div");
empty.className = "empty-state";
empty.textContent = "Nessun contenuto in questa vista";
wrapper.appendChild(empty);
} else {
const groups = groupBy(items, (item) => item.date.slice(0, 7));
Object.keys(groups).sort().reverse().forEach((monthKey) => {
const block = document.createElement("section");
block.className = "group-block";
block.innerHTML = `<div class="group-header"><span>${escapeHtml(formatMonth(monthKey))}</span><span>${groups[monthKey].length}</span></div>`;
const list = document.createElement("div");
list.className = "group-items";
groups[monthKey].forEach((item) => list.appendChild(createCard(item, { showDate: true })));
block.appendChild(list);
wrapper.appendChild(block);
});
}
if (cache.items.length < cache.total) {
const loadMore = document.createElement("button");
loadMore.type = "button";
loadMore.className = "secondary-button archive-load-more";
loadMore.disabled = cache.loading;
loadMore.textContent = cache.loading ? "Caricamento..." : `Carica altri · ${cache.total - cache.items.length} rimanenti`;
loadMore.addEventListener("click", () => loadContentArchivePage(view));
wrapper.appendChild(loadMore);
}
elements.contentView.innerHTML = "";
elements.contentView.appendChild(wrapper);
}

function renderLocalContentArchive(title, predicate) {
const items = currentRenderItems
.filter(predicate)
.sort((a, b) => b.date.localeCompare(a.date) || compareItems(a, b));
const weekSet = new Set(getWeekDays().map((day) => toISO(day)));
const wrapper = document.createElement("div");
wrapper.className = "group-view content-archive";
wrapper.innerHTML = `
<div class="archive-header content-archive-header">
  <div><span>Archivio contenuti</span><strong>${escapeHtml(title)}</strong></div>
  <div class="content-archive-week"><strong>${items.filter((item) => weekSet.has(item.date)).length}</strong><span>questa settimana</span></div>
  <em>${items.length} totali</em>
</div>
`;
items.slice(0, HOT_PAGE_SIZE).forEach((item) => wrapper.appendChild(createCard(item, { showDate: true })));
elements.contentView.innerHTML = "";
elements.contentView.appendChild(wrapper);
}

function pushHistory(options = {}) {
ensureHotPathState();
if (state.pendingHistory) return;
const itemIds = [...new Set(Array.isArray(options.itemIds) ? options.itemIds : [])];
state.pendingHistory = {
items: new Map(itemIds.map((id) => {
const item = state.items.find((entry) => entry.id === id);
return [id, item ? cloneData(item) : null];
})),
bands: options.config ? cloneData(state.bands) : null,
authors: options.config ? cloneData(state.authors) : null,
};
}

function finalizeHistoryTransaction() {
ensureHotPathState();
const pending = state.pendingHistory;
state.pendingHistory = null;
if (!pending) return null;
const after = new Map(state.items.map((item) => [item.id, item]));
const ids = new Set(pending.items.keys());
const itemChanges = [];
ids.forEach((id) => {
const beforeItem = pending.items.get(id) || null;
const afterItem = after.get(id) || null;
if (JSON.stringify(beforeItem) === JSON.stringify(afterItem)) return;
itemChanges.push({
id,
before: beforeItem ? cloneData(beforeItem) : null,
after: afterItem ? cloneData(afterItem) : null,
});
state.pendingRemoteItemIds.add(id);
});
const bandsChanged = pending.bands !== null && JSON.stringify(pending.bands) !== JSON.stringify(state.bands);
const authorsChanged = pending.authors !== null && JSON.stringify(pending.authors) !== JSON.stringify(state.authors);
if (bandsChanged || authorsChanged) state.remoteConfigDirty = true;
if (!itemChanges.length && !bandsChanged && !authorsChanged) return null;
const entry = {
items: itemChanges,
beforeBands: bandsChanged ? pending.bands : null,
afterBands: bandsChanged ? cloneData(state.bands) : null,
beforeAuthors: authorsChanged ? pending.authors : null,
afterAuthors: authorsChanged ? cloneData(state.authors) : null,
};
state.undoStack.push(entry);
if (state.undoStack.length > 40) state.undoStack.shift();
state.redoStack = [];
return entry;
}

function applyHistoryEntry(entry, direction) {
ensureHotPathState();
entry.items.forEach((change) => {
const value = direction === "undo" ? change.before : change.after;
const index = state.items.findIndex((item) => item.id === change.id);
if (!value && index >= 0) state.items.splice(index, 1);
if (value && index >= 0) state.items.splice(index, 1, cloneData(value));
if (value && index < 0) state.items.push(cloneData(value));
state.pendingRemoteItemIds.add(change.id);
});
const bands = direction === "undo" ? entry.beforeBands : entry.afterBands;
const authors = direction === "undo" ? entry.beforeAuthors : entry.afterAuthors;
if (bands) {
state.bands = cloneData(bands);
state.remoteConfigDirty = true;
}
if (authors) {
state.authors = cloneData(authors);
state.remoteConfigDirty = true;
}
state.pendingHistory = null;
state.archiveCache.clear();
state.searchState = null;
commitState({ skipHistory: true });
}

function undo() {
const entry = state.undoStack.pop();
if (!entry) return;
state.redoStack.push(entry);
applyHistoryEntry(entry, "undo");
showToast("Modifica annullata");
}

function redo() {
const entry = state.redoStack.pop();
if (!entry) return;
state.undoStack.push(entry);
applyHistoryEntry(entry, "redo");
showToast("Modifica ripristinata");
}

function collectUntrackedRemoteChanges() {
ensureHotPathState();
const currentMap = new Map(state.items.map((item) => [item.id, item]));
state.items.forEach((item) => {
const snapshot = state.remoteItemSnapshots.get(item.id);
if (!snapshot || snapshot._deletedAt || comparableItem(item) !== comparableItem(snapshot)) {
state.pendingRemoteItemIds.add(item.id);
}
});
state.remoteItemSnapshots.forEach((snapshot, id) => {
if (!snapshot._deletedAt && !currentMap.has(id)) state.pendingRemoteItemIds.add(id);
});
if (configChanged()) state.remoteConfigDirty = true;
}

function commitState(options = {}) {
ensureHotPathState();
const historyEntry = options.skipHistory ? null : finalizeHistoryTransaction();
if (!historyEntry) collectUntrackedRemoteChanges();
const refreshSearch = Boolean(state.query && (historyEntry?.items.length || options.skipHistory));
if (historyEntry?.items.length) {
state.archiveCache.clear();
state.searchState = null;
}
invalidateItemIndexes();
saveItems();
saveBands();
saveAuthors();
if (!options.skipRemote) queueRemoteSave();
renderBandOptions();
renderBandManager();
render();
updateHistoryButtons();
if (refreshSearch) window.setTimeout(() => scheduleArchiveSearch(state.query, true), 0);
}

async function saveConcurrentChanges() {
ensureHotPathState();
const conflicts = [];
const pendingIds = [...state.pendingRemoteItemIds];
for (const id of pendingIds) {
const item = state.items.find((entry) => entry.id === id) || null;
const snapshot = state.remoteItemSnapshots.get(id) || null;
if (!item && !snapshot) {
state.pendingRemoteItemIds.delete(id);
continue;
}
if (item && !snapshot) {
const inserted = await insertContentRow(item);
if (!inserted) {
conflicts.push(await buildItemConflict(id, item, "insert"));
continue;
}
updateItemSnapshot(inserted);
state.pendingRemoteItemIds.delete(id);
continue;
}
if (!item && snapshot?._deletedAt) {
state.pendingRemoteItemIds.delete(id);
continue;
}
if (!item) {
const deleted = await patchContentRow(id, snapshot._version, { deleted_at: new Date().toISOString() });
if (!deleted) {
conflicts.push(await buildItemConflict(id, null, "delete"));
continue;
}
updateItemSnapshot(deleted);
state.pendingRemoteItemIds.delete(id);
continue;
}
if (snapshot._deletedAt) {
const restored = await patchContentRow(id, snapshot._version, { ...itemToRow(item), deleted_at: null });
if (!restored) {
conflicts.push(await buildItemConflict(id, item, "restore"));
continue;
}
updateItemSnapshot(restored);
state.pendingRemoteItemIds.delete(id);
continue;
}
if (comparableItem(item) === comparableItem(snapshot)) {
state.pendingRemoteItemIds.delete(id);
continue;
}
const updated = await patchContentRow(id, snapshot._version, itemToRow(item));
if (!updated) {
conflicts.push(await buildItemConflict(id, item, "update"));
continue;
}
updateItemSnapshot(updated);
state.pendingRemoteItemIds.delete(id);
}

if (state.remoteConfigDirty || configChanged()) {
const updatedConfig = await patchConfigRow();
if (!updatedConfig) conflicts.push({ kind: "config" });
else {
state.remoteConfigSnapshot = cloneData(updatedConfig);
state.remoteConfigDirty = false;
}
}
saveItems();
state.remoteDirty = state.pendingRemoteItemIds.size > 0 || state.remoteConfigDirty;
return conflicts;
}
