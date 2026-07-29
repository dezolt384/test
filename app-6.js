const COLLAB_SAVE_DELAY = 500;
const COLLAB_REFRESH_DELAY = 180;
const COLLAB_TRASH_DAYS = 30;
const CONTENT_PAGE_SIZE = 1000;
const COLLAB_FULL_REFRESH_INTERVAL = 300000;

function ensureCollaborationState() {
if (state.collaborationReady) return;
state.collaborationReady = true;
state.remoteMode = "";
state.remoteDirty = false;
state.remoteItemSnapshots = new Map();
state.remoteConfigSnapshot = null;
state.deletedItems = [];
state.pendingConflict = null;
state.realtimeClient = null;
state.realtimeChannel = null;
state.realtimeRefreshTimer = 0;
state.pendingRealtimeRows = new Map();
state.presenceClientId = createId();
state.editingItemId = "";
}

function setSyncStatus(status, text) {
const root = document.querySelector("#syncStatus");
const label = document.querySelector("#syncStatusText");
if (!root || !label) return;
root.dataset.status = status;
label.textContent = text;
}

async function initRemoteState() {
if (!isRemoteConfigured()) return;
ensureCollaborationState();
setSyncStatus("loading", "Collegamento...");
try {
await ensureCoordinatorSession();
const remote = await fetchConcurrentState();
state.remoteMode = "rows";
applyConcurrentState(remote, { announce: true });
state.remoteLoaded = true;
setSyncStatus("online", "Aggiornato");
startRealtimeCollaboration();
window.setInterval(refreshRemoteState, COLLAB_FULL_REFRESH_INTERVAL);
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

async function initLegacyRemoteState() {
state.remoteMode = "legacy";
const remote = await fetchLegacyRemoteState();
if (remote && hasRemoteData(remote)) {
applyLegacyRemoteState(remote, { announce: true });
} else if (isCoordinatorUnlocked()) {
await saveLegacyRemoteState({ immediate: true });
}
state.remoteLoaded = true;
setSyncStatus("legacy", "Modalita compatibile");
window.setInterval(refreshRemoteState, REMOTE_SYNC_INTERVAL);
}

async function fetchConcurrentState() {
const options = { auth: Boolean(getValidAuthSession()?.access_token) };
const headers = remoteHeaders({ Accept: "application/json" }, options);
const [configResponse, rows] = await Promise.all([
fetch(`${SUPABASE_REST_URL}/app_config?id=eq.${encodeURIComponent(REMOTE_STATE_ID)}&select=*`, { headers }),
fetchAllContentRows(headers),
]);
if ([404, 406].includes(configResponse.status)) {
const error = new Error("Schema concorrente non ancora attivo");
error.concurrentUnavailable = true;
throw error;
}
if (!configResponse.ok) {
throw new Error(`Lettura condivisa fallita: ${configResponse.status}`);
}
const configs = await configResponse.json();
return {
_mode: "rows",
config: Array.isArray(configs) ? configs[0] : null,
rows: Array.isArray(rows) ? rows : [],
};
}

async function fetchAllContentRows(headers) {
async function fetchPage(from, count = false) {
const to = from + CONTENT_PAGE_SIZE - 1;
const response = await fetch(
`${SUPABASE_REST_URL}/contents?select=*&order=content_date.asc,slot.asc,sort_order.asc,id.asc`,
{
headers: {
...headers,
Range: `${from}-${to}`,
...(count ? { Prefer: "count=exact" } : {}),
},
},
);
if ([404, 406].includes(response.status)) {
const error = new Error("Schema concorrente non ancora attivo");
error.concurrentUnavailable = true;
throw error;
}
if (!response.ok) throw new Error(`Lettura contenuti fallita: ${response.status}`);
const page = await response.json();
if (!Array.isArray(page)) throw new Error("Risposta contenuti non valida");
return { page, contentRange: response.headers.get("content-range") || "" };
}

const first = await fetchPage(0, true);
const totalMatch = first.contentRange.match(/\/(\d+)$/);
const total = totalMatch ? Number(totalMatch[1]) : NaN;
if (Number.isFinite(total) && total > first.page.length) {
const offsets = [];
for (let from = CONTENT_PAGE_SIZE; from < total; from += CONTENT_PAGE_SIZE) offsets.push(from);
const remainingPages = await Promise.all(offsets.map((from) => fetchPage(from)));
return [first.page, ...remainingPages.map((result) => result.page)].flat();
}

const rows = [...first.page];
for (let from = CONTENT_PAGE_SIZE; first.page.length === CONTENT_PAGE_SIZE; from += CONTENT_PAGE_SIZE) {
const result = await fetchPage(from);
rows.push(...result.page);
if (result.page.length < CONTENT_PAGE_SIZE) break;
}
return rows;
}

function rowToItem(row) {
return {
id: row.id,
title: row.title || "",
date: row.content_date,
slot: row.slot || "",
author: row.author || "",
status: row.status || "idea",
tags: Array.isArray(row.tags) ? row.tags : [],
live: Boolean(row.live),
appointment: Boolean(row.appointment),
order: Number(row.sort_order) || 0,
_version: Number(row.version) || 1,
_updatedAt: row.updated_at || "",
_updatedBy: row.updated_by_email || "",
_deletedAt: row.deleted_at || "",
_deletedBy: row.deleted_by_email || "",
};
}

function itemToRow(item) {
return {
id: item.id,
title: item.title || "",
content_date: item.date,
slot: item.slot || "",
author: item.author || "",
status: item.status || "idea",
tags: Array.isArray(item.tags) ? item.tags : [],
live: Boolean(item.live),
appointment: Boolean(item.appointment),
sort_order: getItemOrder(item),
};
}

function comparableItem(item) {
return JSON.stringify(itemToRow(item));
}

function applyConcurrentState(remote, options = {}) {
ensureCollaborationState();
const rows = Array.isArray(remote.rows) ? remote.rows : [];
state.remoteItemSnapshots = new Map(rows.map((row) => [row.id, rowToItem(row)]));
state.deletedItems = rows.filter((row) => row.deleted_at).map(rowToItem);
state.items = normalizeItems(rows.filter((row) => !row.deleted_at).map(rowToItem));

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

state.remoteUpdatedAt = remote.config?.updated_at || "";
state.remoteDirty = false;
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

async function fetchRemoteState() {
if (state.remoteMode === "rows") return fetchConcurrentState();
return fetchLegacyRemoteState();
}

function applyRemoteState(remote, options = {}) {
if (remote?._mode === "rows" || state.remoteMode === "rows") {
applyConcurrentState(remote, options);
return;
}
applyLegacyRemoteState(remote, options);
}

function hasRemoteData(remote) {
if (remote?._mode === "rows") return Boolean(remote.config || remote.rows?.length);
return Boolean(
(Array.isArray(remote?.items) && remote.items.length) ||
(Array.isArray(remote?.bands) && remote.bands.length) ||
(Array.isArray(remote?.authors) && remote.authors.length),
);
}

async function refreshRemoteState(options = {}) {
if (!state.remoteLoaded || state.remoteSaving || state.pendingConflict) return;
if (state.remoteDirty && !options.force) return;
if (!isAllSidePanelsClosed() && !options.force) return;
try {
await ensureCoordinatorSession();
const remote = await fetchRemoteState();
if (state.remoteMode === "rows") {
applyConcurrentState(remote);
setSyncStatus("online", "Aggiornato");
return;
}
if (!remote?.updated_at || remote.updated_at === state.remoteUpdatedAt) return;
applyLegacyRemoteState(remote);
} catch (error) {
console.warn("Aggiornamento Supabase fallito", error);
setSyncStatus("offline", "Aggiornamento fallito");
}
}

function queueRemoteSave() {
if (!isRemoteConfigured()) return;
ensureCollaborationState();
state.remoteDirty = true;
setSyncStatus("saving", "Modifiche da salvare");
window.clearTimeout(state.remoteSaveTimer);
state.remoteSaveTimer = window.setTimeout(() => saveRemoteState(), COLLAB_SAVE_DELAY);
}

function getValidAuthSession() {
if (!state.authSession?.access_token) return null;
if (state.authSession.expires_at && Date.now() > state.authSession.expires_at && !state.authSession.refresh_token) {
clearAuthSession();
return null;
}
return state.authSession;
}

async function ensureCoordinatorSession() {
const session = state.authSession;
if (!session?.access_token) return null;
if (!session.expires_at || Date.now() < session.expires_at) return session;
if (!session.refresh_token) {
clearAuthSession();
return null;
}
try {
const response = await fetch(`${SUPABASE_AUTH_URL}/token?grant_type=refresh_token`, {
method: "POST",
headers: {
apikey: SUPABASE_KEY,
Authorization: `Bearer ${SUPABASE_KEY}`,
"Content-Type": "application/json",
},
body: JSON.stringify({ refresh_token: session.refresh_token }),
});
if (!response.ok) throw new Error(`Rinnovo sessione fallito: ${response.status}`);
saveAuthSession(await response.json());
const token = state.authSession?.access_token;
if (token) state.realtimeClient?.realtime?.setAuth(token);
return state.authSession;
} catch (error) {
console.warn("Sessione coordinatore scaduta", error);
clearAuthSession();
return null;
}
}

async function saveRemoteState(options = {}) {
if (!isRemoteConfigured()) return;
if (!options.immediate && !state.remoteLoaded) return;
if (!(await ensureCoordinatorSession())) {
applyRole("reader");
showToast("Accedi come coordinatore per salvare");
return;
}
if (state.remoteMode !== "rows") {
await saveLegacyRemoteState(options);
return;
}
if (state.remoteSaving) return;

state.remoteSaving = true;
setSyncStatus("saving", "Salvataggio...");
try {
const conflicts = await saveConcurrentChanges();
if (conflicts.length) {
state.remoteDirty = true;
showConflict(conflicts[0]);
setSyncStatus("conflict", "Conflitto da risolvere");
return;
}
state.remoteDirty = false;
setSyncStatus("online", "Salvato");
} catch (error) {
console.warn("Salvataggio condiviso fallito", error);
state.remoteDirty = true;
setSyncStatus("offline", "Salvataggio fallito");
showToast("Salvataggio condiviso non riuscito");
} finally {
state.remoteSaving = false;
}
}

async function saveConcurrentChanges() {
const conflicts = [];
const currentMap = new Map(state.items.map((item) => [item.id, item]));
const activeSnapshots = [...state.remoteItemSnapshots.values()].filter((item) => !item._deletedAt);

for (const item of state.items) {
const snapshot = state.remoteItemSnapshots.get(item.id);
if (!snapshot) {
const inserted = await insertContentRow(item);
if (!inserted) {
conflicts.push(await buildItemConflict(item.id, item, "insert"));
continue;
}
updateItemSnapshot(inserted);
continue;
}
if (snapshot._deletedAt || comparableItem(item) === comparableItem(snapshot)) continue;
const updated = await patchContentRow(item.id, snapshot._version, itemToRow(item));
if (!updated) {
conflicts.push(await buildItemConflict(item.id, item, "update"));
continue;
}
updateItemSnapshot(updated);
}

for (const snapshot of activeSnapshots) {
if (currentMap.has(snapshot.id)) continue;
const deleted = await patchContentRow(snapshot.id, snapshot._version, { deleted_at: new Date().toISOString() });
if (!deleted) {
conflicts.push(await buildItemConflict(snapshot.id, null, "delete"));
continue;
}
updateItemSnapshot(deleted);
}

if (configChanged()) {
const updatedConfig = await patchConfigRow();
if (!updatedConfig) {
conflicts.push({ kind: "config" });
} else {
state.remoteConfigSnapshot = cloneData(updatedConfig);
}
}

saveItems();
return conflicts;
}

async function insertContentRow(item) {
const response = await fetch(`${SUPABASE_REST_URL}/contents`, {
method: "POST",
headers: remoteHeaders({}, { auth: true }),
body: JSON.stringify(itemToRow(item)),
});
if (response.status === 409) return null;
if (!response.ok) throw new Error(`Inserimento fallito: ${response.status}`);
const rows = await response.json();
return rows?.[0] || null;
}

async function patchContentRow(id, version, patch) {
const response = await fetch(
`${SUPABASE_REST_URL}/contents?id=eq.${encodeURIComponent(id)}&version=eq.${encodeURIComponent(version)}`,
{
method: "PATCH",
headers: remoteHeaders({}, { auth: true }),
body: JSON.stringify(patch),
},
);
if (!response.ok) throw new Error(`Modifica fallita: ${response.status}`);
const rows = await response.json();
return rows?.[0] || null;
}

function updateItemSnapshot(row) {
const item = rowToItem(row);
state.remoteItemSnapshots.set(item.id, item);
const local = state.items.find((entry) => entry.id === item.id);
if (local) {
local._version = item._version;
local._updatedAt = item._updatedAt;
local._updatedBy = item._updatedBy;
}
state.deletedItems = [...state.remoteItemSnapshots.values()].filter((entry) => entry._deletedAt);
}

function configChanged() {
const snapshot = state.remoteConfigSnapshot;
if (!snapshot) return true;
return JSON.stringify(state.bands) !== JSON.stringify(snapshot.bands || []) ||
JSON.stringify(state.authors) !== JSON.stringify(snapshot.authors || []);
}

async function patchConfigRow() {
const snapshot = state.remoteConfigSnapshot;
if (!snapshot) {
const response = await fetch(`${SUPABASE_REST_URL}/app_config`, {
method: "POST",
headers: remoteHeaders({}, { auth: true }),
body: JSON.stringify({ id: REMOTE_STATE_ID, bands: state.bands, authors: state.authors }),
});
if (!response.ok) throw new Error(`Configurazione non salvata: ${response.status}`);
return (await response.json())?.[0] || null;
}
const response = await fetch(
`${SUPABASE_REST_URL}/app_config?id=eq.${encodeURIComponent(REMOTE_STATE_ID)}&version=eq.${encodeURIComponent(snapshot.version)}`,
{
method: "PATCH",
headers: remoteHeaders({}, { auth: true }),
body: JSON.stringify({ bands: state.bands, authors: state.authors }),
},
);
if (!response.ok) throw new Error(`Configurazione non salvata: ${response.status}`);
return (await response.json())?.[0] || null;
}

async function fetchContentRow(id) {
const response = await fetch(
`${SUPABASE_REST_URL}/contents?id=eq.${encodeURIComponent(id)}&select=*`,
{ headers: remoteHeaders({ Accept: "application/json" }, { auth: true }) },
);
if (!response.ok) throw new Error(`Contenuto non leggibile: ${response.status}`);
return (await response.json())?.[0] || null;
}

async function buildItemConflict(id, localItem, operation) {
return {
kind: "item",
id,
operation,
localItem: localItem ? cloneData(localItem) : null,
remoteRow: await fetchContentRow(id),
};
}

function showConflict(conflict) {
state.pendingConflict = conflict;
const modal = document.querySelector("#conflictModal");
const message = document.querySelector("#conflictMessage");
const copyButton = document.querySelector("#saveConflictCopy");
if (!modal || !message || !copyButton) return;
if (conflict.kind === "config") {
message.textContent = "Un altro coordinatore ha modificato le fasce. Carica la configurazione aggiornata e ripeti la modifica.";
copyButton.hidden = true;
} else {
const email = conflict.remoteRow?.updated_by_email;
message.textContent = email
? `${email} ha salvato una versione piu' recente. Scegli quale versione conservare.`
: "Un altro coordinatore ha salvato una versione piu' recente. Scegli quale versione conservare.";
copyButton.hidden = !conflict.localItem;
}
modal.classList.remove("is-hidden");
modal.setAttribute("aria-hidden", "false");
}

function closeConflictModal() {
const modal = document.querySelector("#conflictModal");
modal?.classList.add("is-hidden");
modal?.setAttribute("aria-hidden", "true");
}

async function loadRemoteConflict() {
state.pendingConflict = null;
closeConflictModal();
state.remoteDirty = false;
await refreshRemoteState({ force: true });
closeEditor();
showToast("Versione aggiornata caricata");
}

async function saveConflictAsCopy() {
const conflict = state.pendingConflict;
if (!conflict?.localItem) return;
const remoteItem = conflict.remoteRow ? rowToItem(conflict.remoteRow) : null;
state.items = state.items.filter((item) => item.id !== conflict.id);
if (remoteItem && !remoteItem._deletedAt) state.items.push(remoteItem);
if (remoteItem) state.remoteItemSnapshots.set(remoteItem.id, remoteItem);

const copy = {
...conflict.localItem,
id: createId(),
title: `${conflict.localItem.title} (copia)`,
order: getNextItemOrder(conflict.localItem.date, conflict.localItem.slot),
_version: 0,
_updatedAt: "",
_updatedBy: "",
};
state.items.push(copy);
state.pendingConflict = null;
closeConflictModal();
commitState();
closeEditor();
showToast("La tua versione e' stata salvata come copia");
}

function startRealtimeCollaboration() {
ensureCollaborationState();
if (state.remoteMode !== "rows" || !window.supabase?.createClient) {
setSyncStatus("online", "Aggiornamento periodico");
return;
}
if (state.realtimeChannel) state.realtimeClient?.removeChannel(state.realtimeChannel);

const projectUrl = SUPABASE_REST_URL.replace(/\/rest\/v1\/?$/, "");
const token = getValidAuthSession()?.access_token;
state.realtimeClient = window.supabase.createClient(projectUrl, SUPABASE_KEY, {
auth: { persistSession: false, autoRefreshToken: false },
global: token ? { headers: { Authorization: `Bearer ${token}` } } : {},
});
if (token) state.realtimeClient.realtime.setAuth(token);

state.realtimeChannel = state.realtimeClient
.channel("programmazione-redazione", { config: { presence: { key: state.presenceClientId } } })
.on("postgres_changes", { event: "*", schema: "public", table: "contents" }, scheduleRealtimeContentPatch)
.on("postgres_changes", { event: "*", schema: "public", table: "app_config" }, scheduleRealtimeRefresh)
.on("presence", { event: "sync" }, renderPresenceNotice)
.subscribe((status) => {
if (status !== "SUBSCRIBED") return;
setSyncStatus("online", "Tempo reale");
setEditingPresence(state.editingItemId);
});
}

function scheduleRealtimeContentPatch(payload) {
const row = payload?.new?.id ? payload.new : null;
if (!row) {
scheduleRealtimeRefresh();
return;
}
state.pendingRealtimeRows.set(row.id, row);
window.clearTimeout(state.realtimeRefreshTimer);
state.realtimeRefreshTimer = window.setTimeout(applyRealtimeContentPatches, COLLAB_REFRESH_DELAY);
}

function applyRealtimeContentPatches() {
if (state.remoteDirty || state.remoteSaving || state.pendingConflict || !isAllSidePanelsClosed()) {
window.clearTimeout(state.realtimeRefreshTimer);
state.realtimeRefreshTimer = window.setTimeout(applyRealtimeContentPatches, 800);
return;
}
const rows = [...state.pendingRealtimeRows.values()];
state.pendingRealtimeRows.clear();
if (!rows.length) return;

const affectedDates = new Set();
rows.forEach((row) => {
const nextItem = rowToItem(row);
const currentIndex = state.items.findIndex((item) => item.id === nextItem.id);
if (currentIndex >= 0) affectedDates.add(state.items[currentIndex].date);
affectedDates.add(nextItem.date);
state.remoteItemSnapshots.set(nextItem.id, nextItem);
state.deletedItems = state.deletedItems.filter((item) => item.id !== nextItem.id);

if (nextItem._deletedAt) {
if (currentIndex >= 0) state.items.splice(currentIndex, 1);
state.deletedItems.push(nextItem);
return;
}
if (currentIndex >= 0) state.items.splice(currentIndex, 1, nextItem);
else state.items.push(nextItem);
});

invalidateItemIndexes();
window.setTimeout(saveItems, 0);
const weekDates = new Set(getWeekDays().map((day) => toISO(day)));
const affectsCurrentView =
state.query ||
["author", "appointments", "meetings", "live"].includes(state.view) ||
(state.view === "day" && affectedDates.has(state.selectedDate)) ||
(state.view === "week" && [...affectedDates].some((date) => weekDates.has(date)));
if (affectsCurrentView) render();
setSyncStatus("online", "Tempo reale");
}

function scheduleRealtimeRefresh() {
if (state.remoteDirty || state.remoteSaving || state.pendingConflict || !isAllSidePanelsClosed()) return;
window.clearTimeout(state.realtimeRefreshTimer);
state.realtimeRefreshTimer = window.setTimeout(() => refreshRemoteState(), COLLAB_REFRESH_DELAY);
}

function setEditingPresence(itemId = "") {
ensureCollaborationState();
state.editingItemId = itemId || "";
const channel = state.realtimeChannel;
if (!channel) {
renderPresenceNotice();
return;
}
const session = getValidAuthSession();
const email = session?.user?.email || "";
channel.track({
client_id: state.presenceClientId,
email,
item_id: state.editingItemId,
online_at: new Date().toISOString(),
});
renderPresenceNotice();
}

function renderPresenceNotice() {
const notice = document.querySelector("#presenceNotice");
if (!notice) return;
const itemId = elements.itemId?.value || state.editingItemId;
if (!itemId || !state.realtimeChannel) {
notice.classList.add("is-hidden");
return;
}
const presence = state.realtimeChannel.presenceState?.() || {};
const collaborators = Object.values(presence)
.flat()
.filter((entry) => entry.client_id !== state.presenceClientId && entry.item_id === itemId);
if (!collaborators.length) {
notice.classList.add("is-hidden");
return;
}
const names = [...new Set(collaborators.map((entry) => formatCollaboratorName(entry.email)).filter(Boolean))];
notice.textContent = `${names.join(", ")} sta modificando questo contenuto`;
notice.classList.remove("is-hidden");
}

function formatCollaboratorName(email) {
const local = String(email || "").split("@")[0];
return local
.split(/[._-]+/)
.filter(Boolean)
.map((part) => capitalize(part))
.join(" ");
}

async function handleCoordinatorSessionChanged() {
ensureCollaborationState();
if (state.remoteMode === "rows") {
const remote = await fetchConcurrentState();
applyConcurrentState(remote);
startRealtimeCollaboration();
}
}

function openTrash() {
if (state.role !== "coordinator") return;
renderTrash();
const modal = document.querySelector("#trashModal");
modal.classList.remove("is-hidden");
modal.setAttribute("aria-hidden", "false");
}

function closeTrash() {
const modal = document.querySelector("#trashModal");
modal.classList.add("is-hidden");
modal.setAttribute("aria-hidden", "true");
}

function renderTrash() {
const list = document.querySelector("#trashList");
if (!list) return;
list.replaceChildren();
const cutoff = Date.now() - COLLAB_TRASH_DAYS * 86400000;
const items = state.deletedItems
.filter((item) => new Date(item._deletedAt).getTime() >= cutoff)
.sort((a, b) => b._deletedAt.localeCompare(a._deletedAt));
if (!items.length) {
list.innerHTML = '<div class="empty-state compact-empty">Nessun contenuto eliminato negli ultimi 30 giorni</div>';
return;
}
items.forEach((item) => {
const row = document.createElement("div");
row.className = "record-row";
row.innerHTML = `
<div>
  <strong>${escapeHtml(item.title)}</strong>
  <span>${escapeHtml(formatFullDate(parseDate(item.date)))} · eliminato da ${escapeHtml(formatCollaboratorName(item._deletedBy) || "coordinatore")}</span>
</div>
<button class="secondary-button" type="button">Ripristina</button>
`;
row.querySelector("button").addEventListener("click", () => restoreDeletedItem(item));
list.appendChild(row);
});
}

async function restoreDeletedItem(item) {
const restored = await patchContentRow(item.id, item._version, { deleted_at: null });
if (!restored) {
showConflict(await buildItemConflict(item.id, item, "restore"));
return;
}
updateItemSnapshot(restored);
closeTrash();
await refreshRemoteState({ force: true });
showToast("Contenuto ripristinato");
}

async function openItemHistory(item) {
if (state.role !== "coordinator" || state.remoteMode !== "rows") return;
const modal = document.querySelector("#historyModal");
const list = document.querySelector("#historyList");
const title = document.querySelector("#historyTitle");
title.textContent = item.title;
list.innerHTML = '<div class="empty-state compact-empty">Caricamento...</div>';
modal.classList.remove("is-hidden");
modal.setAttribute("aria-hidden", "false");
try {
const response = await fetch(
`${SUPABASE_REST_URL}/content_history?content_id=eq.${encodeURIComponent(item.id)}&select=*&order=changed_at.desc&limit=30`,
{ headers: remoteHeaders({ Accept: "application/json" }, { auth: true }) },
);
if (!response.ok) throw new Error(`Cronologia non leggibile: ${response.status}`);
renderItemHistory(await response.json());
} catch (error) {
list.innerHTML = `<div class="empty-state compact-empty">${escapeHtml(error.message)}</div>`;
}
}

function renderItemHistory(entries) {
const list = document.querySelector("#historyList");
list.replaceChildren();
if (!Array.isArray(entries) || !entries.length) {
list.innerHTML = '<div class="empty-state compact-empty">Nessuna modifica registrata</div>';
return;
}
entries.forEach((entry) => {
const snapshot = entry.snapshot || {};
const row = document.createElement("div");
row.className = "record-row history-record";
const action = snapshot.deleted_at ? "Spostato nel cestino" : entry.action === "INSERT" ? "Creato" : "Modificato";
row.innerHTML = `
<div>
  <strong>${escapeHtml(action)}</strong>
  <span>${escapeHtml(formatDateTime(entry.changed_at))} · ${escapeHtml(formatCollaboratorName(entry.changed_by_email) || "coordinatore")}</span>
  <small>${escapeHtml(snapshot.title || "")}</small>
</div>
`;
list.appendChild(row);
});
}

function closeItemHistory() {
const modal = document.querySelector("#historyModal");
modal.classList.add("is-hidden");
modal.setAttribute("aria-hidden", "true");
}

function formatDateTime(value) {
const date = new Date(value);
return new Intl.DateTimeFormat("it-IT", {
day: "2-digit",
month: "2-digit",
year: "numeric",
hour: "2-digit",
minute: "2-digit",
}).format(date);
}

async function fetchLegacyRemoteState() {
const response = await fetch(`${SUPABASE_REST_URL}/app_state?id=eq.${encodeURIComponent(REMOTE_STATE_ID)}&select=*`, {
headers: remoteHeaders({ Accept: "application/json" }),
});
if (!response.ok) throw new Error(`Lettura Supabase fallita: ${response.status}`);
const rows = await response.json();
return Array.isArray(rows) ? rows[0] : null;
}

function applyLegacyRemoteState(remote, options = {}) {
state.items = normalizeItems(Array.isArray(remote.items) && remote.items.length ? remote.items : state.items);
state.bands = normalizeBands(Array.isArray(remote.bands) && remote.bands.length ? remote.bands : state.bands, state.items);
state.authors = normalizeAuthors(Array.isArray(remote.authors) && remote.authors.length ? remote.authors : state.authors);
state.remoteUpdatedAt = remote.updated_at || "";
state.remoteDirty = false;
invalidateItemIndexes();
saveItems();
saveBands();
saveAuthors();
renderBandOptions();
renderBandManager();
render();
if (options.announce) showToast("Database condiviso collegato");
}

async function saveLegacyRemoteState(options = {}) {
if (!options.immediate && !state.remoteLoaded) return;
if (!isCoordinatorUnlocked()) return;
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
state.remoteDirty = false;
setSyncStatus("legacy", "Salvato");
} finally {
state.remoteSaving = false;
}
}

document.querySelector("#trashButton")?.addEventListener("click", openTrash);
document.querySelector("#closeTrash")?.addEventListener("click", closeTrash);
document.querySelector("#closeHistory")?.addEventListener("click", closeItemHistory);
document.querySelector("#closeConflict")?.addEventListener("click", loadRemoteConflict);
document.querySelector("#loadRemoteConflict")?.addEventListener("click", loadRemoteConflict);
document.querySelector("#saveConflictCopy")?.addEventListener("click", saveConflictAsCopy);
