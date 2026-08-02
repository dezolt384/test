const USERNAME = "redazione";

async function secureCompare(provided, expected) {
  const encoder = new TextEncoder();
  const [providedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(provided)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);

  return crypto.subtle.timingSafeEqual(providedHash, expectedHash);
}

export async function onRequest(context) {
  const password = context.env.REDAZIONE_PASSWORD;

  if (!password) {
    return new Response("Configurazione accesso non disponibile.", {
      status: 503,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/plain; charset=UTF-8",
      },
    });
  }

  const authorization = context.request.headers.get("Authorization") || "";
  const expected = `Basic ${btoa(`${USERNAME}:${password}`)}`;
  const authorized = await secureCompare(authorization, expected);

  if (!authorized) {
    return new Response("Accesso riservato alla redazione.", {
      status: 401,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/plain; charset=UTF-8",
        "WWW-Authenticate":
          'Basic realm="Programmazione Collettiva", charset="UTF-8"',
      },
    });
  }

  return context.next();
}

