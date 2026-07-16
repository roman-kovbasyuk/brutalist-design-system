#!/usr/bin/env python3
"""
Assemble the self-contained static-creatives analytics HTML report from per-creative JSON files.

Input: a directory containing one JSON file per creative (see
references/03-html-report-spec.md for the exact schema each file must follow).

Usage:
  python3 build_static_report.py <creatives_dir> <output.html> [--account "@handle"]

Reads every *.json file directly inside <creatives_dir> (non-recursive), sorts them by the "id"
field for a stable default order, computes cross-creative summary stats, and writes one
self-contained HTML file with all data and images inlined. Standard library only -- no pip installs
required.
"""
import argparse
import json
import statistics
from collections import Counter
from pathlib import Path

ZONE_LABELS = {
    "headline": "Заголовок", "subhead": "Подзаголовок", "proof": "Доказательство",
    "cta": "CTA", "logo": "Лого", "product": "Продукт",
}
ZONE_COLORS = {
    "headline": "#ff5a5f", "subhead": "#ff9f1c", "proof": "#4d96ff",
    "cta": "#2dd881", "logo": "#a663cc", "product": "#2ec4b6",
}


def load_creatives(creatives_dir):
    creatives = []
    for f in sorted(creatives_dir.glob("*.json")):
        creatives.append(json.loads(f.read_text(encoding="utf-8")))
    return creatives


def compute_summary(creatives):
    organic = [c for c in creatives if c.get("source") == "organic"]
    ads = [c for c in creatives if c.get("source") == "ad_library"]
    engagements = []
    for c in organic:
        m = c.get("metrics") or {}
        likes, comments = m.get("likes"), m.get("comments")
        if likes is not None and comments is not None:
            engagements.append(likes + comments)

    dates = [c.get("publishedAt") for c in creatives if c.get("publishedAt")]
    zone_counter = Counter()
    for c in creatives:
        labels = {z.get("label") for z in (c.get("layout") or {}).get("zones", []) if z.get("label")}
        for label in labels:
            zone_counter[label] += 1

    return {
        "total": len(creatives),
        "organicCount": len(organic),
        "adCount": len(ads),
        "avgEngagement": round(statistics.mean(engagements), 1) if engagements else None,
        "dateRange": [min(dates), max(dates)] if dates else [None, None],
        "zoneFrequency": dict(zone_counter),
    }


def safe_json(obj):
    """JSON-encode for embedding inside an HTML <script> tag.

    Escapes '</' so a literal '</script>' in scraped text (captions) can't prematurely close the
    tag, and escapes the JS line/paragraph separators (valid JSON, invalid unescaped inside a JS
    string literal).
    """
    raw = json.dumps(obj, ensure_ascii=False)
    return (
        raw.replace("</", "<\\/")
        .replace(" ", "\\u2028")
        .replace(" ", "\\u2029")
    )


CSS = """
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  background: #f5f6f8;
  color: #16181d;
}
a { color: #2178c9; }
.topbar {
  position: sticky; top: 0; z-index: 10;
  display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between;
  gap: 12px; padding: 16px 24px;
  background: #ffffff; border-bottom: 1px solid #e3e5e9;
}
.topbar h1 { font-size: 18px; margin: 0; }
.sort-controls { display: flex; align-items: center; gap: 10px; font-size: 14px; }
.sort-controls select, .sort-controls button {
  font-size: 14px; padding: 6px 10px; border-radius: 6px; border: 1px solid #d3d6dc;
  background: #fff; cursor: pointer;
}
.sort-controls button:hover { background: #f0f1f3; }

.summary {
  padding: 16px 24px; display: grid; gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
}
.stat-tile {
  background: #fff; border: 1px solid #e3e5e9; border-radius: 10px; padding: 14px 16px;
}
.stat-tile .value { font-size: 22px; font-weight: 700; }
.stat-tile .label { font-size: 12px; color: #6b7076; margin-top: 4px; }

.gallery {
  padding: 8px 24px 40px; display: grid; gap: 20px;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
}
.card {
  background: #fff; border: 1px solid #e3e5e9; border-radius: 12px; overflow: hidden;
  display: flex; flex-direction: column;
}
.card-head { display: flex; gap: 12px; padding: 12px; cursor: pointer; }
.card-head img.cover {
  width: 96px; height: 96px; object-fit: cover; border-radius: 8px; background: #eee;
  flex-shrink: 0;
}
.card-meta { flex: 1; min-width: 0; }
.card-meta .caption {
  font-size: 13px; color: #40454c; max-height: 3.6em; overflow: hidden; margin: 0 0 8px;
}
.badge {
  display: inline-block; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 999px;
  margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.03em;
}
.badge.organic { background: #e6f7ef; color: #1a8f5a; }
.badge.ad_library { background: #fff0e0; color: #b56100; }
.metrics-row { display: flex; flex-wrap: wrap; gap: 8px 14px; font-size: 12.5px; color: #40454c; }
.metrics-row b { color: #16181d; }

.card-body { border-top: 1px solid #eee; padding: 14px; display: none; }
.card.open .card-body { display: block; }

.hero-wrap { display: flex; gap: 14px; }
.hero-wrap img.hero { width: 220px; height: auto; border-radius: 8px; background: #eee; flex-shrink: 0; }
.zone-list { flex: 1; font-size: 13px; }
.zone-chip {
  display: inline-block; color: #fff; font-size: 11px; padding: 4px 10px; border-radius: 999px;
  margin: 0 6px 6px 0; cursor: pointer; opacity: 0.9;
}
.zone-chip:hover, .zone-chip.active { opacity: 1; outline: 2px solid rgba(0,0,0,0.35); outline-offset: -2px; }
.zone-detail {
  margin-top: 8px; font-size: 13px; background: #f7f8fa; border-radius: 8px; padding: 10px 12px;
  min-height: 20px;
}
.color-notes, .technique-verdict {
  margin-top: 12px; font-size: 13px; background: #fff7ec; border: 1px solid #ffe6c2;
  border-radius: 8px; padding: 10px 12px;
}
.additional-strip { display: flex; gap: 8px; overflow-x: auto; margin-top: 12px; }
.additional-strip img { width: 64px; height: 64px; object-fit: cover; border-radius: 6px; flex-shrink: 0; }

@media (max-width: 640px) {
  .gallery { grid-template-columns: 1fr; padding: 8px 12px 32px; }
  .topbar { padding: 12px; }
  .hero-wrap { flex-direction: column; }
  .hero-wrap img.hero { width: 100%; height: auto; max-height: 320px; }
}
"""

