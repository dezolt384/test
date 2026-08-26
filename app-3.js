}

function cancelWeekJump(drag) {
if (drag.weekJumpTimer) window.clearTimeout(drag.weekJumpTimer);
drag.weekJumpTimer = null;
drag.overWeekJump = null;
clearWeekJumpTargets();
}

function clearWeekJumpTargets() {
document.querySelectorAll(".week-jump-target.is-week-drop-target").forEach((target) => target.classList.remove("is-week-drop-target"));
}

function renderCardTitle(container, text) {
container.replaceChildren();
const lines = text.replace(/\r\n/g, "\n").split("\n");
let list = null;

lines.forEach((rawLine) => {
const line = rawLine.trim();
if (!line) {
list = null;
return;
}

const bulletMatch = line.match(/^[-*•]\s*(.+)$/);
if (bulletMatch) {
if (!list) {
list = document.createElement("ul");
list.className = "card-title-list";
container.appendChild(list);
}
const item = document.createElement("li");
item.textContent = bulletMatch[1];
list.appendChild(item);
return;
}

list = null;
const paragraph = document.createElement("p");
paragraph.className = "card-title-text";
paragraph.textContent = line;
container.appendChild(paragraph);
});
}

function renderCardTitleRich(container, text) {
container.replaceChildren();
const lines = text.replace(/\r\n/g, "\n").split("\n");
const authors = [];
let list = null;

lines.forEach((rawLine) => {
const line = rawLine.trim();
if (!line) {
list = null;
return;
}

const bulletMatch = line.match(/^(?:[-*]|\u2022)\s*(.+)$/);
if (bulletMatch) {
if (!list) {
list = document.createElement("ul");
list.className = "card-title-list";
container.appendChild(list);
}
const piece = splitInlineAuthor(bulletMatch[1]);
const item = document.createElement("li");
appendTitlePiece(item, piece);
if (piece.author) authors.push(piece.author);
list.appendChild(item);
return;
}

list = null;
const piece = splitInlineAuthor(line);
const paragraph = document.createElement("p");
paragraph.className = "card-title-text";
appendTitlePiece(paragraph, piece);
if (piece.author) authors.push(piece.author);
container.appendChild(paragraph);
});

return { authors: uniqueAuthors(authors) };
}

function appendTitlePiece(container, piece) {
container.append(document.createTextNode(piece.title));
if (!piece.author) return;

const author = document.createElement("span");
author.className = "card-piece-author";
author.textContent = piece.author;
container.append(" ");
container.appendChild(author);
}

function createStoredAuthor(author) {
const cleanAuthor = normalizeAuthorName(author);
if (!cleanAuthor) return document.createDocumentFragment();
const row = document.createElement("div");
row.className = "card-stored-author";
const pill = document.createElement("span");
pill.className = "card-piece-author";
pill.textContent = cleanAuthor;
row.appendChild(pill);
return row;
}

function renderStructuredContentParts(container, parts) {
container.replaceChildren();
const list = document.createElement("ul");
list.className = "card-title-list card-content-parts";
parts.forEach((part) => {
const item = document.createElement("li");
const text = document.createElement("span");
text.className = "card-content-part-title";
text.textContent = part.title;
item.appendChild(text);
const author = normalizeAuthorName(part.author);
if (author) item.appendChild(createStoredAuthor(author));
list.appendChild(item);
});
container.appendChild(list);
}

function createEmptySlot(date, slot) {
const button = document.createElement("button");
button.type = "button";
button.className = "empty-slot cell-add-button";
button.textContent = "+ Aggiungi";
button.addEventListener("click", () =>
openEditor({
date,
slot,
status: "idea",
live: slot === "dirette",
appointment: slot === "appuntamento",
}),
);
return button;
}

function createTag(label) {
const tag = document.createElement("span");
tag.className = "tag";
tag.textContent = label;
return tag;
}

function createContentFormatTag(label) {
const tag = document.createElement("span");
tag.className = "content-format-tag";
tag.textContent = label;
return tag;
}

function createBandChip(slot, date) {
const band = findBand(slot);
const chip = document.createElement("span");
chip.className = "band-chip";
const active = isBandActiveOnDate(band, date);
chip.classList.toggle("is-unassigned", !active);
chip.textContent = active ? band.title : `Da ricollocare · ${band?.title || slot || "Fascia non disponibile"}`;
return chip;
}

function createDateChip(date) {
const chip = document.createElement("span");
chip.className = "date-chip";
chip.textContent = formatFullDate(parseDate(date));
return chip;
}

function filteredItems() {
if (!state.query) return state.items;
return state.items.filter((item) => {
const searchable = [
item.title,
item.author,
...getItemContentParts(item).flatMap((part) => [part.title, part.author]),
...getTitleAuthors(item.title),
...(item.tags || []),
].join(" ").toLowerCase();
return searchable.includes(state.query);
});
}

