const REPORT_SUPABASE_URL = "https://epmmfqukauuqgqegaezp.supabase.co/rest/v1";
const REPORT_SUPABASE_KEY = "sb_publishable_ICKsll82Tawld3iIvtWJpg_D2Ob164z";
const REPORT_HANDLER = "sendWeeklyReport";

function sendWeeklyReport() {
  const config = getReportConfig_();
  const period = getPreviousWeek_();
  const previousPeriod = shiftPeriod_(period, -7);
  const contents = fetchProgrammazione_(period);
  const analytics = fetchMatomo_(config, period, previousPeriod);
  const report = buildReport_(period, contents, analytics);

  GmailApp.sendEmail(config.to, report.subject, report.text, {
    cc: config.cc,
    htmlBody: report.html,
    name: "Programmazione Collettiva",
  });
}

function sendWeeklyReportPreview() {
  const config = getReportConfig_();
  const period = getPreviousWeek_();
  const previousPeriod = shiftPeriod_(period, -7);
  const contents = fetchProgrammazione_(period);
  const analytics = fetchMatomo_(config, period, previousPeriod);
  const report = buildReport_(period, contents, analytics);
  console.log(report.text);
  return report;
}

function installWeeklyTrigger() {
  const config = getReportConfig_();
  ScriptApp.getProjectTriggers()
    .filter((trigger) => trigger.getHandlerFunction() === REPORT_HANDLER)
    .forEach((trigger) => ScriptApp.deleteTrigger(trigger));

  ScriptApp.newTrigger(REPORT_HANDLER)
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(config.hour)
    .inTimezone(config.timeZone)
    .create();
}

function removeWeeklyTrigger() {
  ScriptApp.getProjectTriggers()
    .filter((trigger) => trigger.getHandlerFunction() === REPORT_HANDLER)
    .forEach((trigger) => ScriptApp.deleteTrigger(trigger));
}

function getReportConfig_() {
  const properties = PropertiesService.getScriptProperties();
  const config = {
    matomoUrl: normalizeBaseUrl_(properties.getProperty("MATOMO_URL")),
    matomoSiteId: properties.getProperty("MATOMO_SITE_ID"),
    matomoToken: properties.getProperty("MATOMO_TOKEN"),
    contentPathRegex: properties.getProperty("MATOMO_CONTENT_PATH_REGEX") || "",
    to: properties.getProperty("REPORT_TO"),
    cc: properties.getProperty("REPORT_CC") || "",
    hour: Number(properties.getProperty("REPORT_HOUR") || 8),
    timeZone: properties.getProperty("REPORT_TIME_ZONE") || "Europe/Rome",
  };

  const required = {
    MATOMO_URL: config.matomoUrl,
    MATOMO_SITE_ID: config.matomoSiteId,
    MATOMO_TOKEN: config.matomoToken,
    REPORT_TO: config.to,
  };
  const missing = Object.keys(required).filter((key) => !required[key]);
  if (missing.length) {
    throw new Error(`Proprieta mancanti: ${missing.join(", ")}`);
  }
  if (!Number.isInteger(config.hour) || config.hour < 0 || config.hour > 23) {
    throw new Error("REPORT_HOUR deve essere un numero intero tra 0 e 23");
  }
  return config;
}

function fetchProgrammazione_(period) {
  const params = [
    "select=title,content_date,slot,tags,sort_order",
    "deleted_at=is.null",
    `content_date=gte.${period.startIso}`,
    `content_date=lte.${period.endIso}`,
    "order=content_date.asc,slot.asc,sort_order.asc",
  ].join("&");
  const response = UrlFetchApp.fetch(`${REPORT_SUPABASE_URL}/contents?${params}`, {
    method: "get",
    headers: {
      apikey: REPORT_SUPABASE_KEY,
      Authorization: `Bearer ${REPORT_SUPABASE_KEY}`,
    },
    muteHttpExceptions: true,
  });
  assertResponse_(response, "Supabase");
  return JSON.parse(response.getContentText());
}

