#!/usr/bin/env python3
"""
Download a static creative image and prepare it as a base64 data URI for the
static-creatives-report skill (organic posts and ad-library banners alike).

Usage:
  python3 prepare_image.py <image_url> <out.json> [--width 640] [--quality 82] [--raw-dir raw]

Downloads the image with the standard library (urllib -- no extra Python deps), then re-encodes and
resizes it through ffmpeg (already a project prerequisite, and it handles plain images fine, not
just video) so report payload size stays predictable. Writes
{"sourceUrl": ..., "localPath": ..., "dataUri": ...} to <out.json>.
"""
import argparse
import base64
import json
import subprocess
import urllib.request
from pathlib import Path
from urllib.error import URLError
from urllib.parse import urlparse


def download(url, dest):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        dest.write_bytes(resp.read())


def resize_to_jpeg(src, width, quality):
    out = src.with_suffix(".resized.jpg")
    qscale = max(2, min(31, round(31 - (quality / 100) * 28)))
    cmd = [
        "ffmpeg", "-y", "-loglevel", "error",
        "-i", str(src),
        "-vf", f"scale={width}:-2",
        "-q:v", str(qscale),
        str(out),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0 or not out.exists():
        raise RuntimeError(f"ffmpeg failed to prepare {src}: {result.stderr.strip()}")
    return out


def guess_suffix(url):
    path = urlparse(url).path
    suffix = Path(path).suffix
    return suffix if suffix else ".jpg"


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("url")
    ap.add_argument("out")
    ap.add_argument("--width", type=int, default=640)
    ap.add_argument("--quality", type=int, default=82)
    ap.add_argument("--raw-dir", default="raw")
    args = ap.parse_args()

    raw_dir = Path(args.raw_dir)
    raw_dir.mkdir(parents=True, exist_ok=True)
    src = raw_dir / (Path(args.out).stem + guess_suffix(args.url))

    try:
        download(args.url, src)
    except URLError as e:
        raise SystemExit(f"Failed to download {args.url}: {e}")

    resized = resize_to_jpeg(src, args.width, args.quality)
    data_uri = "data:image/jpeg;base64," + base64.b64encode(resized.read_bytes()).decode("ascii")
    Path(args.out).write_text(
        json.dumps({"sourceUrl": args.url, "localPath": str(src), "dataUri": data_uri}, indent=2),
        encoding="utf-8",
    )
    print(f"Wrote {args.out} ({resized.stat().st_size} bytes resized, source {src})")


if __name__ == "__main__":
    main()
