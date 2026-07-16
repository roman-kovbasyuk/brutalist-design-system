#!/usr/bin/env python3
"""
Assemble the self-contained Reels analytics HTML report from per-reel JSON files.

Input: a directory containing one JSON file per reel (see
references/06-html-report-spec.md for the exact schema each file must follow).

Usage:
  python3 build_report.py <reels_dir> <output.html> [--account "@handle"]

Reads every *.json file directly inside <reels_dir> (non-recursive), sorts them by
the "id" field for a stable default order, computes cross-reel summary stats, and
writes one self-contained HTML file with all data and images inlined. Standard
library only — no pip installs required.
"""
import argparse
import json
import statistics
from pathlib import Path

BLOCK_ORDER = ["hook", "intro", "key", "rehook", "objection", "cta"]
BLOCK_LABELS = {
    "hook": "Хук", "intro": "Интро", "key": "Ключевые кадры",
    "rehook": "Рехук", "objection": "Снятие сомнений", "cta": "CTA",
}
BLOCK_COLORS = {
    "hook": "#ff5a5f", "intro": "#ff9f1c", "key": "#2ec4b6",
    "rehook": "#a663cc", "objection": "#4d96ff", "cta": "#2dd881",
}


def load_reels(reels_dir):
    reels = []
    for f in sorted(reels_dir.glob("*.json")):
        reels.append(json.loads(f.read_text(encoding="utf-8")))
    return reels


def block_by_type(reel, block_type):
    for b in reel.get("structure", []) or []:
        if b.get("block") == block_type:
            return b
    return None


def compute_summary(reels):
    hook_durations = []
    rehook_present = 0
    cta_starts = []
    ers = []
    for r in reels:
        hook = block_by_type(r, "hook")
        if hook and hook.get("present", True) and hook.get("start") is not None and hook.get("end") is not None:
            hook_durations.append(hook["end"] - hook["start"])
        rehook = block_by_type(r, "rehook")
        if rehook and rehook.get("present"):
            rehook_present += 1
        cta = block_by_type(r, "cta")
        if cta and cta.get("present", True) and cta.get("start") is not None:
            cta_starts.append(cta["start"])
        er = (r.get("metrics") or {}).get("engagementRate")
        if er is not None:
            ers.append(er)

    n = len(reels) or 1
    return {
        "reelCount": len(reels),
        "avgHookDuration": round(statistics.mean(hook_durations), 2) if hook_durations else None,
        "rehookShare": round(rehook_present / n, 3),
        "avgCtaStart": round(statistics.mean(cta_starts), 2) if cta_starts else None,
        "avgEngagementRate": round(statistics.mean(ers), 4) if ers else None,
    }


