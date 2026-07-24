(async function loadRedazioneApp() {
  const parts = ["app-1.js", "app-2.js", "app-3.js", "app-4.js", "app-5.js"];

  function showLoadError(error) {
    console.error("Impossibile caricare l'app", error);
    const target = document.querySelector("#contentView") || document.body;
    const message = error && error.message ? error.message : String(error || "errore sconosciuto");
    target.innerHTML = `<div class="empty-state">Impossibile caricare l'app. ${message}</div>`;
  }

  window.addEventListener("error", (event) => {
    if (event.filename && event.filename.startsWith("blob:")) {
      showLoadError(event.error || new Error(event.message));
    }
  }, { once: true });

  try {
    const code = (await Promise.all(parts.map(async (path) => {
      const response = await fetch(`./${path}?v=cloudflare3`, { cache: "no-store" });
      if (!response.ok) throw new Error(`${path}: ${response.status}`);
      return response.text();
    }))).join("\n");

    const blob = new Blob([code], { type: "text/javascript" });
    const script = document.createElement("script");
    script.src = URL.createObjectURL(blob);
    script.onload = () => URL.revokeObjectURL(script.src);
    script.onerror = () => showLoadError(new Error("script non eseguito"));
    document.body.appendChild(script);
  } catch (error) {
    showLoadError(error);
  }
})();
