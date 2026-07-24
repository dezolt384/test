const items = filteredItems().filter((item) => item.date === iso && item.slot === slot).sort(compareItems);
if (items.length) {
items.forEach((item) => cell.appendChild(createCard(item)));
} else {
cell.appendChild(band.archived ? createReadonlySlot() : createEmptySlot(iso, slot));
}
row.appendChild(cell);
});

grid.appendChild(row);
});

elements.contentView.innerHTML = "";
elements.contentView.appendChild(grid);
}

function renderDay() {
const title = formatFullDate(parseDate(state.selectedDate));
const items = filteredItems().filter((item) => item.date === state.selectedDate).sort(compareItems);
renderDayList(title, items);
}

function renderAuthor() {
if (state.authorDetail) {
renderAuthorArchive(state.authorDetail);
return;
}

const weekSet = new Set(getWeekDays().map((day) => toISO(day)));
const items = filteredItems().filter((item) => weekSet.has(item.date)).sort(compareItems);
const groups = items.reduce((authorGroups, item) => {
getItemAuthors(item).forEach((author) => {
authorGroups[author] = authorGroups[author] || [];
authorGroups[author].push(item);
});
return authorGroups;
}, {});
const wrapper = document.createElement("div");
wrapper.className = "author-index";

Object.keys(groups)
.sort((a, b) => a.localeCompare(b))
.forEach((author) => {
const allItems = itemsForAuthor(author).sort(compareItems);
const nextItem = groups[author].sort(compareItems)[0];
const row = document.createElement("button");
row.type = "button";
row.className = "author-index-row";
row.innerHTML = `
<span class="author-index-name">${escapeHtml(author)}</span>
<span class="author-index-meta">${groups[author].length} questa settimana</span>
<span class="author-index-next">${escapeHtml(formatShortDate(parseDate(nextItem.date)))} · ${escapeHtml(nextItem.title.split("\n")[0])}</span>
<span class="author-index-total">${allItems.length} totali</span>
`;
row.addEventListener("click", () => {
state.authorDetail = author;
render();
});
wrapper.appendChild(row);
});

elements.contentView.innerHTML = "";
if (items.length) {
elements.contentView.appendChild(wrapper);
} else {
renderEmpty("Nessun contenuto per autore");
}
}

function renderAuthorArchive(author) {
const items = itemsForAuthor(author).sort((a, b) => b.date.localeCompare(a.date) || compareItems(a, b));
if (!items.length) {
state.authorDetail = "";
renderAuthor();
return;
}

const wrapper = document.createElement("div");
wrapper.className = "group-view";
const header = document.createElement("div");
header.className = "archive-header";
header.innerHTML = `<button class="secondary-button" type="button" data-back-authors>Tutti gli autori</button><div><span>Archivio autore</span><strong>${escapeHtml(author)}</strong></div><em>${items.length} contenuti</em>`;
header.querySelector("[data-back-authors]").addEventListener("click", () => {
state.authorDetail = "";
render();
});
wrapper.appendChild(header);

const groups = groupBy(items, (item) => item.date.slice(0, 7));
Object.keys(groups).sort().reverse().forEach((monthKey) => {
const block = document.createElement("section");
block.className = "group-block";
block.innerHTML = `<div class="group-header"><span>${escapeHtml(formatMonth(monthKey))}</span><span>${groups[monthKey].length}</span></div>`;
const list = document.createElement("div");
list.className = "group-items";
groups[monthKey].sort((a, b) => b.date.localeCompare(a.date) || compareItems(a, b)).forEach((item) => list.appendChild(createCard(item, { showDate: true })));
block.appendChild(list);
wrapper.appendChild(block);
});

elements.contentView.innerHTML = "";
elements.contentView.appendChild(wrapper);
}

function renderFilteredList(title, predicate) {
const items = filteredItems().filter(predicate).sort(compareItems);
renderList(title, items);
}

function renderSearchResults() {
const items = filteredItems().sort(compareItems);
if (!items.length) {
renderEmpty("Nessun risultato");
return;
}

const wrapper = document.createElement("div");
wrapper.className = "group-view";
const groups = groupBy(items, (item) => item.date);
Object.keys(groups).sort().forEach((date) => {
const block = document.createElement("section");
block.className = "group-block";
block.innerHTML = `<div class="group-header"><span>${escapeHtml(formatFullDate(parseDate(date)))}</span><span>${groups[date].length}</span></div>`;
const list = document.createElement("div");
list.className = "group-items";
groups[date].sort(compareItems).forEach((item) => list.appendChild(createCard(item)));
block.appendChild(list);
wrapper.appendChild(block);
});

elements.contentView.innerHTML = "";
elements.contentView.appendChild(wrapper);
}

