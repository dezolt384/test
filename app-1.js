const STORAGE_KEY = "redazione-dashboard-v3";
const BAND_STORAGE_KEY = "redazione-dashboard-bands-v1";
const AUTHOR_STORAGE_KEY = "redazione-dashboard-authors-v1";
const SUPABASE_REST_URL = "https://epmmfqukauuqgqegaezp.supabase.co/rest/v1";
const SUPABASE_KEY = "sb_publishable_ICKsll82Tawld3iIvtWJpg_D2Ob164z";
const SUPABASE_AUTH_URL = SUPABASE_REST_URL.replace(/\/rest\/v1\/?$/, "/auth/v1");
const REMOTE_STATE_ID = "main";
const REMOTE_SYNC_INTERVAL = 12000;
const COORDINATOR_SESSION_KEY = "redazione-coordinator-auth-session";

const initialItems = [];

const defaultAuthors = uniqueAuthors(initialItems.flatMap((item) => [item.author, ...getTitleAuthors(item.title)]));

const defaultBands = [
{ id: "07:00", title: "APERTURA ORE 7", top: "APERTURA", bottom: "ORE 7", chip: "Apertura 7", bg: "#eefaf7", line: "#178f84", ink: "#0d5e58" },
{ id: "11:00", title: "APERTURA ORE 11", top: "APERTURA", bottom: "ORE 11", chip: "Apertura 11", bg: "#eef4ff", line: "#315fba", ink: "#244886" },
{ id: "13:00", title: "APERTURA ORE 13", top: "APERTURA", bottom: "ORE 13", chip: "Apertura 13", bg: "#fff6df", line: "#b56b11", ink: "#79460a" },
{ id: "16:00", title: "APERTURA ORE 16", top: "APERTURA", bottom: "ORE 16", chip: "Apertura 16", bg: "#ffece9", line: "#c64236", ink: "#8c2d25" },
{ id: "18:00", title: "APERTURA ORE 18", top: "APERTURA", bottom: "ORE 18", chip: "Apertura 18", bg: "#edf7ed", line: "#28754e", ink: "#1d5739" },
{ id: "appuntamento", title: "APPUNTAMENTI", top: "AGENDA", bottom: "APPUNTAMENTI", chip: "Appuntamento", bg: "#f2eefb", line: "#6b5fb8", ink: "#473f82" },
{ id: "dirette", title: "DIRETTE", top: "LIVE", bottom: "DIRETTE", chip: "Diretta", bg: "#eef7ff", line: "#147ca8", ink: "#0d5574" },
{ id: "note", title: "NOTE", top: "DESK", bottom: "NOTE", chip: "Nota", bg: "#f6f1e8", line: "#8b7355", ink: "#5c4932" },
];

const customBandPalette = [
{ bg: "#f1f8e9", line: "#689f38", ink: "#42651f" },
{ bg: "#fff3e0", line: "#ef8f18", ink: "#8a510b" },
{ bg: "#fce4ec", line: "#c74d7f", ink: "#7a2e4e" },
{ bg: "#e8f5f9", line: "#2196a3", ink: "#17656d" },
{ bg: "#f0f0ff", line: "#7270c5", ink: "#45427d" },
];

const dayNames = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
const monthNames = [
"gennaio",
"febbraio",
"marzo",
"aprile",
"maggio",
"giugno",
"luglio",
"agosto",
"settembre",
"ottobre",
"novembre",
"dicembre",
];

const initialDate = new Date();
initialDate.setHours(12, 0, 0, 0);

const loadedItems = loadItems();

const state = {
items: loadedItems,
bands: loadBands(loadedItems),
authors: loadAuthors(),
bandEditId: "",
pendingBandRemoval: null,
undoStack: [],
redoStack: [],
toastTimer: 0,
remoteLoaded: false,
remoteSaving: false,
remoteSaveTimer: 0,
remoteUpdatedAt: "",
authSession: loadAuthSession(),
currentWeekStart: startOfWeek(initialDate),
selectedDate: toISO(initialDate),
view: "week",
role: "reader",
query: "",
status: "all",
authorDetail: "",
draggedItemId: "",
draggedBandId: "",
pointerDrag: null,
bandPointerDrag: null,
};

