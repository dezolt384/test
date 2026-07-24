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

function createEmptySlot(date, slot) {
if (state.role === "coordinator") {
const button = document.createElement("button");
button.type = "button";
button.className = "empty-slot";
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

const empty = document.createElement("div");
empty.className = "empty-slot is-readonly";
return empty;
}

function createReadonlySlot() {
const empty = document.createElement("div");
empty.className = "empty-slot is-readonly";
empty.textContent = "Archivio";
return empty;
}

function createTag(label) {
const tag = document.createElement("span");
tag.className = "tag";
tag.textContent = label;
return tag;
}

function createBandChip(slot) {
const band = getBand(slot);
const chip = document.createElement("span");
chip.className = "band-chip";
chip.textContent = band.title;
return chip;
}

function createDateChip(date) {
const chip = document.createElement("span");
chip.className = "date-chip";
chip.textContent = formatFullDate(parseDate(date));
return chip;
}

function filteredItems() {
return state.items.filter((item) => {
const searchable = [item.title, item.author, ...getTitleAuthors(item.title), ...(item.tags || [])].join(" ").toLowerCase();
const matchesSearch =
!state.query ||
searchable.includes(state.query);
return matchesSearch;
});
}

function isMeetingItem(item) {
const tags = (item.tags || []).map((tag) => tag.toLocaleLowerCase("it-IT"));
return item.slot === "riunioni" || tags.includes("riunioni") || tags.includes("riunione");
}

function isLiveItem(item) {
return item.live || item.slot === "dirette";
}

function isAppointmentItem(item) {
return item.appointment || item.slot === "appuntamento";
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
elements.moveShortcuts.classList.toggle("is-hidden", options.mode !== "move");
elements.itemId.value = item.id || "";
elements.itemTitle.value = item.title || "";
elements.itemDate.value = item.date || state.selectedDate;
elements.itemSlot.value = getBand(item.slot).id;
renderBandOptions();
elements.itemTag.value = formatTags(item.tags || []);
if (options.mode === "move") elements.itemDate.focus({ preventScroll: true });
else elements.itemTitle.focus({ preventScroll: true });
}

function closeEditor() {
elements.editorPanel.classList.add("is-hidden");
elements.moveShortcuts.classList.add("is-hidden");
if (isAllSidePanelsClosed()) elements.body.classList.remove("editor-open");
}

function shiftEditorDate(delta) {
const baseDate = elements.itemDate.value || state.selectedDate;
elements.itemDate.value = toISO(addDays(parseDate(baseDate), delta));
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
elements.itemDate.value = state.selectedDate;
elements.itemSlot.value = getActiveBands()[0]?.id || getBands()[0].id;
elements.itemTag.value = "";
elements.formTitle.textContent = "Nuovo contenuto";
}

function deleteItem(id) {
pushHistory();
state.items = state.items.filter((item) => item.id !== id);
commitState();
showToast("Contenuto eliminato");
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
return state.items.filter((item) => item.date === date).length;
}

function compareItems(a, b) {
return a.date.localeCompare(b.date) || getBandIndex(a.slot) - getBandIndex(b.slot) || a.title.localeCompare(b.title);
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
}
