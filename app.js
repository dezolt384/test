const ITEM_KEY = "redazione-dashboard-v3";
const BAND_KEY = "redazione-dashboard-bands-v1";
const AUTHOR_KEY = "redazione-dashboard-authors-v1";

const dayNames = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
const monthNames = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];

const seedItems = [
  { id: "c-001", title: "Salute, intervista Barbaresi", date: "2026-06-10", slot: "07:00", author: "Lisi", status: "assegnato", tags: ["salute"] },
  { id: "c-002", title: "Autonomia differenziata", date: "2026-06-10", slot: "11:00", author: "Lisi", status: "idea", tags: ["politica"] },
  { id: "c-003", title: "Sciopero cultura", date: "2026-06-13", slot: "07:00", author: "Marrone", status: "assegnato", tags: ["sindacato"] },
  { id: "c-004", title: "Diretta Pozzallo Fillea", date: "2026-06-13", slot: "dirette", author: "Redazione", status: "assegnato", tags: ["live"] },
  { id: "c-005", title: "Novita AI", date: "2026-06-13", slot: "11:00", author: "De Luca", status: "pubblicato", tags: ["tecnologia"] },
  { id: "c-006", title: "- Graphic novel Becco Giallo - Pallara\n- Recensione - Sbaraglia\n- Collettiva talk - Fama", date: "2026-06-14", slot: "07:00", author: "", status: "idea", tags: ["linea editoriale"] },
  { id: "c-007", title: "Mimit, confronto Conforama", date: "2026-06-11", slot: "appuntamento", author: "Desk", status: "assegnato", tags: ["agenda"] },
  { id: "c-008", title: "Video verticale presidio cultura", date: "2026-06-12", slot: "16:00", author: "Marrone", status: "annullato", tags: ["video"] },
];

const seedBands = [
  band("07:00", "APERTURA ORE 7", "#eefaf7", "#178f84", "#0d5e58"),
  band("11:00", "APERTURA ORE 11", "#eef4ff", "#315fba", "#244886"),
  band("13:00", "APERTURA ORE 13", "#fff6df", "#b56b11", "#79460a"),
  band("16:00", "APERTURA ORE 16", "#ffece9", "#c64236", "#8c2d25"),
  band("18:00", "APERTURA ORE 18", "#edf7ed", "#28754e", "#1d5739"),
  band("appuntamento", "APPUNTAMENTI", "#f2eefb", "#6b5fb8", "#473f82"),
  band("dirette", "DIRETTE", "#eef7ff", "#147ca8", "#0d5574"),
  band("note", "NOTE", "#f6f1e8", "#8b7355", "#5c4932"),
];

const state = {
  items: load(ITEM_KEY, seedItems),
  bands: load(BAND_KEY, seedBands),
  authors: load(AUTHOR_KEY, ["De Luca", "Desk", "Lisi", "Marrone", "Pallara", "Redazione", "Sbaraglia"]),
  weekStart: startOfWeek(new Date("2026-06-10T12:00:00")),
  selectedDate: "2026-06-10",
  view: "week",
  status: "all",
  query: "",
  role: "coordinator",
  undo: [],
  redo: [],
};

const el = {
  body: document.body,
  weekTitle: q("#weekTitle"),
  dayStrip: q("#dayStrip"),
  content: q("#contentView"),
  form: q("#itemForm"),
  editor: q("#editorPanel"),
  formTitle: q("#formTitle"),
  itemId: q("#itemId"),
  title: q("#itemTitle"),
  date: q("#itemDate"),
  slot: q("#itemSlot"),
  authorSelect: q("#itemAuthorSelect"),
  author: q("#itemAuthor"),
  status: q("#itemStatus"),
  tag: q("#itemTag"),
  tags: q("#itemTags"),
  cardTemplate: q("#itemCardTemplate"),
  authorPanel: q("#authorPanel"),
  authorForm: q("#authorForm"),
  authorName: q("#authorName"),
  authorList: q("#authorList"),
  bandPanel: q("#bandPanel"),
  bandForm: q("#bandForm"),
  bandName: q("#bandName"),
  bandColor: q("#bandColor"),
  bandList: q("#bandList"),
  undoButton: q("#undoButton"),
  redoButton: q("#redoButton"),
};