const elements = {
body: document.body,
weekTitle: document.querySelector("#weekTitle"),
todayButton: document.querySelector("#todayButton"),
dayStrip: document.querySelector("#dayStrip"),
yearButtons: document.querySelector("#yearButtons"),
contentView: document.querySelector("#contentView"),
statTotal: document.querySelector("#statTotal"),
statLive: document.querySelector("#statLive"),
statAssigned: document.querySelector("#statAssigned"),
searchInput: document.querySelector("#searchInput"),
editorPanel: document.querySelector("#editorPanel"),
form: document.querySelector("#itemForm"),
formTitle: document.querySelector("#formTitle"),
itemId: document.querySelector("#itemId"),
itemTitle: document.querySelector("#itemTitle"),
itemDate: document.querySelector("#itemDate"),
itemSlot: document.querySelector("#itemSlot"),
moveShortcuts: document.querySelector("#moveShortcuts"),
itemTag: document.querySelector("#itemTag"),
cardTemplate: document.querySelector("#itemCardTemplate"),
undoButton: document.querySelector("#undoButton"),
redoButton: document.querySelector("#redoButton"),
manageBandsButton: document.querySelector("#manageBandsButton"),
bandPanel: document.querySelector("#bandPanel"),
bandForm: document.querySelector("#bandForm"),
bandName: document.querySelector("#bandName"),
bandColor: document.querySelector("#bandColor"),
bandList: document.querySelector("#bandList"),
bandContext: document.querySelector("#bandContext"),
bandHistoryNote: document.querySelector("#bandHistoryNote"),
closeBands: document.querySelector("#closeBands"),
bandRemovalModal: document.querySelector("#bandRemovalModal"),
bandRemovalForm: document.querySelector("#bandRemovalForm"),
bandRemovalSummary: document.querySelector("#bandRemovalSummary"),
bandRemovalWhen: document.querySelector("#bandRemovalWhen"),
bandRemovalTarget: document.querySelector("#bandRemovalTarget"),
bandRemovalImpact: document.querySelector("#bandRemovalImpact"),
closeBandRemoval: document.querySelector("#closeBandRemoval"),
cancelBandRemoval: document.querySelector("#cancelBandRemoval"),
toast: document.querySelector("#toast"),
authModal: document.querySelector("#authModal"),
authForm: document.querySelector("#authForm"),
authEmail: document.querySelector("#authEmail"),
authPassword: document.querySelector("#authPassword"),
authError: document.querySelector("#authError"),
closeAuth: document.querySelector("#closeAuth"),
cancelAuth: document.querySelector("#cancelAuth"),
};

document.querySelector("#homeButton").addEventListener("click", () => goHome());
document.querySelector("#prevWeek").addEventListener("click", () => changeWeek(-7));
document.querySelector("#nextWeek").addEventListener("click", () => changeWeek(7));
elements.todayButton.addEventListener("click", () => goToday());
document.querySelector("#newItemButton").addEventListener("click", () => openEditor());
elements.manageBandsButton.addEventListener("click", () => openBandManager());
document.querySelector("#closeEditor").addEventListener("click", () => closeEditor());
elements.closeBands.addEventListener("click", () => closeBandManager());
document.querySelector("#resetForm").addEventListener("click", () => resetForm());
elements.undoButton.addEventListener("click", () => undo());
elements.redoButton.addEventListener("click", () => redo());
document.addEventListener("click", (event) => closeActionMenus(event.target));
document.addEventListener("keydown", (event) => {
if (event.key === "Escape") closeActionMenus();
});

document.querySelectorAll(".tab").forEach((button) => {
button.addEventListener("click", () => {
if (button.dataset.view !== "author") state.authorDetail = "";
state.view = button.dataset.view;
document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("is-active", tab === button));
render();
});
});

document.querySelectorAll(".role-button").forEach((button) => {
button.addEventListener("click", () => requestRoleChange(button.dataset.role));
});

elements.authForm.addEventListener("submit", (event) => {
event.preventDefault();
submitCoordinatorLogin();
});
elements.closeAuth.addEventListener("click", () => closeAuthModal());
elements.cancelAuth.addEventListener("click", () => closeAuthModal());
elements.closeBandRemoval.addEventListener("click", () => closeBandRemovalModal());
elements.cancelBandRemoval.addEventListener("click", () => closeBandRemovalModal());
elements.bandRemovalWhen.addEventListener("change", () => updateBandRemovalDialog());
elements.bandRemovalForm.addEventListener("submit", (event) => {
event.preventDefault();
confirmBandRemoval();
});

elements.searchInput.addEventListener("input", (event) => {
state.query = event.target.value.trim().toLowerCase();
render();
});

elements.itemTag.addEventListener("change", () => {
elements.itemTag.value = parseTags(elements.itemTag.value).join(", ");
});
elements.itemDate.addEventListener("change", () => renderBandOptions());

document.querySelectorAll("[data-week-shift]").forEach((button) => {
button.addEventListener("click", () => shiftEditorDate(Number(button.dataset.weekShift)));
});

elements.form.addEventListener("submit", (event) => {
event.preventDefault();
pushHistory();
const existingItem = state.items.find((item) => item.id === elements.itemId.value);
const keepsPosition =
existingItem &&
existingItem.date === elements.itemDate.value &&
existingItem.slot === elements.itemSlot.value;
const formItem = {
id: elements.itemId.value || createId(),
title: elements.itemTitle.value.trim(),
date: elements.itemDate.value,
slot: elements.itemSlot.value,
author: "",
status: getExistingStatus(elements.itemId.value),
tags: parseTags(elements.itemTag.value),
live: false,
appointment: false,
order: keepsPosition ? getItemOrder(existingItem) : getNextItemOrder(elements.itemDate.value, elements.itemSlot.value),
_version: existingItem?._version || 0,
_updatedAt: existingItem?._updatedAt || "",
_updatedBy: existingItem?._updatedBy || "",
};
applyBandFlags(formItem, formItem.slot);

const existingIndex = state.items.findIndex((item) => item.id === formItem.id);
if (existingIndex >= 0) {
state.items.splice(existingIndex, 1, formItem);
} else {
state.items.push(formItem);
}

resetForm();
state.selectedDate = formItem.date;
state.currentWeekStart = startOfWeek(parseDate(formItem.date));
commitState();
closeEditor();
showToast(existingIndex >= 0 ? "Contenuto aggiornato" : "Contenuto salvato");
});