JS = """
function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function fmtNum(n) {
  if (n === null || n === undefined) return "—";
  return new Intl.NumberFormat("ru-RU").format(n);
}
function sourceLabel(s) { return s === "ad_library" ? "Платная реклама" : "Органика"; }

function renderSummary() {
  const el = document.getElementById("summary");
  const [from, to] = SUMMARY.dateRange || [null, null];
  el.innerHTML = `
    <div class="stat-tile"><div class="value">${SUMMARY.total}</div><div class="label">Всего креативов</div></div>
    <div class="stat-tile"><div class="value">${SUMMARY.organicCount}</div><div class="label">Органика</div></div>
    <div class="stat-tile"><div class="value">${SUMMARY.adCount}</div><div class="label">Платная реклама</div></div>
    <div class="stat-tile"><div class="value">${SUMMARY.avgEngagement != null ? fmtNum(SUMMARY.avgEngagement) : "—"}</div><div class="label">Средний engagement (органика)</div></div>
    <div class="stat-tile"><div class="value">${from ? esc(from) + " → " + esc(to) : "—"}</div><div class="label">Период</div></div>
  `;
}

function cardHtml(item, index) {
  const m = item.metrics || {};
  return `
    <div class="card" data-id="${esc(item.id)}" id="card-${index}">
      <div class="card-head" onclick="toggleCard(${index})">
        <img class="cover" src="${(item.hero && item.hero.dataUri) || ''}" alt="cover">
        <div class="card-meta">
          <span class="badge ${esc(item.source)}">${sourceLabel(item.source)}</span>
          <p class="caption">${esc(item.caption)}</p>
          <div class="metrics-row">
            <span>Лайки <b>${fmtNum(m.likes)}</b></span>
            <span>Комментарии <b>${fmtNum(m.comments)}</b></span>
            ${m.reachEstimate != null ? `<span>Охват <b>${fmtNum(m.reachEstimate)}</b></span>` : ''}
            ${m.spend != null ? `<span>Бюджет <b>${fmtNum(m.spend)}</b></span>` : ''}
            <span>Дата <b>${esc(item.publishedAt) || "—"}</b></span>
          </div>
        </div>
      </div>
      <div class="card-body">
        ${heroHtml(item, index)}
        <div class="color-notes"><b>Цвет:</b> ${esc((item.layout || {}).colorNotes) || '—'}</div>
        <div class="technique-verdict"><b>Почему работает:</b> ${esc((item.layout || {}).techniqueVerdict) || '—'}</div>
        ${additionalHtml(item)}
        ${item.url ? `<p style="margin-top:10px;font-size:12.5px;"><a href="${esc(item.url)}" target="_blank" rel="noopener">Открыть пост ↗</a></p>` : ''}
      </div>
    </div>
  `;
}

function heroHtml(item, index) {
  const zones = (item.layout || {}).zones || [];
  const chips = zones.map((z, i) =>
    `<span class="zone-chip" style="background:${ZONE_COLORS[z.label] || '#8a8f96'}" onclick="showZone(${index}, ${i})">${ZONE_LABELS[z.label] || z.label}</span>`
  ).join("");
  return `
    <div class="hero-wrap">
      <img class="hero" src="${(item.hero && item.hero.dataUri) || ''}" alt="hero">
      <div class="zone-list">
        <div>${chips || 'Зоны не размечены'}</div>
        <div class="zone-detail" id="zone-detail-${index}">Кликните по зоне, чтобы увидеть текст и позицию.</div>
      </div>
    </div>
  `;
}

function showZone(index, zoneIndex) {
  const item = CREATIVES[index];
  const zone = ((item.layout || {}).zones || [])[zoneIndex];
  const el = document.getElementById(`zone-detail-${index}`);
  if (!zone) { el.textContent = "Зона не найдена."; return; }
  el.innerHTML = `<b>${ZONE_LABELS[zone.label] || zone.label}</b> · ${esc(zone.position) || 'позиция не указана'}<div style="margin-top:4px;">«${esc(zone.text) || '—'}»</div>`;
}

function additionalHtml(item) {
  const extra = item.additional || [];
  if (!extra.length) return '';
  const thumbs = extra.map(a => `<img src="${a.dataUri || ''}" alt="доп. кадр">`).join("");
  return `<div class="additional-strip">${thumbs}</div>`;
}

function toggleCard(index) {
  document.getElementById(`card-${index}`).classList.toggle("open");
}

function sortedCreatives() {
  const key = document.getElementById("sortKey").value;
  const dir = document.getElementById("sortDir").dataset.dir;
  const withIndex = CREATIVES.map((r, i) => ({ r, i }));
  withIndex.sort((a, b) => {
    let av = a.r.metrics && key in a.r.metrics ? a.r.metrics[key] : a.r[key];
    let bv = b.r.metrics && key in b.r.metrics ? b.r.metrics[key] : b.r[key];
    if (av === undefined || av === null) av = key === "publishedAt" ? "" : -Infinity;
    if (bv === undefined || bv === null) bv = key === "publishedAt" ? "" : -Infinity;
    if (av < bv) return dir === "asc" ? -1 : 1;
    if (av > bv) return dir === "asc" ? 1 : -1;
    return 0;
  });
  return withIndex;
}

function renderGallery() {
  const gallery = document.getElementById("gallery");
  const ordered = sortedCreatives();
  gallery.innerHTML = ordered.map(({ r, i }) => cardHtml(r, i)).join("");
}

document.getElementById("sortKey").addEventListener("change", renderGallery);
document.getElementById("sortDir").addEventListener("click", (e) => {
  const btn = e.currentTarget;
  const next = btn.dataset.dir === "desc" ? "asc" : "desc";
  btn.dataset.dir = next;
  btn.textContent = next === "desc" ? "По убыванию ↓" : "По возрастанию ↑";
  renderGallery();
});

renderSummary();
renderGallery();
"""