function renderList(title, items) {
elements.contentView.innerHTML = "";
const wrapper = document.createElement("div");
wrapper.className = "list-view";
const heading = document.createElement("div");
heading.className = "group-header";
heading.innerHTML = `<span>${escapeHtml(title)}</span><span>${items.length}</span>`;
wrapper.appendChild(heading);
items.forEach((item) => wrapper.appendChild(createCard(item, { showDate: true })));

if (items.length) {
elements.contentView.appendChild(wrapper);
} else {
renderEmpty("Nessun contenuto in questa vista");
}
}

function renderDayList(title, items) {
elements.contentView.innerHTML = "";
const wrapper = document.createElement("div");
wrapper.className = "list-view";
const heading = document.createElement("div");
heading.className = "group-header day-list-header";
heading.innerHTML = `
<button class="icon-button day-step-button" type="button" data-day-shift="-1" aria-label="Giorno precedente">&lt;</button>
<span>${escapeHtml(title)}</span>
<strong>${items.length}</strong>
<button class="icon-button day-step-button" type="button" data-day-shift="1" aria-label="Giorno successivo">&gt;</button>
`;
heading.querySelectorAll("[data-day-shift]").forEach((button) => {
button.addEventListener("click", () => changeSelectedDay(Number(button.dataset.dayShift)));
});
wrapper.appendChild(heading);
items.forEach((item) => wrapper.appendChild(createCard(item)));

if (items.length) {
elements.contentView.appendChild(wrapper);
} else {
elements.contentView.appendChild(wrapper);
}
}

function renderEmpty(message) {
elements.contentView.innerHTML = `<div class="empty-state">${message}</div>`;
}

function createCard(item, options = {}) {
const fragment = elements.cardTemplate.content.cloneNode(true);
const card = fragment.querySelector(".item-card");
const context = fragment.querySelector(".card-context");
const tags = fragment.querySelector(".tag-row");
const move = fragment.querySelector(".move-button");
const edit = fragment.querySelector(".edit-button");
const del = fragment.querySelector(".delete-button");
const menuButton = fragment.querySelector(".action-menu-button");
const menu = fragment.querySelector(".card-action-menu");

card.dataset.status = item.status;
card.dataset.itemId = item.id;
card.draggable = false;
card.classList.toggle("is-draggable", canDragItems());
context.appendChild(createBandChip(item.slot));
if (options.showDate) {
context.appendChild(createDateChip(item.date));
}
const titleInfo = renderCardTitleRich(fragment.querySelector("h3"), item.title);
(item.tags || []).forEach((tag) => tags.appendChild(createTag(tag)));

card.addEventListener("pointerdown", (event) => startPointerDrag(event, item.id, card));
card.addEventListener("dragstart", (event) => startDrag(event, item.id));
card.addEventListener("dragend", () => endDrag(card));
menuButton.addEventListener("click", (event) => {
event.stopPropagation();
toggleActionMenu(menuButton, menu);
});
move.addEventListener("click", () => {
closeActionMenus();
openEditor(item, { mode: "move" });
});
edit.addEventListener("click", () => {
closeActionMenus();
openEditor(item);
});
del.addEventListener("click", () => {
closeActionMenus();
deleteItem(item.id);
});

return fragment;
}

function setupDropTarget(cell, date, slot) {
if (state.role !== "coordinator") return;
if (isMobileLayout()) return;

cell.addEventListener("dragenter", (event) => {
if (!state.draggedItemId) return;
event.preventDefault();
cell.classList.add("is-drop-target");
});

cell.addEventListener("dragover", (event) => {
if (!state.draggedItemId) return;
event.preventDefault();
event.dataTransfer.dropEffect = "move";
cell.classList.add("is-drop-target");
});

cell.addEventListener("dragleave", (event) => {
if (event.relatedTarget && cell.contains(event.relatedTarget)) return;
cell.classList.remove("is-drop-target");
});

cell.addEventListener("drop", (event) => {
event.preventDefault();
const itemId = event.dataTransfer.getData("text/plain") || state.draggedItemId;
clearDropTargets();
moveItemTo(itemId, date, slot);
});
}

function startDrag(event, itemId) {
if (!canDragItems()) {
event.preventDefault();
return;
}

state.draggedItemId = itemId;
elements.body.classList.add("is-dragging-card");
event.currentTarget.classList.add("is-dragging");
event.dataTransfer.effectAllowed = "move";
event.dataTransfer.setData("text/plain", itemId);
}