elements.bandForm.addEventListener("submit", (event) => {
event.preventDefault();
pushHistory();
addBand(elements.bandName.value);
});

renderBandOptions();
applyRole(isCoordinatorUnlocked() ? "coordinator" : "reader", { renderView: false });
render();
initRemoteState();

function render() {
const weekDays = getWeekDays();
elements.weekTitle.textContent = formatWeekRange(weekDays);
elements.todayButton.classList.toggle("is-active", isSameWeek(initialDate, state.currentWeekStart));
renderYearNavigator();
renderStats(weekDays);
renderDayStrip(weekDays);
elements.dayStrip.classList.toggle("is-hidden", state.view === "week");

if (state.query) {
renderSearchResults();
return;
}

if (state.view === "week") renderWeek(weekDays);
if (state.view === "day") renderDay();
if (state.view === "author") renderAuthor();
if (state.view === "live") renderContentArchive("Dirette", isLiveItem);
if (state.view === "appointments") renderContentArchive("Appuntamenti", isAppointmentItem);
if (state.view === "meetings") renderContentArchive("Riunioni", isMeetingItem);
}

function renderStats(weekDays) {
if (!elements.statTotal || !elements.statLive || !elements.statAssigned) return;
const weekSet = new Set(weekDays.map((day) => toISO(day)));
const weekItems = state.items.filter((item) => weekSet.has(item.date));
elements.statTotal.textContent = weekItems.length;
elements.statLive.textContent = weekItems.filter((item) => item.live).length;
elements.statAssigned.textContent = weekItems.filter((item) => item.status === "assegnato").length;
}

function renderDayStrip(weekDays) {
elements.dayStrip.innerHTML = "";
weekDays.forEach((day, index) => {
const iso = toISO(day);
const button = document.createElement("button");
button.type = "button";
button.className = "day-chip";
button.classList.toggle("is-active", state.selectedDate === iso);
button.classList.toggle("is-today", isToday(day));
button.classList.toggle("is-nonworking-day", isWeekendOrHoliday(day));
button.title = getItalianHolidayName(day) || (day.getDay() === 6 ? "Sabato" : day.getDay() === 0 ? "Domenica" : "");
button.innerHTML = `<strong>${dayNames[index]} ${day.getDate()}</strong>`;
button.addEventListener("click", () => {
state.selectedDate = iso;
if (state.view === "week") {
state.view = "day";
document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("is-active", tab.dataset.view === "day"));
}
render();
});
elements.dayStrip.appendChild(button);
});
}

function renderWeek(weekDays) {
const grid = document.createElement("div");
grid.className = "week-table";

const header = document.createElement("div");
header.className = "week-header";
header.innerHTML = '<div class="week-corner"></div>';
weekDays.forEach((day, index) => {
const iso = toISO(day);
const dayButton = document.createElement("button");
dayButton.type = "button";
dayButton.className = "week-day-head";
dayButton.classList.toggle("is-active", state.selectedDate === iso);
dayButton.classList.toggle("is-today", isToday(day));
dayButton.classList.toggle("is-nonworking-day", isWeekendOrHoliday(day));
dayButton.title = getItalianHolidayName(day) || (day.getDay() === 6 ? "Sabato" : day.getDay() === 0 ? "Domenica" : "");
dayButton.innerHTML = `<strong>${dayNames[index]} ${day.getDate()}</strong>`;
dayButton.addEventListener("click", () => {
state.selectedDate = iso;
state.view = "day";
document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("is-active", tab.dataset.view === "day"));
render();
});
header.appendChild(dayButton);
});
grid.appendChild(header);

const visibleBands = getBandsForDate(toISO(weekDays[0]));
visibleBands.forEach((band, bandIndex) => {
const slot = band.id;
const row = document.createElement("section");
row.className = "week-row";
row.dataset.slot = slot;
applyBandStyle(row, band, bandIndex);

const label = document.createElement("div");
label.className = "slot-label";
label.dataset.slot = slot;
label.innerHTML = `<span>${escapeHtml(band.top)}</span><strong>${escapeHtml(band.bottom)}</strong>`;
row.appendChild(label);

weekDays.forEach((day, index) => {
const iso = toISO(day);
const cell = document.createElement("div");
cell.className = "slot-cell";
cell.dataset.slot = slot;
cell.dataset.date = iso;
cell.innerHTML = `<p class="mobile-day-label">${dayNames[index]} ${day.getDate()} ${monthNames[day.getMonth()]}</p>`;
setupDropTarget(cell, iso, slot);