def render_html(creatives, summary, account):
    creatives_json = safe_json(creatives)
    summary_json = safe_json(summary)
    zone_labels_json = safe_json(ZONE_LABELS)
    zone_colors_json = safe_json(ZONE_COLORS)
    title = f"Static Creatives Analytics — {account}" if account else "Static Creatives Analytics"

    return f"""<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{title}</title>
<style>
{CSS}
</style>
</head>
<body>
  <header class="topbar">
    <h1>{title}</h1>
    <div class="sort-controls">
      <label>Сортировать по:
        <select id="sortKey">
          <option value="publishedAt">Дате</option>
          <option value="likes">Лайкам</option>
          <option value="comments">Комментариям</option>
          <option value="reachEstimate">Охвату</option>
          <option value="spend">Бюджету</option>
        </select>
      </label>
      <button id="sortDir" data-dir="desc">По убыванию ↓</button>
    </div>
  </header>

  <section class="summary" id="summary"></section>

  <main id="gallery" class="gallery"></main>

<script>
const CREATIVES = {creatives_json};
const SUMMARY = {summary_json};
const ZONE_LABELS = {zone_labels_json};
const ZONE_COLORS = {zone_colors_json};

{JS}
</script>
</body>
</html>
"""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("creatives_dir", help="Directory containing one JSON file per creative")
    parser.add_argument("output", help="Path to write the final self-contained HTML report")
    parser.add_argument("--account", default="", help="Account handle to show in the report title")
    args = parser.parse_args()

    creatives_dir = Path(args.creatives_dir)
    creatives = load_creatives(creatives_dir)
    if not creatives:
        raise SystemExit(f"No *.json creative files found in {creatives_dir}")
    creatives.sort(key=lambda r: r.get("id", ""))
    summary = compute_summary(creatives)
    html = render_html(creatives, summary, args.account)
    Path(args.output).write_text(html, encoding="utf-8")
    print(f"Wrote report for {len(creatives)} creatives to {args.output}")


if __name__ == "__main__":
    main()