q("#prevWeek").onclick = () => changeWeek(-7);
q("#nextWeek").onclick = () => changeWeek(7);
q("#newItemButton").onclick = () => openEditor();
q("#closeEditor").onclick = closeEditor;
q("#resetForm").onclick = resetForm;
q("#manageAuthorsButton").onclick = openAuthors;
q("#manageBandsButton").onclick = openBands;
q("#closeAuthors").onclick = () => el.authorPanel.classList.add("is-hidden");
q("#closeBands").onclick = () => el.bandPanel.classList.add("is-hidden");
el.undoButton.onclick = undo;
el.redoButton.onclick = redo;

qa(".tab").forEach((button) => button.onclick = () => setView(button.dataset.view));
qa(".role-button").forEach((button) => button.onclick = () => setRole(button.dataset.role));
q("#searchInput").oninput = (event) => { state.query = event.target.value.trim().toLowerCase(); render(); };
q("#statusFilter").onchange = (event) => { state.status = event.target.value; render(); };
el.authorSelect.onchange = () => { if (el.authorSelect.value) el.author.value = el.authorSelect.value; };
el.tag.onkeydown = (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  el.tags.value = tags([...parseTags(el.tags.value), el.tag.value]).join(", ");
  el.tag.value = "";
};

el.form.onsubmit = (event) => {
  event.preventDefault();
  remember();
  const item = {
    id: el.itemId.value || `c-${Date.now()}`,
    title: el.title.value.trim(),
    date: el.date.value,
    slot: el.slot.value,
    author: (el.authorSelect.value || el.author.value).trim(),
    status: el.status.value,
    tags: parseTags(el.tags.value),
  };
  const index = state.items.findIndex((entry) => entry.id === item.id);
  if (index >= 0) state.items.splice(index, 1, item);
  else state.items.push(item);
  addAuthors([item.author]);
  saveAll();
  closeEditor();
};

el.authorForm.onsubmit = (event) => {
  event.preventDefault();
  remember();
  addAuthors([el.authorName.value]);
  el.authorName.value = "";
  saveAll();
  renderAuthors();
};

el.bandForm.onsubmit = (event) => {
  event.preventDefault();
  const name = el.bandName.value.trim().toUpperCase();
  if (!name) return;
  remember();
  state.bands.push(band(slug(name), name, el.bandColor.value || "#eefaf7"));
  el.bandName.value = "";
  saveAll();
  renderBands();
};

renderOptions();
render();

function render() {
  const days = weekDays();
  el.weekTitle.textContent = weekTitle(days);
  el.dayStrip.classList.toggle("is-hidden", state.view === "week");
  renderDayStrip(days);
  if (state.view === "week") renderWeek(days);
  if (state.view === "day") renderList(fullDate(parseISO(state.selectedDate)), filtered().filter((item) => item.date === state.selectedDate));
  if (state.view === "author") renderGroups();
  if (state.view === "live") renderList("Dirette", filtered().filter((item) => item.slot === "dirette"));
  if (state.view === "appointments") renderList("Appuntamenti", filtered().filter((item) => item.slot === "appuntamento"));
  updateHistory();
}

function renderDayStrip(days) {
  el.dayStrip.replaceChildren(...days.map((day, index) => {
    const iso = toISO(day);
    const button = node("button", "day-chip");
    button.type = "button";
    button.classList.toggle("is-active", iso === state.selectedDate);
    button.innerHTML = `<strong>${dayNames[index]} ${day.getDate()}</strong><span>${state.items.filter((item) => item.date === iso).length}</span>`;
    button.onclick = () => { state.selectedDate = iso; setView("day"); };
    return button;
  }));
}