def safe_json(obj):
    """JSON-encode for embedding inside an HTML <script> tag.

    Escapes '</' so a literal '</script>' in scraped text (captions, transcripts)
    can't prematurely close the tag, and escapes the JS line/paragraph separators
    (valid JSON, invalid unescaped inside a JS string literal).
    """
    raw = json.dumps(obj, ensure_ascii=False)
    return (
        raw.replace("</", "<\\/")
        .replace(" ", "\\u2028")
        .replace(" ", "\\u2029")
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
  width: 72px; height: 128px; object-fit: cover; border-radius: 8px; background: #eee;
  flex-shrink: 0;
}
.card-meta { flex: 1; min-width: 0; }
.card-meta .caption {
  font-size: 13px; color: #40454c; max-height: 3.6em; overflow: hidden; margin: 0 0 8px;
}
.metrics-row { display: flex; flex-wrap: wrap; gap: 8px 14px; font-size: 12.5px; color: #40454c; }
.metrics-row b { color: #16181d; }

.card-body { border-top: 1px solid #eee; padding: 14px; display: none; }
.card.open .card-body { display: block; }

.scrubber { display: flex; gap: 4px; overflow-x: auto; padding-bottom: 6px; }
.scrubber img {
  width: 44px; height: 78px; object-fit: cover; border-radius: 4px; cursor: pointer;
  border: 2px solid transparent; flex-shrink: 0;
}
.scrubber img.active { border-color: #2ec4b6; }
.frame-preview { display: flex; gap: 14px; margin-top: 10px; }
.frame-preview img {
  width: 140px; height: 249px; object-fit: cover; border-radius: 8px; background: #eee;
  flex-shrink: 0;
}
.frame-info { flex: 1; font-size: 13px; }
.frame-info .t { font-weight: 700; color: #2ec4b6; margin-bottom: 4px; }
.frame-info .field { margin: 4px 0; }
.frame-info .field b { display: block; font-size: 11px; text-transform: uppercase; color: #8a8f96; }

.structure-bar { display: flex; height: 34px; border-radius: 6px; overflow: hidden; margin-top: 16px; }
.structure-seg {
  display: flex; align-items: center; justify-content: center; color: #fff;
  font-size: 11px; cursor: pointer; min-width: 4px; white-space: nowrap; overflow: hidden;
  opacity: 0.92;
}
.structure-seg:hover, .structure-seg.active {
  opacity: 1; outline: 2px solid rgba(0,0,0,0.35); outline-offset: -2px;
}
.structure-seg.absent {
  background: repeating-linear-gradient(45deg,#d3d6dc,#d3d6dc 6px,#e9ebee 6px,#e9ebee 12px);
  color: #8a8f96;
}
.structure-detail {
  margin-top: 8px; font-size: 13px; background: #f7f8fa; border-radius: 8px; padding: 10px 12px;
}
.structure-detail .block-label { font-weight: 700; margin-bottom: 4px; }

.transcript-toggle {
  margin-top: 14px; font-size: 13px; background: none; border: none; color: #2ec4b6;
  cursor: pointer; padding: 0;
}
.transcript {
  display: none; margin-top: 8px; max-height: 220px; overflow-y: auto; border: 1px solid #eee;
  border-radius: 8px;
}
.transcript.open { display: block; }
.transcript-line {
  display: flex; gap: 10px; padding: 6px 10px; font-size: 12.5px; cursor: pointer;
  border-bottom: 1px solid #f2f3f5;
}
.transcript-line:hover { background: #f7f8fa; }
.transcript-line .ts { color: #8a8f96; flex-shrink: 0; width: 84px; }

.hook-verdict {
  margin-top: 14px; font-size: 13px; background: #fff7ec; border: 1px solid #ffe6c2;
  border-radius: 8px; padding: 10px 12px;
}

@media (max-width: 640px) {
  .gallery { grid-template-columns: 1fr; padding: 8px 12px 32px; }
  .topbar { padding: 12px; }
  .frame-preview { flex-direction: column; }
  .frame-preview img { width: 100%; height: auto; max-height: 320px; }
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
function fmtPct(n) {
  if (n === null || n === undefined) return "—";
  return (n * 100).toFixed(2) + "%";
}
function fmtSec(n) {
  if (n === null || n === undefined) return "—";
  return n.toFixed(2) + "с";
}

function transcriptAt(reel, t) {
  return (reel.transcript || []).find(seg => t >= seg.start && t < seg.end) || null;
}
function transcriptInRange(reel, start, end) {
  return (reel.transcript || []).filter(seg => seg.end > start && seg.start < end);
}

function renderSummary() {
  const el = document.getElementById("summary");
  el.innerHTML = `
    <div class="stat-tile"><div class="value">${SUMMARY.reelCount}</div><div class="label">Роликов в отчёте</div></div>
    <div class="stat-tile"><div class="value">${SUMMARY.avgHookDuration != null ? SUMMARY.avgHookDuration.toFixed(2) + "с" : "—"}</div><div class="label">Средняя длина хука</div></div>
    <div class="stat-tile"><div class="value">${fmtPct(SUMMARY.rehookShare)}</div><div class="label">Доля роликов с рехуком</div></div>
    <div class="stat-tile"><div class="value">${SUMMARY.avgCtaStart != null ? SUMMARY.avgCtaStart.toFixed(2) + "с" : "—"}</div><div class="label">Средний старт CTA</div></div>
    <div class="stat-tile"><div class="value">${fmtPct(SUMMARY.avgEngagementRate)}</div><div class="label">Средний ER</div></div>
  `;
}

function cardHtml(reel, index) {
  const m = reel.metrics || {};
  return `
    <div class="card" data-id="${esc(reel.id)}" id="card-${index}">
      <div class="card-head" onclick="toggleCard(${index})">
        <img class="cover" src="${(reel.cover && reel.cover.dataUri) || ''}" alt="cover">
        <div class="card-meta">
          <p class="caption">${esc(reel.caption)}</p>
          <div class="metrics-row">
            <span>Просмотры <b>${fmtNum(m.views)}</b></span>
            <span>Лайки <b>${fmtNum(m.likes)}</b></span>
            <span>Комментарии <b>${fmtNum(m.comments)}</b></span>
            <span>ER <b>${fmtPct(m.engagementRate)}</b></span>
            <span>Длительность <b>${fmtSec(reel.durationSec)}</b></span>
            <span>Дата <b>${esc(reel.publishedAt) || "—"}</b></span>
          </div>
        </div>
      </div>
      <div class="card-body">
        ${storyboardHtml(reel, index)}
        ${structureHtml(reel, index)}
        <div class="hook-verdict"><b>Почему цепляет:</b> ${esc(reel.hookVerdict) || '—'}</div>
        <button class="transcript-toggle" onclick="toggleTranscript(${index})">Показать полный транскрипт ▾</button>
        ${transcriptHtml(reel, index)}
        ${reel.url ? `<p style="margin-top:10px;font-size:12.5px;"><a href="${esc(reel.url)}" target="_blank" rel="noopener">Открыть пост ↗</a></p>` : ''}
      </div>
    </div>
  `;
}

function storyboardHtml(reel, index) {
  const frames = reel.storyboard || [];
  const thumbs = frames.map((f, i) =>
    `<img src="${f.dataUri || ''}" class="${i === 0 ? 'active' : ''}" onclick="showFrame(${index}, ${i})" title="${f.t.toFixed(2)}с">`
  ).join("");
  return `
    <div class="scrubber" id="scrubber-${index}">${thumbs}</div>
    <div class="frame-preview" id="frame-preview-${index}"></div>
  `;
}

function showFrame(reelIndex, frameIndex) {
  const reel = REELS[reelIndex];
  const frame = (reel.storyboard || [])[frameIndex];
  if (!frame) return;

  const scrubber = document.getElementById(`scrubber-${reelIndex}`);
  [...scrubber.children].forEach((img, i) => img.classList.toggle("active", i === frameIndex));

  const seg = transcriptAt(reel, frame.t);
  const cap = frame.caption || {};

  document.getElementById(`frame-preview-${reelIndex}`).innerHTML = `
    <img src="${frame.dataUri || ''}" alt="frame at ${frame.t}s">
    <div class="frame-info">
      <div class="t">${frame.t.toFixed(2)}с</div>
      <div class="field"><b>Сцена</b>${esc(cap.scene) || '—'}</div>
      <div class="field"><b>Текст на экране</b>${esc(cap.onScreenText) || '—'}</div>
      <div class="field"><b>Приём удержания</b>${esc(cap.technique) || '—'}</div>
      <div class="field"><b>Реплика в этот момент</b>${seg ? esc(seg.text) : 'без речи / только визуал или музыка'}</div>
    </div>
  `;
}

function structureHtml(reel, index) {
  const blocks = reel.structure || [];
  const total = reel.durationSec || 1;
  const segs = BLOCK_ORDER.map(type => {
    const b = blocks.find(x => x.block === type);
    if (!b || !b.present) {
      return `<div class="structure-seg absent" style="flex:0.4" data-type="${type}" onclick="showBlock(${index}, '${type}')">?</div>`;
    }
    const width = Math.max(((b.end - b.start) / total) * 100, 2);
    return `<div class="structure-seg" style="flex:${width};background:${BLOCK_COLORS[type]}" data-type="${type}" onclick="showBlock(${index}, '${type}')">${BLOCK_LABELS[type]}</div>`;
  }).join("");
  return `
    <div class="structure-bar" id="structure-${index}">${segs}</div>
    <div class="structure-detail" id="structure-detail-${index}">Кликните по сегменту, чтобы увидеть суть блока.</div>
  `;
}

function showBlock(reelIndex, type) {
  const reel = REELS[reelIndex];
  const b = (reel.structure || []).find(x => x.block === type);
  const el = document.getElementById(`structure-detail-${reelIndex}`);
  if (!b || !b.present) {
    el.innerHTML = `<div class="block-label">${BLOCK_LABELS[type]}</div>${esc(b && b.note) || 'отсутствует в этом ролике'}`;
    return;
  }
  const lines = transcriptInRange(reel, b.start, b.end).map(s => s.text).join(" ");
  el.innerHTML = `
    <div class="block-label">${BLOCK_LABELS[type]} · ${b.start.toFixed(2)}–${b.end.toFixed(2)}с (${(b.end - b.start).toFixed(2)}с)</div>
    <div>${esc(b.summary)}</div>
    ${lines ? `<div style="margin-top:6px;color:#40454c;"><i>«${esc(lines)}»</i></div>` : ''}
  `;
  document.querySelectorAll(`#structure-${reelIndex} .structure-seg`).forEach(elx =>
    elx.classList.toggle("active", elx.dataset.type === type)
  );
}

function transcriptHtml(reel, index) {
  const lines = (reel.transcript || []).map((seg, i) => `
    <div class="transcript-line" onclick="jumpToTranscript(${index}, ${i})">
      <span class="ts">${seg.start.toFixed(2)}–${seg.end.toFixed(2)}с</span>
      <span>${esc(seg.text)}</span>
    </div>
  `).join("");
  return `<div class="transcript" id="transcript-${index}">${lines || '<div class="transcript-line">Транскрипт пуст.</div>'}</div>`;
}

function toggleTranscript(index) {
  document.getElementById(`transcript-${index}`).classList.toggle("open");
}

function jumpToTranscript(reelIndex, segIndex) {
  const reel = REELS[reelIndex];
  const seg = (reel.transcript || [])[segIndex];
  if (!seg) return;
  if (seg.start <= 9.75) {
    const frameIndex = Math.min(Math.round(seg.start / 0.75), (reel.storyboard || []).length - 1);
    if (frameIndex >= 0) showFrame(reelIndex, frameIndex);
  }
}

function toggleCard(index) {
  const card = document.getElementById(`card-${index}`);
  const wasOpen = card.classList.contains("open");
  card.classList.toggle("open", !wasOpen);
  if (!wasOpen && !card.dataset.initialized) {
    card.dataset.initialized = "1";
    showFrame(index, 0);
  }
}

function sortedReels() {
  const key = document.getElementById("sortKey").value;
  const dir = document.getElementById("sortDir").dataset.dir;
  const withIndex = REELS.map((r, i) => ({ r, i }));
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
  const ordered = sortedReels();
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


def render_html(reels, summary, account):
    reels_json = safe_json(reels)
    summary_json = safe_json(summary)
    block_labels_json = safe_json(BLOCK_LABELS)
    block_colors_json = safe_json(BLOCK_COLORS)
    block_order_json = safe_json(BLOCK_ORDER)
    title = f"Reels Analytics — {account}" if account else "Reels Analytics"

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
          <option value="views">Просмотрам</option>
          <option value="likes">Лайкам</option>
          <option value="comments">Комментариям</option>
          <option value="engagementRate">ER</option>
          <option value="durationSec">Длительности</option>
        </select>
      </label>
      <button id="sortDir" data-dir="desc">По убыванию ↓</button>
    </div>
  </header>

  <section class="summary" id="summary"></section>

  <main id="gallery" class="gallery"></main>

<script>
const REELS = {reels_json};
const SUMMARY = {summary_json};
const BLOCK_LABELS = {block_labels_json};
const BLOCK_COLORS = {block_colors_json};
const BLOCK_ORDER = {block_order_json};

{JS}
</script>
</body>
</html>
"""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("reels_dir", help="Directory containing one JSON file per reel")
    parser.add_argument("output", help="Path to write the final self-contained HTML report")
    parser.add_argument("--account", default="", help="Account handle to show in the report title")
    args = parser.parse_args()

    reels_dir = Path(args.reels_dir)
    reels = load_reels(reels_dir)
    if not reels:
        raise SystemExit(f"No *.json reel files found in {reels_dir}")
    reels.sort(key=lambda r: r.get("id", ""))
    summary = compute_summary(reels)
    html = render_html(reels, summary, args.account)
    Path(args.output).write_text(html, encoding="utf-8")
    print(f"Wrote report for {len(reels)} reels to {args.output}")


if __name__ == "__main__":
    main()
