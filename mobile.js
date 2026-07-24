(function setupMobileDefaults() {
  const query = "(max-width: 820px)";
  const isMobile = () => window.matchMedia(query).matches;

  function activateDayView() {
    if (!isMobile()) return;
    const dayTab = document.querySelector('.tab[data-view="day"]');
    const contentView = document.querySelector("#contentView");
    if (!dayTab || contentView?.textContent?.includes("Impossibile caricare")) return;
    if (!dayTab.classList.contains("is-active")) dayTab.click();
  }

  function activateWhenReady(attempt = 0) {
    const dayTab = document.querySelector('.tab[data-view="day"]');
    if (dayTab) {
      activateDayView();
      return;
    }
    if (attempt < 80) window.setTimeout(() => activateWhenReady(attempt + 1), 100);
  }

  document.addEventListener("click", (event) => {
    if (!event.target.closest("#homeButton")) return;
    window.setTimeout(activateDayView, 0);
  }, true);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => activateWhenReady());
  } else {
    activateWhenReady();
  }
})();