function renderWeek(days) {
  const table = node("div", "week-table");
  const header = node("div", "week-header");
  header.innerHTML = `<div class="week-corner"></div>`;
  days.forEach((day, index) => {
    const iso = toISO(day);
    const button = node("button", "week-day-head");
    button.type = "button";
    button.innerHTML = `<strong>${dayNames[index]} ${day.getDate()}</strong><span>${state.items.filter((item) => item.date === iso).length}</span>`;
    button.onclick = () => { state.selectedDate = iso; setView("day"); };
    header.append(button);
  });
  table.append(header);

  state.bands.forEach((bandInfo, bandIndex) => {
    const row = node("section", "week-row");
    row.dataset.slot = bandInfo.id;
    styleBand(row, bandInfo, bandIndex);
    row.innerHTML = `<div class="slot-label" data-slot="${bandInfo.id}"><span>${escape(splitTitle(bandInfo.title).top)}</span><strong>${escape(splitTitle(bandInfo.title).bottom)}</strong></div>`;
    days.forEach((day, index) => {
      const iso = toISO(day);
      const cell = node("div", "slot-cell");
      cell.dataset.date = iso;
      cell.dataset.slot = bandInfo.id;
      cell.innerHTML = `<p class="mobile-day-label">${dayNames[index]} ${day.getDate()} ${monthNames[day.getMonth()]}</p>`;
      const matches = filtered().filter((item) => item.date === iso && item.slot === bandInfo.id).sort(sortItems);
      if (matches.length) matches.forEach((item) => cell.append(card(item)));
      else cell.append(emptySlot(iso, bandInfo.id));
      row.append(cell);
    });
    table.append(row);
  });
  el.content.replaceChildren(table);
}

function renderList(title, items) {
  const wrap = node("div", "list-view");
  wrap.innerHTML = `<div class="group-header"><span>${escape(title)}</span><span>${items.length}</span></div>`;
  items.sort(sortItems).forEach((item) => wrap.append(card(item)));
  el.content.replaceChildren(items.length ? wrap : emptyState("Nessun contenuto in questa vista"));
}

function renderGroups() {
  const wrap = node("div", "group-view");
  const groups = {};
  filtered().forEach((item) => (groups[item.author || "Senza autore"] ??= []).push(item));
  Object.keys(groups).sort().forEach((author) => {
    const block = node("section", "group-block");
    block.innerHTML = `<div class="group-header"><span>${escape(author)}</span><span>${groups[author].length}</span></div>`;
    const list = node("div", "group-items");
    groups[author].sort(sortItems).forEach((item) => list.append(card(item)));
    block.append(list);
    wrap.append(block);
  });
  el.content.replaceChildren(Object.keys(groups).length ? wrap : emptyState("Nessun contenuto per autore"));
}

function card(item) {
  const fragment = el.cardTemplate.content.cloneNode(true);
  const cardNode = fragment.querySelector(".item-card");
  cardNode.dataset.status = item.status;
  fragment.querySelector(".time-chip").textContent = getBand(item.slot).chip;
  const status = fragment.querySelector(".status-pill");
  status.textContent = cap(item.status);
  status.dataset.status = item.status;
  fragment.querySelector("h3").textContent = item.title;
  fragment.querySelector(".meta-line").textContent = item.author ? `Autore: ${item.author}` : "Senza autore";
  item.tags.forEach((tag) => fragment.querySelector(".tag-row").append(Object.assign(node("span", "tag"), { textContent: tag })));
  fragment.querySelector(".edit-button").onclick = () => openEditor(item);
  fragment.querySelector(".delete-button").onclick = () => { remember(); state.items = state.items.filter((entry) => entry.id !== item.id); saveAll(); };
  return fragment;
}

function emptySlot(date, slot) {
  const button = node("button", "empty-slot");
  button.type = "button";
  button.textContent = state.role === "reader" ? "Vuoto" : "+ Aggiungi";
  if (state.role !== "reader") button.onclick = () => openEditor({ date, slot });
  else button.classList.add("is-readonly");
  return button;
}

