#!/usr/bin/env python3
"""Convert a Gabbos-era Flash (.swf) furniture item into a game-ready
spritesheet (PNG atlas + TexturePacker-style JSON), matching the contract
`game-assets/public/furnitures/README.md` documents.

Different source convention than avatar clothing (see swf_to_spritesheet.py):
the item's own SWF has a top-level MovieClip instance named 'objet' with an
N-frame timeline (N = however many orientations this item has -- 1 for a
single-view item like most statues, 2 for banc/haie, 7 for herbe's variants).
Frame k is orientation k, straight -- no CA/CHAP-style direction table to
decode, unlike avatar items.

Ground-anchor points are NOT a heuristic here -- they're read directly off
the SWF. Inside 'objet's own frame content, the artist placed one tiny
marker symbol per polygon vertex, each with its own name ('pt1', 'pt2', ...
however many the item needs -- 0 for a flat walkable tile like herbe/pave/
rondcentre, 4 for most items, up to 11 seen on one complex item). Only
frame 1 re-states each depth's name (Flash only needs to name a depth once;
a later frame's MoveObject at that same depth inherits it silently) --
tracked by depth pt_by_depth() falls back on that when a later frame's
<use> has no id attribute of its own.

Positioning is the SAME "self-anchor" principle as the accessory half of
swf_to_spritesheet.py: retainBounds keeps one shared (0,0) origin across
this symbol's own frames, so both the art AND the marker points -- which
are siblings of the art in the exact same per-frame coordinate space, not
some separate heuristic guess -- convert into the final trimmed frame's own
pixel space with the same (PAD - bbox[0], PAD - bbox[1]) shift. No
heuristic at all is needed here (unlike avatar hat/hair's dir1 calibration
problem) since the marker points ARE the ground truth, not a stand-in for
it.

retainBounds' own DECLARED canvas size is unreliable on these files too
(seen: a literal negative width/height on banc.swf, worse than the
clipping-but-still-positive case found on some avatar hair) -- same fix as
the accessory pipeline: override the declared canvas to a generous padded
size before rasterizing, keep the (0,0)-anchored transform.

Resolution: current shipped furniture assets (game-assets/public/
furnitures/*) were exported at -zoom 2 (confirmed: re-exporting banc.swf at
zoom 2 reproduces its shipped 198x66 frame within a few px). This tool
defaults to -zoom 6, i.e. 3x that -- the same upscale factor already
applied to the avatar body and every clothing item this session, for the
same reason (vector source, so re-exporting at a higher native resolution
is free anti-aliased detail, not an interpolated blur).

Usage:
  python3 swf_to_furniture.py INPUT.swf ITEM_ID --out-dir DIR

Requires: JPEXS FFDec (path below), cairosvg, Pillow.
"""
import argparse, io, json, os, re, subprocess, sys, tempfile

from PIL import Image
import cairosvg

FFDEC = "/mnt/c/Program Files (x86)/FFDec/ffdec.jar"
RESOLUTION = 3
ZOOM = RESOLUTION * 2  # matches swf_to_spritesheet.py's convention; see module doc for the zoom-2-is-current-1x proof
PAD = 1000  # px, pre-zoom canvas padding -- generous enough for any furniture item's own extent


def run_ffdec(*args, timeout=60):
    subprocess.run(["java", "-jar", FFDEC, *args], stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL, timeout=timeout)


def find_named_instance_id(swf_path, name, work_dir):
    xml_path = os.path.join(work_dir, "meta.xml")
    run_ffdec("-swf2xml", swf_path, xml_path)
    if not os.path.exists(xml_path):
        return None
    with open(xml_path, "r", errors="ignore") as f:
        content = f.read()
    m = re.search(rf'characterId="(\d+)"[^>]*depth="1"[^>]*name="{name}"', content)
    if not m:
        m = re.search(rf'characterId="(\d+)"[^>]*name="{name}"', content)
    return m.group(1) if m else None


