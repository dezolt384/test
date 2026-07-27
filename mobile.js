(function setupMobileDefaults() {
  const query = "(max-width: 820px)";
  const isMobile = () => window.matchMedia(query).matches;

  function activateDayView() {
    if (!isMobile()) return true;

    const dayTab = document.querySelector('.tab[data-view="day"]');
    const contentView = document.querySelector("#contentView");
    if (!dayTab || contentView?.textContent?.includes("Impossibile caricare")) return false;
    if (dayTab.classList.contains("is-active")) return true;

    dayTab.click();
    return dayTab.classList.contains("is-active");
  }

  function activateWhenReady(attempt = 0) {
    if (activateDayView()) return;
    if (attempt < 100) window.setTimeout(() => activateWhenReady(attempt + 1), 100);
  }

  document.addEventListener("click", (event) => {
    if (!event.target.closest("#homeButton")) return;
    window.setTimeout(() => activateWhenReady(), 0);
  }, true);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => activateWhenReady());
  } else {
    activateWhenReady();
  }
})();