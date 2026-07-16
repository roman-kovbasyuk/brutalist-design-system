#!/usr/bin/env python3
"""
Validate a rendered storyboard scene frame against its expected canvas size and basic quality gates.

Usage:
  python3 check_frame.py <frame.png|jpg> <expected_width> <expected_height> [--min-bytes 5000]

Identical approach to static-banner-design/scripts/check_banner.py (each skill is kept self-
contained, per this repo's convention). Uses ffprobe (already a project prerequisite) to read real
pixel dimensions -- no Pillow/extra Python dependency needed.
"""
import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path


def probe_dimensions(path):
    if shutil.which("ffprobe") is None:
        raise RuntimeError("ffprobe not found on PATH (part of the ffmpeg prerequisite)")
    cmd = [
        "ffprobe", "-v", "error", "-select_streams", "v:0",
        "-show_entries", "stream=width,height", "-of", "json", str(path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"ffprobe failed on {path}: {result.stderr.strip()}")
    data = json.loads(result.stdout)
    streams = data.get("streams") or []
    if not streams:
        raise RuntimeError(f"ffprobe found no image stream in {path} -- is it a valid image file?")
    return streams[0].get("width"), streams[0].get("height")


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("image")
    ap.add_argument("expected_width", type=int)
    ap.add_argument("expected_height", type=int)
    ap.add_argument("--min-bytes", type=int, default=5000)
    args = ap.parse_args()

    path = Path(args.image)
    if not path.exists():
        sys.exit(f"FAIL: {path} does not exist")

    size = path.stat().st_size
    if size < args.min_bytes:
        sys.exit(
            f"FAIL: {path} is only {size} bytes -- likely a blank/broken render "
            f"(min {args.min_bytes}; pass --min-bytes to adjust for a legitimately tiny asset)"
        )

    try:
        width, height = probe_dimensions(path)
    except RuntimeError as e:
        sys.exit(f"FAIL: {e}")

    if (width, height) != (args.expected_width, args.expected_height):
        sys.exit(
            f"FAIL: {path} is {width}x{height}, expected {args.expected_width}x{args.expected_height} "
            f"-- re-render with a matching --viewport-size"
        )

    print(f"OK: {path} is {width}x{height}, {size} bytes")


if __name__ == "__main__":
    main()