function prepareRenderItems() {
if (preparedItemDataRevision === itemDataRevision && preparedItemQuery === state.query) return;
currentRenderItems = filteredItems();
currentItemsByDate = new Map();
currentItemsByCell = new Map();
currentRenderItems.forEach((item) => {
const dateItems = currentItemsByDate.get(item.date) || [];
dateItems.push(item);
currentItemsByDate.set(item.date, dateItems);
const cellKey = `${item.date}\u0000${item.slot}`;
const cellItems = currentItemsByCell.get(cellKey) || [];
cellItems.push(item);
currentItemsByCell.set(cellKey, cellItems);
});
currentAvailableYears = [...new Set([
...(Array.isArray(state.availableYears) ? state.availableYears : []),
...state.items.map((item) => Number(item.date?.slice(0, 4))).filter(Number.isFinite),
])].sort((a, b) => a - b);
preparedItemDataRevision = itemDataRevision;
preparedItemQuery = state.query;
}

function invalidateItemIndexes() {
itemDataRevision += 1;
}

function getRenderItemsForDate(date) {
return currentItemsByDate.get(date) || [];
}

function getRenderItemsForDates(dates) {
return dates.flatMap((date) => getRenderItemsForDate(date));
}

function getRenderItemsForCell(date, slot) {
return currentItemsByCell.get(`${date}\u0000${slot}`) || [];
}

function isMeetingItem(item) {
const tags = (item.tags || []).map((tag) => tag.toLocaleLowerCase("it-IT"));
return item.slot === "riunioni" || tags.includes("riunioni") || tags.includes("riunione");
}

function isLiveItem(item) {
return item.live || item.slot === "dirette" || findBand(item.slot)?.kind === "dirette";
}

function isAppointmentItem(item) {
return item.appointment || item.slot === "appuntamento" || findBand(item.slot)?.kind === "appuntamento";
}

function getExistingStatus(itemId) {
return state.items.find((item) => item.id === itemId)?.status || "idea";
}

function openEditor(item = {}, options = {}) {
if (state.role === "reader") return;
elements.body.classList.add("editor-open");
elements.bandPanel.classList.add("is-hidden");
elements.editorPanel.classList.remove("is-hidden");
elements.formTitle.textContent = options.mode === "move" ? "Sposta contenuto" : item.id ? "Modifica contenuto" : "Nuovo contenuto";
elements.itemId.value = item.id || "";
elements.itemFormat.value = getContentFormat(item);
const contentParts = getItemContentParts(item);
const editorValue = contentParts[0] || getEditorContentValues(item);
elements.itemTitle.value = editorValue.title;
elements.itemAuthor.value = editorValue.author;
renderAdditionalContentParts(contentParts.slice(1));
renderAuthorSuggestions();
elements.itemDate.value = item.date || state.selectedDate;
elements.itemSlot.value = getBand(item.slot).id;
renderBandOptions();
elements.itemPublication.value = item.status === "pubblicato" ? "pubblicato" : "idea";
elements.itemTag.value = formatTags(getRegularTags(item.tags));
if (options.mode === "move") elements.itemDate.focus({ preventScroll: true });
else elements.itemTitle.focus({ preventScroll: true });
setEditingPresence(item.id || "");
}

function closeEditor() {
elements.editorPanel.classList.add("is-hidden");
setEditingPresence("");
if (isAllSidePanelsClosed()) elements.body.classList.remove("editor-open");
}

function openBandManager() {
if (state.role === "reader") return;
elements.editorPanel.classList.add("is-hidden");
elements.bandPanel.classList.remove("is-hidden");
elements.body.classList.add("editor-open");
renderBandManager();
elements.bandName.focus({ preventScroll: true });
}

function closeBandManager() {
elements.bandPanel.classList.add("is-hidden");
if (isAllSidePanelsClosed()) elements.body.classList.remove("editor-open");
}

function isAllSidePanelsClosed() {
return [elements.editorPanel, elements.bandPanel].every((panel) => panel.classList.contains("is-hidden"));
}

function resetForm() {
elements.form.reset();
elements.itemId.value = "";
elements.itemFormat.value = "";
elements.itemDate.value = state.selectedDate;
renderBandOptions();
elements.itemAuthor.value = "";
renderAdditionalContentParts([]);
elements.itemPublication.value = "idea";
elements.itemTag.value = "";
elements.formTitle.textContent = "Nuovo contenuto";
}

function deleteItem(id) {
pushHistory({ itemIds: [id] });
state.items = state.items.filter((item) => item.id !== id);
commitState();
showToast("Contenuto eliminato");
}

