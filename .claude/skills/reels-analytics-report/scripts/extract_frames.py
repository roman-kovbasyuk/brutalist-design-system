#!/usr/bin/env python3
"""
Extract and base64-encode frames from a video for the reels-analytics-report skill.

Two modes:
  storyboard  14 frames across the first 10s, one every 0.75s (0.00, 0.75, ... 9.75)
  single      one frame at an arbitrary timestamp (for structure-block representative frames)

Usage:
  python3 extract_frames.py storyboard <video.mp4> <out.json> [--width 320] [--quality 70]
  python3 extract_frames.py single <video.mp4> <timestamp_seconds> <out.json> [--width 480] [--quality 75]

Requires ffmpeg on PATH. Uses only the Python standard library otherwise.
"""
import argparse
import base64
import json
import subprocess
import tempfile
from pathlib import Path

STORYBOARD_STEP = 0.75
STORYBOARD_COUNT = 14  # 0.00 .. 9.75


def grab_frame(video_path, timestamp, width, quality):
    """Extract one frame at `timestamp` seconds, scaled to `width` px wide, as JPEG bytes."""
    with tempfile.TemporaryDirectory() as tmp:
        out_path = Path(tmp) / "frame.jpg"
        qscale = max(2, min(31, round(31 - (quality / 100) * 28)))
        cmd = [
            "ffmpeg", "-y", "-loglevel", "error",
            "-i", str(video_path),
            "-ss", f"{timestamp:.3f}",
            "-frames:v", "1",
            "-vf", f"scale={width}:-2",
            "-q:v", str(qscale),
            str(out_path),
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0 or not out_path.exists():
            raise RuntimeError(
                f"ffmpeg failed to extract frame at {timestamp}s from {video_path}: "
                f"{result.stderr.strip()}"
            )
        return out_path.read_bytes()


def to_data_uri(jpeg_bytes):
    return "data:image/jpeg;base64," + base64.b64encode(jpeg_bytes).decode("ascii")


def storyboard(video_path, width, quality):
    frames = []
    for i in range(STORYBOARD_COUNT):
        t = round(i * STORYBOARD_STEP, 2)
        try:
            jpeg = grab_frame(video_path, t, width, quality)
            frames.append({"t": t, "dataUri": to_data_uri(jpeg), "error": None})
        except RuntimeError as e:
            frames.append({"t": t, "dataUri": None, "error": str(e)})
    return frames


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="mode", required=True)

    sp = sub.add_parser("storyboard", help="Extract the 14-frame, 0.75s-step storyboard")
    sp.add_argument("video")
    sp.add_argument("out")
    sp.add_argument("--width", type=int, default=320)
    sp.add_argument("--quality", type=int, default=70)

    sg = sub.add_parser("single", help="Extract one frame at an arbitrary timestamp")
    sg.add_argument("video")
    sg.add_argument("timestamp", type=float)
    sg.add_argument("out")
    sg.add_argument("--width", type=int, default=480)
    sg.add_argument("--quality", type=int, default=75)

    args = parser.parse_args()

    if args.mode == "storyboard":
        frames = storyboard(args.video, args.width, args.quality)
        Path(args.out).write_text(
            json.dumps({"video": args.video, "frames": frames}, indent=2), encoding="utf-8"
        )
        ok = sum(1 for f in frames if f["dataUri"])
        print(f"Wrote {ok}/{len(frames)} frames to {args.out}")
        if ok < len(frames):
            print(f"  ({len(frames) - ok} frame(s) failed, likely because the video is shorter "
                  f"than 10s — leave them as missing, don't pad with duplicates)")
    else:
        jpeg = grab_frame(args.video, args.timestamp, args.width, args.quality)
        data = {"video": args.video, "t": args.timestamp, "dataUri": to_data_uri(jpeg)}
        Path(args.out).write_text(json.dumps(data, indent=2), encoding="utf-8")
        print(f"Wrote frame at {args.timestamp}s to {args.out}")


if __name__ == "__main__":
    main()
