(async function loadRedazioneApp() {
  const parts = ["app-1.js", "app-2.js", "app-3.js", "app-4.js", "app-5.js", "app-6.js", "app-7.js"];

  function showLoadError(error, code) {
    console.error("Impossibile caricare l'app", error);
    const target = document.querySelector("#contentView") || document.body;
    let message = error && error.message ? error.message : String(error || "errore sconosciuto");

    if (code && error && typeof error.lineNumber === "number") {
      const lines = code.split("\n");
      const line = error.lineNumber;
      const from = Math.max(1, line - 3);
      const to = Math.min(lines.length, line + 3);
      const snippet = lines.slice(from - 1, to).map((text, index) => `${from + index}: ${text}`).join("\n");
      message += ` alla riga ${line}. ${snippet}`;
    }

    target.innerHTML = `<div class="empty-state">Impossibile caricare l'app. ${message}</div>`;
  }

  try {
    const fetched = await Promise.all(parts.map(async (path) => {
      const response = await fetch(`./${path}?v=egress-v1`, { cache: "no-store" });
      if (!response.ok) throw new Error(`${path}: ${response.status}`);
      return response.text();
    }));
    const code = fetched.join("\n");

    try {
      new Function(code);
    } catch (syntaxError) {
      showLoadError(syntaxError, code);
      return;
    }

    const blob = new Blob([code], { type: "text/javascript" });
    const script = document.createElement("script");
    script.src = URL.createObjectURL(blob);
    script.onload = () => URL.revokeObjectURL(script.src);
    script.onerror = () => showLoadError(new Error("script non eseguito"));
    window.addEventListener("error", (event) => {
      if (event.filename && event.filename.startsWith("blob:")) {
        showLoadError(event.error || new Error(event.message));
      }
    }, { once: true });
    document.body.appendChild(script);
  } catch (error) {
    showLoadError(error);
  }
})();