function setItemPublication(id, isPublished) {
const item = state.items.find((entry) => entry.id === id);
const nextStatus = isPublished ? "pubblicato" : "idea";
if (!item || item.status === nextStatus) return;
pushHistory({ itemIds: [id] });
item.status = nextStatus;
commitState();
showToast(isPublished ? "Contenuto segnato come pubblicato" : "Contenuto segnato come non pubblicato");
}

function changeWeek(delta) {
state.currentWeekStart = addDays(state.currentWeekStart, delta);
state.selectedDate = toISO(state.currentWeekStart);
render();
}

function changeSelectedDay(delta) {
const nextDate = addDays(parseDate(state.selectedDate), delta);
state.selectedDate = toISO(nextDate);
state.currentWeekStart = startOfWeek(nextDate);
state.view = "day";
document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("is-active", tab.dataset.view === "day"));
render();
}

function renderYearNavigator() {
if (!elements.yearButtons) return;
elements.yearButtons.replaceChildren();
currentAvailableYears.forEach((year) => {
const button = document.createElement("button");
button.type = "button";
button.className = "year-button";
button.textContent = year;
button.classList.toggle("is-active", Number(state.selectedDate.slice(0, 4)) === year);
button.addEventListener("click", () => jumpToYear(year));
elements.yearButtons.appendChild(button);
});
}

function jumpToYear(year) {
const firstItem = state.items
.filter((item) => item.date.startsWith(`${year}-`))
.sort(compareItems)[0];
if (!firstItem) return;
const date = parseDate(firstItem.date);
state.currentWeekStart = startOfWeek(date);
state.selectedDate = firstItem.date;
state.view = "week";
state.query = "";
state.authorDetail = "";
elements.searchInput.value = "";
document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("is-active", tab.dataset.view === "week"));
render();
}

function goHome() {
goToday("week");
}

function goToday(view = state.view) {
const today = new Date();
today.setHours(12, 0, 0, 0);
state.currentWeekStart = startOfWeek(today);
state.selectedDate = toISO(today);
state.view = view || "week";
state.query = "";
state.authorDetail = "";
elements.searchInput.value = "";
closeEditor();
closeBandManager();
document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("is-active", tab.dataset.view === state.view));
render();
}

function getWeekDays() {
return Array.from({ length: 7 }, (_, index) => addDays(state.currentWeekStart, index));
}

function countForDate(date) {
return getRenderItemsForDate(date).length;
}

function compareItems(a, b) {
return (
a.date.localeCompare(b.date) ||
getBandIndex(a.slot) - getBandIndex(b.slot) ||
getItemOrder(a) - getItemOrder(b) ||
a.title.localeCompare(b.title)
);
}

function getItemOrder(item) {
const order = Number(item?.order);
return Number.isFinite(order) ? order : 0;
}

function getOrderedGroupItems(date, slot, excludeId = "") {
return state.items
.filter((item) => item.date === date && item.slot === slot && item.id !== excludeId)
.sort((a, b) => getItemOrder(a) - getItemOrder(b) || a.title.localeCompare(b.title));
}

function getNextItemOrder(date, slot, excludeId = "") {
const items = getOrderedGroupItems(date, slot, excludeId);
return items.length ? Math.max(...items.map(getItemOrder)) + 1 : 0;
}

function setGroupOrder(items) {
items.forEach((item, index) => {
item.order = index;
});
}

function moveItemByOffset(itemId, offset) {
const item = state.items.find((entry) => entry.id === itemId);
if (!item) return;
const items = getOrderedGroupItems(item.date, item.slot);
const currentIndex = items.findIndex((entry) => entry.id === itemId);
const nextIndex = currentIndex + offset;
if (currentIndex < 0 || nextIndex < 0 || nextIndex >= items.length) return;

pushHistory({ itemIds: items.map((entry) => entry.id) });
items.splice(currentIndex, 1);
items.splice(nextIndex, 0, item);
setGroupOrder(items);
commitState();
showToast("Ordine aggiornato");
}

function groupBy(items, getKey) {
return items.reduce((groups, item) => {
const key = getKey(item);
groups[key] = groups[key] || [];
groups[key].push(item);
return groups;
}, {});
}

function startOfWeek(date) {
const copy = new Date(date);
const day = copy.getDay() || 7;
copy.setDate(copy.getDate() - day + 1);
copy.setHours(12, 0, 0, 0);
return copy;
}

function isToday(date) {
return toISO(date) === toISO(initialDate);
}

function isWeekendOrHoliday(date) {
return date.getDay() === 0 || Boolean(getItalianHolidayName(date));
}

