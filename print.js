(function setupWeeklyPrint() {
  const filterRow = document.querySelector(".filter-row");
  if (!filterRow) return;

  const printButton = document.createElement("button");
  printButton.className = "icon-button reader-print-button";
  printButton.type = "button";
  printButton.innerHTML = "&#x2399;";
  printButton.setAttribute("aria-label", "Stampa la programmazione settimanale");
  printButton.title = "Stampa la programmazione settimanale";
  filterRow.appendChild(printButton);

  const printSheet = document.createElement("section");
  printSheet.id = "printSheet";
  printSheet.className = "print-sheet";
  printSheet.setAttribute("aria-hidden", "true");
  document.body.appendChild(printSheet);

  function activateWeekView() {
    const weekTab = document.querySelector('.tab[data-view="week"]');
    if (weekTab && !weekTab.classList.contains("is-active")) weekTab.click();
  }

  function removeNonPrintableControls(root) {
    root.querySelectorAll(
      ".card-actions, .card-action-menu, .card-order-controls, .action-menu-button, " +
      ".empty-slot, .cell-add-button, button[data-back-authors]",
    ).forEach((element) => element.remove());
  }

  function buildPrintSheet() {
    const content = document.querySelector("#contentView");
    const weekTable = content?.querySelector(".week-table");
    if (!weekTable) return false;

    const logo = document.querySelector(".brand .masthead-image")?.cloneNode(true);
    const title = document.querySelector("#weekTitle")?.textContent?.trim() || "";
    const contentClone = content.cloneNode(true);
    removeNonPrintableControls(contentClone);

    printSheet.replaceChildren();

    const header = document.createElement("header");
    header.className = "print-sheet-header";
    if (logo) header.appendChild(logo);

    const heading = document.createElement("div");
    heading.innerHTML = `<span>Programmazione settimanale</span><strong>${title}</strong>`;
    header.appendChild(heading);

    const frame = document.createElement("div");
    frame.className = "print-sheet-frame";
    frame.appendChild(contentClone);

    printSheet.append(header, frame);
    const availableWidth = 1120;
    const availableHeight = 620;
    let scale = 1;

    printSheet.style.width = `${availableWidth}px`;
    printSheet.style.setProperty("--print-scale", "1");

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const requiredHeight = Math.max(printSheet.scrollHeight, 1);
      scale = Math.min(1, availableHeight / requiredHeight);
      printSheet.style.width = `${availableWidth / scale}px`;
    }

    printSheet.style.setProperty("--print-scale", String(Math.max(0.25, scale)));
    return true;
  }

  function printWeek() {
    activateWeekView();
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (buildPrintSheet()) window.print();
      });
    });
  }

  printButton.addEventListener("click", printWeek);
  window.buildWeeklyPrintPreview = buildPrintSheet;
  window.addEventListener("beforeprint", () => {
    activateWeekView();
    buildPrintSheet();
  });
  window.addEventListener("afterprint", () => printSheet.replaceChildren());
})();
