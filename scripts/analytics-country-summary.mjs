// One country per active cookie ID, even when the 24-hour window crosses UTC
// midnight or the visitor changes network. Prefer the most recent known daily
// observation; historical rows without a country remain explicitly unknown.
export const COUNTRY_REPORT_SQL = `
  SELECT country_code, COUNT(*) AS visitor_ids
  FROM (
    SELECT country_code, ROW_NUMBER() OVER (
      PARTITION BY visitor_hash
      ORDER BY (country_code IS NOT NULL) DESC, country_observed_at DESC, day DESC
    ) AS rank_in_window
    FROM analytics_daily_visitors
    WHERE day BETWEEN DATE(?) AND DATE(?)
      AND last_seen_at >= ? AND first_seen_at <= ?
  ) ranked
  WHERE rank_in_window = 1
  GROUP BY country_code
  ORDER BY visitor_ids DESC, country_code`;

export function countrySummary(rows) {
  const names = new Intl.DisplayNames(["fr"], { type: "region" });
  const total = rows.reduce((n, row) => n + Number(row.visitor_ids), 0);
  const unknown = rows.reduce((n, row) => n + (!row.country_code ? Number(row.visitor_ids) : 0), 0);
  return {
    visitor_ids: total,
    country_known: total - unknown,
    country_unknown: unknown,
    coverage_percent: total ? Number(((total - unknown) * 100 / total).toFixed(2)) : 0,
    countries: rows.map((row) => ({
      code: row.country_code || null,
      country: row.country_code ? names.of(row.country_code) : "Inconnu",
      visitor_ids: Number(row.visitor_ids),
      percent_of_all_visitors: total ? Number((Number(row.visitor_ids) * 100 / total).toFixed(2)) : 0,
    })),
  };
}

export function countryReportHtml(report) {
  const escape = (v) => String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const date = (value) => new Date(value).toLocaleString("fr-FR", { timeZone: "Europe/Paris" });
  const rows = report.countries.map((row) => `<tr><td>${escape(row.country)}</td><td>${row.visitor_ids.toLocaleString("fr-FR")}</td><td>${row.percent_of_all_visitors.toLocaleString("fr-FR")} %</td></tr>`).join("");
  return `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Pays des visiteurs — 24 heures</title>
<style>body{font:17px system-ui;max-width:850px;margin:40px auto;padding:0 24px;color:#172b35;background:#f7fafb}h1{font-size:30px}p{line-height:1.6}table{width:100%;border-collapse:collapse;background:white}td,th{padding:13px;text-align:left;border-bottom:1px solid #dde5e8}td:nth-child(n+2),th:nth-child(n+2){text-align:right}.note{color:#52636b;font-size:15px}</style>
<h1>Pays des visiteurs — dernières 24 heures</h1><p>Du ${escape(date(report.start_utc))} au ${escape(date(report.end_utc))}, heure de Paris.</p>
<p><strong>${report.visitor_ids.toLocaleString("fr-FR")} identifiants visiteurs</strong> · Pays connu pour <strong>${report.coverage_percent.toLocaleString("fr-FR")} %</strong>.</p>
<table><thead><tr><th>Pays estimé</th><th>Identifiants</th><th>Part du total</th></tr></thead><tbody>${rows}</tbody></table>
<p class="note">Un identifiant de navigateur n'est pas une personne certifiée humaine. Chaque identifiant compte une fois ; le pays connu le plus récemment enregistré dans les jours concernés est retenu. Un VPN peut apparaître dans le pays de sa sortie. Les anciens visiteurs sans nouvelle observation restent « Inconnu ». Les pourcentages arrondis peuvent ne pas totaliser exactement 100 %.</p>
<p class="note">Rapport ponctuel, non actualisé automatiquement. <a href="https://db-ip.com">IP Geolocation by DB-IP</a> — base Lite, estimation du pays uniquement.</p></html>`;
}