function getItalianHolidayName(date) {
const fixedHolidays = {
"01-01": "Capodanno",
"01-06": "Epifania",
"04-25": "Festa della Liberazione",
"05-01": "Festa del Lavoro",
"06-02": "Festa della Repubblica",
"08-15": "Ferragosto",
"11-01": "Tutti i Santi",
"12-08": "Immacolata Concezione",
"12-25": "Natale",
"12-26": "Santo Stefano",
};
const key = `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
if (fixedHolidays[key]) return fixedHolidays[key];

const easter = getEasterSunday(date.getFullYear());
if (toISO(date) === toISO(easter)) return "Pasqua";
if (toISO(date) === toISO(addDays(easter, 1))) return "Lunedì dell'Angelo";
return "";
}

function getEasterSunday(year) {
const a = year % 19;
const b = Math.floor(year / 100);
const c = year % 100;
const d = Math.floor(b / 4);
const e = b % 4;
const f = Math.floor((b + 8) / 25);
const g = Math.floor((b - f + 1) / 3);
const h = (19 * a + b - d - g + 15) % 30;
const i = Math.floor(c / 4);
const k = c % 4;
const l = (32 + 2 * e + 2 * i - h - k) % 7;
const m = Math.floor((a + 11 * h + 22 * l) / 451);
const month = Math.floor((h + l - 7 * m + 114) / 31);
const day = ((h + l - 7 * m + 114) % 31) + 1;
return new Date(year, month - 1, day, 12, 0, 0, 0);
}

function isSameWeek(date, weekStart) {
return toISO(startOfWeek(date)) === toISO(weekStart);
}

async function requestRoleChange(role) {
if (role === state.role) return;
if (role === "reader") {
applyRole("reader");
return;
}

if (role === "coordinator" && !isCoordinatorUnlocked()) {
openAuthModal();
return;
}
applyRole(role);
}

function isCoordinatorUnlocked() {
return Boolean(getValidAuthSession()?.access_token);
}

function openAuthModal() {
elements.authError.textContent = "";
elements.authEmail.value = "";
elements.authPassword.value = "";
elements.authModal.classList.remove("is-hidden");
elements.authModal.setAttribute("aria-hidden", "false");
window.setTimeout(() => elements.authEmail.focus({ preventScroll: true }), 0);
}

function closeAuthModal() {
elements.authModal.classList.add("is-hidden");
elements.authModal.setAttribute("aria-hidden", "true");
elements.authError.textContent = "";
elements.authEmail.value = "";
elements.authPassword.value = "";
}

async function submitCoordinatorLogin() {
const email = elements.authEmail.value.trim();
const password = elements.authPassword.value;
if (!email || !password) return;
setAuthBusy(true);
try {
const session = await signInCoordinator(email, password);
saveAuthSession(session);
closeAuthModal();
applyRole("coordinator");
await handleCoordinatorSessionChanged();
showToast("Accesso coordinatore attivo");
} catch (error) {
console.warn("Accesso coordinatore fallito", error);
elements.authError.textContent = "Email o password non corrette";
applyRole("reader");
} finally {
setAuthBusy(false);
}
}

function setAuthBusy(isBusy) {
const submit = elements.authForm.querySelector("button[type='submit']");
submit.disabled = isBusy;
submit.textContent = isBusy ? "Verifica..." : "Entra";
}

async function signInCoordinator(email, password) {
const response = await fetch(`${SUPABASE_AUTH_URL}/token?grant_type=password`, {
method: "POST",
headers: {
apikey: SUPABASE_KEY,
Authorization: `Bearer ${SUPABASE_KEY}`,
"Content-Type": "application/json",
},
body: JSON.stringify({
email,
password,
}),
});
if (!response.ok) throw new Error(`Login Supabase fallito: ${response.status}`);
return response.json();
}

function loadAuthSession() {
try {
const saved = sessionStorage.getItem(COORDINATOR_SESSION_KEY);
return saved ? JSON.parse(saved) : null;
} catch {
return null;
}
}

function saveAuthSession(session) {
if (!session?.access_token) return;
const expiresAt = Date.now() + Math.max(0, Number(session.expires_in || 3600) - 30) * 1000;
state.authSession = {
access_token: session.access_token,
refresh_token: session.refresh_token || "",
expires_at: expiresAt,
user: session.user || null,
};
sessionStorage.setItem(COORDINATOR_SESSION_KEY, JSON.stringify(state.authSession));
}

function clearAuthSession() {
state.authSession = null;
sessionStorage.removeItem(COORDINATOR_SESSION_KEY);
}

function getValidAuthSession() {
if (!state.authSession?.access_token) return null;
if (state.authSession.expires_at && Date.now() > state.authSession.expires_at) {
clearAuthSession();
return null;
}
return state.authSession;