function fetchMatomo_(config, period, previousPeriod) {
  const calls = [
    matomoCall_("VisitsSummary.get", config.matomoSiteId, period),
    matomoCall_("Actions.get", config.matomoSiteId, period),
    `${matomoCall_("Actions.getPageUrls", config.matomoSiteId, period)}&expanded=1&flat=1&filter_limit=200`,
    matomoCall_("VisitsSummary.get", config.matomoSiteId, previousPeriod),
    matomoCall_("Actions.get", config.matomoSiteId, previousPeriod),
  ];
  const payload = {
    module: "API",
    method: "API.getBulkRequest",
    format: "json",
    token_auth: config.matomoToken,
  };
  calls.forEach((call, index) => {
    payload[`urls[${index}]`] = call;
  });

  const response = UrlFetchApp.fetch(config.matomoUrl, {
    method: "post",
    payload,
    muteHttpExceptions: true,
  });
  assertResponse_(response, "Matomo");
  const result = JSON.parse(response.getContentText());
  if (!Array.isArray(result) || result.length < 5) {
    throw new Error("Risposta Matomo incompleta");
  }

  return {
    currentVisits: result[0] || {},
    currentActions: result[1] || {},
    previousVisits: result[3] || {},
    previousActions: result[4] || {},
    topPages: normalizeTopPages_(result[2], config.contentPathRegex).slice(0, 10),
  };
}

function matomoCall_(method, siteId, period) {
  return [
    `method=${encodeURIComponent(method)}`,
    `idSite=${encodeURIComponent(siteId)}`,
    "period=range",
    `date=${period.startIso},${period.endIso}`,
  ].join("&");
}

function normalizeTopPages_(rows, contentPathRegex) {
  const flatRows = flattenMatomoRows_(Array.isArray(rows) ? rows : []);
  const filter = contentPathRegex ? new RegExp(contentPathRegex, "i") : null;
  const ignored = /^(\/|home|homepage)$/i;
  return flatRows
    .map((row) => ({
      title: String(row.label || row.name || row.url || "Contenuto"),
      url: String(row.url || row.label || ""),
      views: Number(row.nb_hits || row.nb_pageviews || row.nb_visits || 0),
      uniqueViews: Number(row.nb_uniq_pageviews || row.nb_uniq_visitors || 0),
    }))
    .filter((row) => row.views > 0)
    .filter((row) => !ignored.test(row.title.trim()))
    .filter((row) => !filter || filter.test(row.url) || filter.test(row.title))
    .sort((a, b) => b.views - a.views);
}

function flattenMatomoRows_(rows) {
  return rows.reduce((flat, row) => {
    flat.push(row);
    if (Array.isArray(row.subtable)) flat.push(...flattenMatomoRows_(row.subtable));
    return flat;
  }, []);
}

function buildReport_(period, contents, analytics) {
  const totals = {
    visits: numberMetric_(analytics.currentVisits.nb_visits),
    visitors: numberMetric_(analytics.currentVisits.nb_uniq_visitors),
    pageviews: numberMetric_(
      analytics.currentActions.nb_pageviews || analytics.currentActions.nb_actions,
    ),
  };
  const previous = {
    visits: numberMetric_(analytics.previousVisits.nb_visits),
    visitors: numberMetric_(analytics.previousVisits.nb_uniq_visitors),
    pageviews: numberMetric_(
      analytics.previousActions.nb_pageviews || analytics.previousActions.nb_actions,
    ),
  };
  const comment = buildComment_(contents, analytics.topPages, totals, previous);
  const grouped = groupContentsByDate_(contents, period);
  const subject = `Report settimanale Collettiva | ${formatPeriod_(period)}`;

  return {
    subject,
    text: buildTextReport_(subject, grouped, totals, analytics.topPages, comment),
    html: buildHtmlReport_(subject, grouped, totals, analytics.topPages, comment),
  };
}