def export_all_frames(swf_path, char_id, work_dir):
    out_dir = os.path.join(work_dir, "frames")
    run_ffdec("-config", "svgRetainBounds=true", "-zoom", str(ZOOM), "-format", "sprite:svg",
              "-selectid", char_id, "-export", "sprite", out_dir, swf_path)
    for d in os.listdir(out_dir) if os.path.isdir(out_dir) else []:
        if d.startswith("DefineSprite_"):
            frame_dir = os.path.join(out_dir, d)
            svgs = [f for f in os.listdir(frame_dir) if f.endswith(".svg")]
            return frame_dir, len(svgs)
    return None, 0


# A marker <use> looks like:
#   <use ffdec:characterId="4" height="10.0" id="pt2" transform="matrix(1.0, 0.0, 0.0, 1.0, -77.2, -12.05)" .../>
# Only root-level ("    " 4-space indent) uses are candidates -- nested
# <use> inside <defs> (nested sprite refs) never carry these ids since the
# artist named the top-level placement, not the marker symbol's own shape.
POINT_USE_RE = re.compile(
    r'^    <use ffdec:characterId="(\d+)"[^>]*\bid="(pt\d+)"[^>]*\btransform="matrix\(1\.0, 0\.0, 0\.0, 1\.0, (-?[\d.]+), (-?[\d.]+)\)"[^>]*/>\s*$',
    re.MULTILINE)


def anon_marker_re(marker_char_id):
    """A later frame's marker at the same depth has no id (Flash only names
    a depth once) -- still root-level, same matrix shape, just anonymous.
    Scoped to the SAME characterId frame 1's named markers used, not a
    hardcoded id -- that id is only ever the marker symbol's own, but it's
    assigned per-SWF-file, so a different item's marker symbol can land on
    a completely different (and otherwise-meaningless) characterId.
    """
    return re.compile(
        rf'^    <use ffdec:characterId="{marker_char_id}"[^>]*\btransform="matrix\(1\.0, 0\.0, 0\.0, 1\.0, (-?[\d.]+), (-?[\d.]+)\)"[^>]*/>\s*$',
        re.MULTILINE)


def strip_points(svg_text, marker_depth_order, marker_char_id):
    """Remove every root-level marker <use> (named or anonymous -- see
    module doc on why only frame 1 keeps its names) and return (clean_svg,
    points), points = [(name, x, y), ...] in this frame's own local
    (pre-zoom) coordinate space -- same space the art itself is drawn in.
    `marker_depth_order`/`marker_char_id`: from frame 1 (see process_item)
    -- empty/None means this item has no ground points at all (confirmed:
    true for several jardin items, e.g. flat walkable tiles), in which case
    nothing is stripped. Guessing at anonymous markers when frame 1 never
    established any would risk matching real art that coincidentally
    shares a characterId with some OTHER item's marker symbol (characterId
    is assigned per-SWF-file, not a stable cross-file constant) -- this bit
    us once on herbe.swf, where an anonymous fallback with no `marker_char_id`
    guard silently ate a whole frame's actual artwork.
    """
    named = POINT_USE_RE.findall(svg_text)
    if named:
        points = [(name, float(x), float(y)) for _cid, name, x, y in named]
        clean = POINT_USE_RE.sub("", svg_text)
        return clean, points

    if not marker_depth_order or marker_char_id is None:
        return svg_text, []

    anon_re = anon_marker_re(marker_char_id)
    anon = anon_re.findall(svg_text)
    points = [(marker_depth_order[i] if i < len(marker_depth_order) else f"pt{i+1}", float(x), float(y))
              for i, (x, y) in enumerate(anon)]
    clean = anon_re.sub("", svg_text)
    return clean, points


def render_padded(svg_text):
    """Same technique as swf_to_spritesheet.py's render_padded(): override
    retainBounds' own (unreliable -- seen negative on these files) declared
    canvas, keep its (0,0)-anchored transform. Returns (image, bbox)."""
    padded = re.sub(r'height="-?[\d.]+px" width="-?[\d.]+px"', f'height="{PAD*2}px" width="{PAD*2}px"', svg_text, count=1)
    padded = re.sub(r'matrix\(([\d.]+), 0\.0, 0\.0, ([\d.]+), 0\.0, 0\.0\)',
                     rf'matrix(\1, 0.0, 0.0, \2, {PAD}, {PAD})', padded, count=1)
    im = Image.open(io.BytesIO(cairosvg.svg2png(bytestring=padded.encode("utf-8")))).convert("RGBA")
    return im, im.getbbox()


