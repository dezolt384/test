(async function loadRedazioneApp() {
  const parts = ["app-1.js", "app-2.js", "app-3.js", "app-4.js", "app-5.js"];
  try {
    const code = (await Promise.all(parts.map(async (path) => {
      const response = await fetch(`${path}?v=cloudflare1`, { cache: "no-store" });
      if (!response.ok) throw new Error(`${path}: ${response.status}`);
      return response.text();
    }))).join("\n");
    Function(code)();
  } catch (error) {
    console.error("Impossibile caricare l'app", error);
    const target = document.querySelector("#contentView") || document.body;
    target.innerHTML = '<div class="empty-state">Impossibile caricare l\'app. Ricarica la pagina.</div>';
  }
})();