function buildComment_(contents, topPages, totals, previous) {
  const visitsTrend = describeTrend_("visite", totals.visits, previous.visits);
  const viewsTrend = describeTrend_("pagine viste", totals.pageviews, previous.pageviews);
  const visitorTrend = describeTrend_("utenti unici", totals.visitors, previous.visitors);
  const topViews = topPages.reduce((sum, page) => sum + page.views, 0);
  const concentration = totals.pageviews
    ? Math.round((topViews / totals.pageviews) * 100)
    : 0;
  const first = topPages[0];
  const activeDays = new Set(contents.map((item) => item.content_date)).size;

  const parts = [
    `La settimana registra ${formatNumber_(totals.visits)} visite e ${formatNumber_(totals.pageviews)} pagine viste.`,
    `${capitalizeSentence_(visitsTrend)}, mentre ${viewsTrend} e ${visitorTrend}.`,
    `La programmazione comprende ${contents.length} contenuti distribuiti su ${activeDays} giorni.`,
  ];
  if (first) {
    parts.push(
      `Il contenuto più consultato è “${first.title}” con ${formatNumber_(first.views)} visualizzazioni.`,
    );
  }
  if (concentration) {
    parts.push(
      `I primi dieci contenuti concentrano circa il ${concentration}% delle pagine viste: ${
        concentration >= 50
          ? "la performance è trainata da pochi titoli forti"
          : "l’attenzione risulta distribuita su un insieme ampio di pagine"
      }.`,
    );
  }
  parts.push(
    "Il dato va letto insieme alle priorità editoriali: i picchi indicano i temi con maggiore capacità di intercettare il pubblico, mentre i contenuti meno visibili possono richiedere un rilancio in homepage, newsletter o social.",
  );
  return truncateText_(parts.join(" "), 2000);
}

function describeTrend_(label, current, previous) {
  if (!previous) return `${label} senza confronto disponibile`;
  const change = ((current - previous) / previous) * 100;
  if (Math.abs(change) < 1) return `${label} sostanzialmente stabili`;
  return `${label} ${change > 0 ? "in crescita" : "in calo"} del ${Math.abs(change).toFixed(1).replace(".", ",")}%`;
}

function buildHtmlReport_(subject, grouped, totals, topPages, comment) {
  const stats = [
    ["Visite", totals.visits],
    ["Utenti unici", totals.visitors],
    ["Pagine viste", totals.pageviews],
  ];
  const statsHtml = stats
    .map(
      ([label, value]) => `
        <td width="33%" style="padding:14px;border:1px solid #dfe5ec;">
          <div style="font-size:12px;color:#647187;text-transform:uppercase;">${escapeHtml_(label)}</div>
          <div style="margin-top:5px;font-size:24px;font-weight:700;color:#172238;">${formatNumber_(value)}</div>
        </td>`,
    )
    .join("");

  const daysHtml = grouped
    .map(
      (day) => `
        <h3 style="margin:24px 0 8px;color:#172238;">${escapeHtml_(day.label)}</h3>
        ${
          day.items.length
            ? `<ul style="margin:0;padding-left:22px;">${day.items
                .map(
                  (item) =>
                    `<li style="margin:7px 0;"><strong>${escapeHtml_(item.title)}</strong>${
                      item.slot ? ` <span style="color:#647187;">(${escapeHtml_(item.slot)})</span>` : ""
                    }</li>`,
                )
                .join("")}</ul>`
            : '<p style="margin:0;color:#7a8698;">Nessun contenuto programmato</p>'
        }`,
    )
    .join("");

  const topHtml = topPages.length
    ? `<ol style="padding-left:24px;">${topPages
        .map(
          (page) => `
            <li style="margin:10px 0;padding-left:4px;">
              ${
                /^https?:\/\//i.test(page.url)
                  ? `<a href="${escapeHtml_(page.url)}" style="color:#0d6b63;text-decoration:none;"><strong>${escapeHtml_(page.title)}</strong></a>`
                  : `<strong>${escapeHtml_(page.title)}</strong>`
              }
              <span style="color:#647187;"> — ${formatNumber_(page.views)} visualizzazioni</span>
            </li>`,
        )
        .join("")}</ol>`
    : '<p style="color:#7a8698;">Nessun dato disponibile</p>';

  return `
    <div style="font-family:Arial,sans-serif;max-width:760px;margin:0 auto;color:#172238;line-height:1.45;">
      <div style="border-top:6px solid #e1261c;padding-top:18px;">
        <h1 style="margin:0;font-size:28px;">${escapeHtml_(subject)}</h1>
      </div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:22px;border-collapse:collapse;">
        <tr>${statsHtml}</tr>
      </table>
      <h2 style="margin:28px 0 10px;font-size:20px;">Sintesi</h2>
      <p style="margin:0;padding:16px;background-color:#eef7f5;border-left:4px solid #168f84;">${escapeHtml_(comment)}</p>
      <h2 style="margin:30px 0 10px;font-size:20px;">Programmazione giorno per giorno</h2>
      ${daysHtml}
      <h2 style="margin:32px 0 10px;font-size:20px;">I 10 contenuti più visti</h2>
      ${topHtml}
      <p style="margin-top:34px;padding-top:14px;border-top:1px solid #dfe5ec;color:#7a8698;font-size:12px;">
        Report automatico generato da Programmazione Collettiva e Matomo.
      </p>
    </div>`;
}