def pack_atlas(entries, atlas_w=1024, pad=6):
    """entries: list of (filename, PIL image, points_px). Returns (atlas, frames_dict)."""
    entries = sorted(entries, key=lambda e: -e[1].height)
    cx, cy, row_h = pad, pad, 0
    placements = []
    for fname, im, points in entries:
        if cx + im.width + pad > atlas_w:
            cx, cy, row_h = pad, cy + row_h + pad, 0
        placements.append((fname, im, points, cx, cy))
        cx += im.width + pad
        row_h = max(row_h, im.height)
    atlas_h = cy + row_h + pad
    atlas = Image.new("RGBA", (atlas_w, atlas_h), (0, 0, 0, 0))
    frames = {}
    for fname, im, points, px, py in placements:
        atlas.paste(im, (px, py))
        entry = {
            "frame": {"x": px, "y": py, "w": im.width, "h": im.height},
            "rotated": False, "trimmed": False,
            "spriteSourceSize": {"x": 0, "y": 0, "w": im.width, "h": im.height},
            "sourceSize": {"w": im.width, "h": im.height},
        }
        if points:
            entry["points"] = [{"x": x, "y": y} for (_, x, y) in points]
        frames[fname] = entry
    return atlas, frames


def process_item(swf_path, item_id, out_dir, work_dir=None):
    work_dir = work_dir or tempfile.mkdtemp(prefix="swf_to_furniture_")
    os.makedirs(work_dir, exist_ok=True)
    char_id = find_named_instance_id(swf_path, "objet", work_dir)
    if not char_id:
        print(f"ERROR: no 'objet' instance found in {swf_path}", file=sys.stderr)
        sys.exit(1)
    frame_dir, n_frames = export_all_frames(swf_path, char_id, work_dir)
    if not frame_dir or n_frames == 0:
        print("ERROR: ffdec export produced no frames", file=sys.stderr)
        sys.exit(1)

    marker_depth_order = None
    marker_char_id = None
    entries = []
    for n in range(1, n_frames + 1):
        svg_path = os.path.join(frame_dir, f"{n}.svg")
        if not os.path.exists(svg_path):
            print(f"WARNING: missing frame {n}, skipping", file=sys.stderr)
            continue
        with open(svg_path, errors="ignore") as f:
            svg = f.read()

        if n == 1:
            first_named = POINT_USE_RE.findall(svg)
            marker_depth_order = [name for _cid, name, _x, _y in first_named]
            marker_char_id = first_named[0][0] if first_named else None
        clean_svg, points_raw = strip_points(svg, marker_depth_order, marker_char_id)

        im, bbox = render_padded(clean_svg)
        if bbox is None:
            print(f"WARNING: frame {n} is empty after stripping points, skipping", file=sys.stderr)
            continue
        trimmed = im.crop(bbox)

        points_px = [(name, round(x * ZOOM + PAD - bbox[0]), round(y * ZOOM + PAD - bbox[1]))
                     for (name, x, y) in points_raw]

        fname = f"{item_id}_{n}.png"
        entries.append((fname, trimmed, points_px))

    if not entries:
        print("ERROR: no frames produced", file=sys.stderr)
        sys.exit(1)
    atlas, frames = pack_atlas(entries)
    os.makedirs(out_dir, exist_ok=True)
    atlas.save(os.path.join(out_dir, f"{item_id}.png"))
    meta = {"version": "1.0", "image": f"{item_id}.png", "format": "RGBA8888",
            "size": {"w": atlas.width, "h": atlas.height}, "scale": str(RESOLUTION)}
    json.dump({"frames": frames, "meta": meta}, open(os.path.join(out_dir, f"{item_id}.json"), "w"))
    n_pts = len(entries[0][2])
    print(f"wrote {item_id}.png/.json ({len(frames)} orientation frames, {n_pts} ground points) to {out_dir}")


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("swf")
    p.add_argument("item_id")
    p.add_argument("--out-dir", required=True)
    p.add_argument("--work-dir")
    args = p.parse_args()
    process_item(args.swf, args.item_id, args.out_dir, args.work_dir)


if __name__ == "__main__":
    main()