function openEditor(item = {}) {
  if (state.role === "reader") return;
  el.itemId.value = item.id || "";
  el.title.value = item.title || "";
  el.date.value = item.date || state.selectedDate;
  el.slot.value = item.slot || state.bands[0].id;
  el.author.value = item.author || "";
  el.authorSelect.value = state.authors.includes(item.author) ? item.author : "";
  el.status.value = item.status || "assegnato";
  el.tags.value = (item.tags || []).join(", ");
  el.formTitle.textContent = item.id ? "Modifica contenuto" : "Nuovo contenuto";
  closeManagers();
  el.editor.classList.remove("is-hidden");
  document.body.classList.add("editor-open");
}

function closeEditor() {
  el.editor.classList.add("is-hidden");
  document.body.classList.remove("editor-open");
  resetForm();
}

function resetForm() {
  el.form.reset();
  el.itemId.value = "";
  el.date.value = state.selectedDate;
  el.slot.value = state.bands[0].id;
}

function openAuthors() { closeEditor(); el.authorPanel.classList.remove("is-hidden"); renderAuthors(); }
function openBands() { closeEditor(); el.bandPanel.classList.remove("is-hidden"); renderBands(); }
function closeManagers() { el.authorPanel.classList.add("is-hidden"); el.bandPanel.classList.add("is-hidden"); }

function renderAuthors() {
  el.authorList.replaceChildren(...state.authors.map((author) => {
    const row = node("div", "author-row");
    row.innerHTML = `<strong>${escape(author)}</strong>`;
    const remove = Object.assign(node("button", "mini-button"), { type: "button", textContent: "Rimuovi" });
    remove.onclick = () => { remember(); state.authors = state.authors.filter((entry) => entry !== author); saveAll(); renderAuthors(); };
    row.append(remove);
    return row;
  }));
}

function renderBands() {
  el.bandList.replaceChildren(...state.bands.map((bandInfo, index) => {
    const row = node("div", "band-row");
    styleBand(row, bandInfo, index);
    row.innerHTML = `<span class="band-marker"></span><div class="band-row-text"><strong>${escape(bandInfo.title)}</strong></div>`;
    const remove = Object.assign(node("button", "mini-button"), { type: "button", textContent: "Rimuovi", disabled: state.bands.length <= 1 });
    remove.onclick = () => { remember(); removeBand(bandInfo.id); saveAll(); renderBands(); };
    row.append(remove);
    return row;
  }));
}

function renderOptions() {
  el.slot.replaceChildren(...state.bands.map((entry) => Object.assign(node("option"), { value: entry.id, textContent: entry.title })));
  el.authorSelect.replaceChildren(Object.assign(node("option"), { value: "", textContent: "Scrivi a mano" }), ...state.authors.map((author) => Object.assign(node("option"), { value: author, textContent: author })));
}

function setView(view) {
  state.view = view;
  qa(".tab").forEach((button) => button.classList.toggle("is-active", button.dataset.view === view));
  render();
}

function setRole(role) {
  state.role = role;
  qa(".role-button").forEach((button) => button.classList.toggle("is-active", button.dataset.role === role));
  el.body.classList.toggle("reader-mode", role === "reader");
  if (role === "reader") { closeEditor(); closeManagers(); }
  render();
}

function filtered() {
  return state.items.filter((item) => {
    const haystack = `${item.title} ${item.author} ${item.tags.join(" ")}`.toLowerCase();
    return (state.status === "all" || item.status === state.status) && (!state.query || haystack.includes(state.query));
  });
}