function buildTextReport_(subject, grouped, totals, topPages, comment) {
  const days = grouped
    .map(
      (day) =>
        `${day.label}\n${
          day.items.length
            ? day.items.map((item) => `- ${item.title}${item.slot ? ` (${item.slot})` : ""}`).join("\n")
            : "- Nessun contenuto programmato"
        }`,
    )
    .join("\n\n");
  const ranking = topPages.length
    ? topPages.map((page, index) => `${index + 1}. ${page.title} — ${formatNumber_(page.views)}`).join("\n")
    : "Nessun dato disponibile";
  return `${subject}

Visite: ${formatNumber_(totals.visits)}
Utenti unici: ${formatNumber_(totals.visitors)}
Pagine viste: ${formatNumber_(totals.pageviews)}

SINTESI
${comment}

PROGRAMMAZIONE
${days}

TOP 10
${ranking}`;
}

function groupContentsByDate_(contents, period) {
  const grouped = {};
  contents.forEach((item) => {
    grouped[item.content_date] = grouped[item.content_date] || [];
    grouped[item.content_date].push(item);
  });
  const days = [];
  for (let date = new Date(`${period.startIso}T12:00:00`); date <= period.end; date.setDate(date.getDate() + 1)) {
    const iso = toIsoDate_(date);
    days.push({
      date: iso,
      label: capitalizeSentence_(
        Utilities.formatDate(date, "Europe/Rome", "EEEE d MMMM yyyy"),
      ),
      items: grouped[iso] || [],
    });
  }
  return days;
}

function getPreviousWeek_() {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const day = today.getDay() || 7;
  const currentMonday = new Date(today);
  currentMonday.setDate(today.getDate() - day + 1);
  const start = new Date(currentMonday);
  start.setDate(start.getDate() - 7);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return { start, end, startIso: toIsoDate_(start), endIso: toIsoDate_(end) };
}

function shiftPeriod_(period, days) {
  const start = new Date(period.start);
  const end = new Date(period.end);
  start.setDate(start.getDate() + days);
  end.setDate(end.getDate() + days);
  return { start, end, startIso: toIsoDate_(start), endIso: toIsoDate_(end) };
}

function toIsoDate_(date) {
  return Utilities.formatDate(date, "Europe/Rome", "yyyy-MM-dd");
}

function formatPeriod_(period) {
  const start = Utilities.formatDate(period.start, "Europe/Rome", "d MMMM");
  const end = Utilities.formatDate(period.end, "Europe/Rome", "d MMMM yyyy");
  return `${start} - ${end}`;
}

function formatNumber_(value) {
  return Number(value || 0).toLocaleString("it-IT");
}

function numberMetric_(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function normalizeBaseUrl_(value) {
  const url = String(value || "").trim();
  if (!url) return "";
  return url.endsWith("/") ? url : `${url}/`;
}

function capitalizeSentence_(value) {
  const text = String(value || "");
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
}

function truncateText_(value, limit) {
  const text = String(value || "").trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 1).trim()}…`;
}

function escapeHtml_(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function assertResponse_(response, source) {
  const status = response.getResponseCode();
  if (status < 200 || status >= 300) {
    throw new Error(`${source} ha risposto ${status}: ${response.getContentText().slice(0, 500)}`);
  }
}