function endDrag(card) {
state.draggedItemId = "";
elements.body.classList.remove("is-dragging-card");
card.classList.remove("is-dragging");
clearDropTargets();
}

function clearDropTargets() {
document.querySelectorAll(".slot-cell.is-drop-target").forEach((cell) => cell.classList.remove("is-drop-target"));
}

function moveItemTo(itemId, date, slot) {
const item = state.items.find((entry) => entry.id === itemId);
if (!item) return;
if (item.date === date && item.slot === slot) return;

pushHistory();
item.date = date;
item.slot = slot;
applyBandFlags(item, slot);
commitState();
showToast("Contenuto spostato");
}

function startPointerDrag(event, itemId, card) {
if (!canDragItems()) return;
if (event.button !== undefined && event.button !== 0) return;
if (event.target.closest("button, input, select, textarea, label, .card-action-menu")) return;

state.pointerDrag = {
itemId,
card,
startX: event.clientX,
startY: event.clientY,
active: false,
overCell: null,
overWeekJump: null,
weekJumpTimer: null,
ghost: null,
};

document.addEventListener("pointermove", handlePointerDragMove);
document.addEventListener("pointerup", finishPointerDrag);
document.addEventListener("pointercancel", finishPointerDrag);
}

function handlePointerDragMove(event) {
const drag = state.pointerDrag;
if (!drag) return;

const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
if (!drag.active && distance < 6) return;

if (!drag.active) {
drag.active = true;
state.draggedItemId = drag.itemId;
elements.body.classList.add("is-dragging-card");
drag.card.classList.add("is-dragging");
createDragGhost(drag, event);
}

event.preventDefault();
updateDragGhost(drag, event);
const hovered = document.elementFromPoint(event.clientX, event.clientY);
const weekJump = hovered?.closest(".week-jump-target");
const target = hovered?.closest(".slot-cell");
clearDropTargets();
clearWeekJumpTargets();

if (weekJump) {
scheduleWeekJump(drag, weekJump);
drag.overCell = null;
} else if (target) {
cancelWeekJump(drag);
target.classList.add("is-drop-target");
drag.overCell = target;
} else {
cancelWeekJump(drag);
drag.overCell = null;
}
}

function finishPointerDrag(event) {
document.removeEventListener("pointermove", handlePointerDragMove);
document.removeEventListener("pointerup", finishPointerDrag);
document.removeEventListener("pointercancel", finishPointerDrag);

const drag = state.pointerDrag;
state.pointerDrag = null;
state.draggedItemId = "";
elements.body.classList.remove("is-dragging-card");
clearDropTargets();
clearWeekJumpTargets();

if (!drag) return;
const weekJumpDelta = drag.active && event.type === "pointerup" && drag.overWeekJump ? Number(drag.overWeekJump.dataset.weekJump) : 0;
cancelWeekJump(drag);
drag.card.classList.remove("is-dragging");
drag.ghost?.remove();

const target = drag.active && event.type === "pointerup" ? drag.overCell : null;
if (!target && weekJumpDelta) {
moveItemByWeek(drag.itemId, weekJumpDelta);
return;
}
if (!target) return;

moveItemTo(drag.itemId, target.dataset.date, target.dataset.slot);
}

function moveItemByWeek(itemId, delta) {
const item = state.items.find((entry) => entry.id === itemId);
if (!item) return;
pushHistory();
item.date = toISO(addDays(parseDate(item.date), delta));
applyBandFlags(item, item.slot);
commitState({ keepWeek: true });
changeWeek(delta);
showToast("Contenuto spostato");
}

function createDragGhost(drag, event) {
const ghost = drag.card.cloneNode(true);
ghost.classList.add("drag-ghost");
ghost.style.width = `${drag.card.getBoundingClientRect().width}px`;
document.body.appendChild(ghost);
drag.ghost = ghost;
updateDragGhost(drag, event);
}

function updateDragGhost(drag, event) {
if (!drag.ghost) return;
drag.ghost.style.transform = `translate(${event.clientX + 12}px, ${event.clientY + 12}px)`;
}

function scheduleWeekJump(drag, target) {
const delta = Number(target.dataset.weekJump);
if (!delta) return;

target.classList.add("is-week-drop-target");
if (drag.overWeekJump === target && drag.weekJumpTimer) return;

cancelWeekJump(drag);
drag.overWeekJump = target;
drag.weekJumpTimer = window.setTimeout(() => {
if (state.pointerDrag !== drag || drag.overWeekJump !== target) return;
changeWeek(delta, { keepDrag: true });
drag.overCell = null;
clearWeekJumpTargets();
drag.weekJumpTimer = null;
drag.overWeekJump = null;
}, 550);