function changeWeek(days) { state.weekStart = addDays(state.weekStart, days); state.selectedDate = toISO(addDays(parseISO(state.selectedDate), days)); render(); }
function remember() { state.undo.push(snapshot()); state.redo = []; }
function undo() { const prev = state.undo.pop(); if (!prev) return; state.redo.push(snapshot()); restore(prev); }
function redo() { const next = state.redo.pop(); if (!next) return; state.undo.push(snapshot()); restore(next); }
function snapshot() { return JSON.stringify({ items: state.items, bands: state.bands, authors: state.authors }); }
function restore(raw) { Object.assign(state, JSON.parse(raw)); saveAll(); }
function updateHistory() { el.undoButton.disabled = !state.undo.length; el.redoButton.disabled = !state.redo.length; }
function saveAll() { localStorage.setItem(ITEM_KEY, JSON.stringify(state.items)); localStorage.setItem(BAND_KEY, JSON.stringify(state.bands)); localStorage.setItem(AUTHOR_KEY, JSON.stringify(state.authors)); renderOptions(); render(); }
function addAuthors(values) { state.authors = tags([...state.authors, ...values]).sort((a, b) => a.localeCompare(b, "it-IT")); }
function removeBand(id) { const fallback = state.bands.find((entry) => entry.id !== id); state.items.forEach((item) => { if (item.slot === id) item.slot = fallback.id; }); state.bands = state.bands.filter((entry) => entry.id !== id); }
function getBand(id) { return state.bands.find((entry) => entry.id === id) || state.bands[0]; }
function band(id, title, bg = "#eefaf7", line = shade(bg, -18), ink = shade(bg, -46)) { const parts = splitTitle(title); return { id, title, top: parts.top, bottom: parts.bottom, chip: cap(title.toLowerCase()).slice(0, 24), bg, line, ink }; }
function styleBand(target, entry) { target.style.setProperty("--slot-bg", entry.bg); target.style.setProperty("--slot-line", entry.line); target.style.setProperty("--slot-ink", entry.ink); }
function splitTitle(title) { const words = title.split(" "); return words.length === 1 ? { top: "", bottom: title } : { top: words[0], bottom: words.slice(1).join(" ") }; }
function weekDays() { return Array.from({ length: 7 }, (_, index) => addDays(state.weekStart, index)); }
function startOfWeek(date) { const copy = new Date(date); const day = copy.getDay() || 7; copy.setDate(copy.getDate() - day + 1); copy.setHours(12, 0, 0, 0); return copy; }
function addDays(date, days) { const copy = new Date(date); copy.setDate(copy.getDate() + days); copy.setHours(12, 0, 0, 0); return copy; }
function toISO(date) { return date.toISOString().slice(0, 10); }
function parseISO(value) { return new Date(`${value}T12:00:00`); }
function weekTitle(days) { const first = days[0]; const last = days[6]; return first.getMonth() === last.getMonth() ? `${first.getDate()}-${last.getDate()} ${monthNames[first.getMonth()]} ${first.getFullYear()}` : `${first.getDate()} ${monthNames[first.getMonth()]} - ${last.getDate()} ${monthNames[last.getMonth()]} ${last.getFullYear()}`; }
function fullDate(date) { return `${dayNames[(date.getDay() + 6) % 7]} ${date.getDate()} ${monthNames[date.getMonth()]} ${date.getFullYear()}`; }
function sortItems(a, b) { return a.date.localeCompare(b.date) || state.bands.findIndex((entry) => entry.id === a.slot) - state.bands.findIndex((entry) => entry.id === b.slot) || a.title.localeCompare(b.title); }
function parseTags(value) { return tags(String(value || "").split(",")); }
function tags(values) { return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))]; }
function load(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; } }
function shade(hex, percent) { const clean = hex.replace("#", ""); const n = parseInt(clean, 16); const a = Math.round(2.55 * percent); const r = Math.max(0, Math.min(255, (n >> 16) + a)); const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + a)); const b = Math.max(0, Math.min(255, (n & 255) + a)); return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`; }
function slug(value) { return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `fascia-${Date.now()}`; }
function cap(value) { return String(value).slice(0, 1).toUpperCase() + String(value).slice(1); }
function escape(value) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }
function emptyState(text) { return Object.assign(node("div", "empty-state"), { textContent: text }); }
function node(tag, className = "") { const item = document.createElement(tag); if (className) item.className = className; return item; }
function q(selector) { return document.querySelector(selector); }
function qa(selector) { return [...document.querySelectorAll(selector)]; }

