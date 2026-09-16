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
import argparse, io, json, os, re, struct, subprocess, sys, tempfile, zlib

from PIL import Image
import cairosvg

FFDEC = "/mnt/c/Program Files (x86)/FFDec/ffdec.jar"
RESOLUTION = 2  # 3x (matching the avatar pipeline) made individual large items reasonable
                # (rond_centre ~10MB in VRAM, fine) but blew up once ANY item had many
                # frames (dancefloor's real 39-frame animation: 700MB). User's call: drop
                # the whole furniture category to 2x rather than special-case only animated
                # items -- less sharp than 3x, but every item (animated or not) stays a
                # reasonable size without per-item tuning.
ZOOM = RESOLUTION * 2  # matches swf_to_spritesheet.py's convention; see module doc for the zoom-2-is-current-1x proof
PAD = 3000  # px, pre-zoom canvas padding. 1000 silently clipped several items (a statue's
            # local origin isn't centered on its own art -- confirmed content bbox touching
            # x=0 exactly on haie/rondcentre/statut1-4/statut_, i.e. real content lost, not
            # just a tight-but-correct crop). Verified 3000 clears every jardin item with
            # margin to spare; bump further if a future category needs more.

# An animated nested child (see find_animated_child) gets its OWN, much
# lower, resolution and frame count than a static orientation -- exporting
# dancefloor's real 39-frame color-cycle at the standard 3x/every-frame
# settings produced a 3012x58272px atlas (~700MB of uncompressed VRAM per
# GPU upload: 39 copies of a 3000x1488 frame). This is a large FLOOR PLANE,
# not a small prop -- its per-pixel sharpness matters far less than a
# close-up avatar accessory, and a color-cycling light show doesn't need
# every one of 39 near-identical tween steps to read as smooth animation.
# ANIM_ZOOM=2 (1x, same as this item's OTHER static orientations' source
# resolution) + keeping every 3rd frame (13 of 39) brings a single frame
# down to roughly 1000x496 and the whole atlas to ~6.5MB uncompressed --
# still a real animation, not a slideshow, at a size that's actually
# shippable. Revisit per-item if a future animated item's own art is small
# enough that the standard resolution/frame-count wouldn't be excessive.
ANIM_ZOOM = 2
ANIM_FRAME_STRIDE = 3

# Some of these items aren't vector art at all: the SWF holds a small bitmap
# and the "shape" is just a rectangle filled with it (confirmed on banc.swf --
# its shapes embed a 79x26 and a 50x50 PNG). Rendering those through the
# standard ZOOM path upscales a 79x26 bitmap to 317x105 and then hands the GPU
# a sheet declaring scale 2, so it gets resampled a second time on the way back
# down to its 158x52 display size. Two resamplings of an image that never had
# the detail to begin with -- that's the "the banc looks blurry" report. There
# is no detail to recover (the source really is 79x26), but exporting these at
# 1x means exactly one resampling instead of two, and a sheet 1/4 the size.
BITMAP_ZOOM = 2


def format_scale(value):
    """PixiJS parses "scale" with parseFloat either way, but keeping whole
    numbers whole ("2", not "2.0") means re-exporting an unchanged item
    produces a byte-identical JSON instead of a diff in every file."""
    return str(int(value)) if float(value).is_integer() else str(value)


def swf_frame_rate(swf_path, default=12.0):
    """Frames per second declared in the SWF header, for animated items.

    Read straight out of the header rather than assumed: the rate decides how
    fast the runtime plays the exported frames back, and Flash files in this
    set are not all the 24fps default (dancefloor.swf is 12). Header layout is
    signature(3) + version(1) + length(4), then a RECT whose first 5 bits give
    the bit width of its four fields, then frameRate as an 8.8 fixed-point
    UI16. CWS means the part after the length is zlib-compressed.
    """
    try:
        raw = open(swf_path, "rb").read()
        sig = raw[:3].decode("latin1")
        if sig == "CWS":
            body = zlib.decompress(raw[8:])
        elif sig == "FWS":
            body = raw[8:]
        else:
            return default
        nbits = body[0] >> 3
        rect_bytes = (5 + nbits * 4 + 7) // 8
        return struct.unpack("<H", body[rect_bytes:rect_bytes + 2])[0] / 256.0
    except Exception:
        return default


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


def export_all_frames(swf_path, char_id, work_dir, zoom=ZOOM):
    out_dir = os.path.join(work_dir, f"frames_{char_id}_{zoom}")
    run_ffdec("-config", "svgRetainBounds=true", "-zoom", str(zoom), "-format", "sprite:svg",
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


CHILD_USE_RE = re.compile(
    r'^    <use ffdec:characterId="(\d+)"[^>]*\btransform="matrix\(1\.0, 0\.0, 0\.0, 1\.0, (-?[\d.]+), (-?[\d.]+)\)"[^>]*/>\s*$',
    re.MULTILINE)


def build_frame_count_map(work_dir):
    """characterId -> that symbol's own frameCount, read once from the
    already-fetched meta.xml (find_named_instance_id() wrote it here).
    Used to tell an animated nested child (e.g. dancefloor's 39-frame
    color-cycling floor) apart from a plain static shape (frameCount=1) --
    see process_item()'s animated-orientation branch.
    """
    xml_path = os.path.join(work_dir, "meta.xml")
    with open(xml_path, errors="ignore") as f:
        content = f.read()
    return {m.group(2): int(m.group(1)) for m in
            re.finditer(r'frameCount="(\d+)"[^>]*spriteId="(\d+)"', content)}


def find_animated_child(clean_svg, frame_counts):
    """After strip_points() removes the ground-anchor markers, this
    orientation's frame should have exactly one root-level <use> left: the
    item's own art. If that art is itself a nested MovieClip with more than
    one frame (not just a static shape), it's an animation FFDec's static
    per-orientation SVG export freezes on frame 1 of -- e.g. dancefloor's
    checkerboard light cycle. Returns (child_char_id, offset_x, offset_y)
    in the same pre-zoom units as everything else (the child's placement
    matrix within this orientation's own frame), or None if this
    orientation's art is just a plain static shape.
    """
    matches = CHILD_USE_RE.findall(clean_svg)
    if len(matches) != 1:
        return None
    char_id, tx, ty = matches[0]
    if frame_counts.get(char_id, 1) <= 1:
        return None
    return char_id, float(tx), float(ty)


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
    """entries: list of (filename, PIL image, points_px). Returns (atlas, frames_dict).

    atlas_w grows to fit whichever single entry is widest: the row-wrap
    check below only ever compares "does adding this item overflow the
    row", never "is this item wider than the atlas on its own" -- a lone
    item wider than the default 1024 (seen: rond_centre at 1741px, a wide
    ring shape) would get placed at its row's start and then silently
    clipped when pasted into a fixed-width atlas Image (Image.paste()
    truncates instead of raising). Avatar clothing never hit this (every
    item comfortably under 240px), furniture can be much bigger.
    """
    entries = sorted(entries, key=lambda e: -e[1].height)
    atlas_w = max(atlas_w, max((im.width for _, im, _ in entries), default=0) + 2 * pad)
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

    # Bitmap-backed art gets rendered at 1x instead of the vector upscale --
    # see BITMAP_ZOOM. Decided from frame 1 (an item is one or the other, not
    # a mix) and the export is redone at the lower zoom when it applies.
    with open(os.path.join(frame_dir, "1.svg"), errors="ignore") as f:
        bitmap_backed = "data:image" in f.read()
    static_zoom = BITMAP_ZOOM if bitmap_backed else ZOOM
    if static_zoom != ZOOM:
        frame_dir, n_frames = export_all_frames(swf_path, char_id, work_dir, zoom=static_zoom)
        if not frame_dir or n_frames == 0:
            print("ERROR: ffdec re-export at bitmap zoom produced no frames", file=sys.stderr)
            sys.exit(1)

    frame_counts = build_frame_count_map(work_dir)
    marker_depth_order = None
    marker_char_id = None
    entries = []
    animated_orientations = 0
    zooms_used = set()
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

        animated = find_animated_child(clean_svg, frame_counts)
        if animated:
            # This orientation's own art is itself a multi-frame MovieClip
            # (e.g. dancefloor's 39-frame color cycle) -- FFDec's static
            # per-orientation SVG export freezes it on frame 1, so pull its
            # OWN frames independently and reposition each using the child's
            # placement offset within this orientation's frame (see
            # find_animated_child's doc) so the ground points -- extracted
            # once, from the STILL orientation frame -- land on every
            # animation frame identically (the footprint doesn't move, only
            # the colors cycle).
            child_id, off_x, off_y = animated
            child_frame_dir, child_n = export_all_frames(swf_path, child_id, work_dir, zoom=ANIM_ZOOM)
            if not child_frame_dir or child_n <= 1:
                print(f"WARNING: orientation {n}'s animated child export failed, "
                      f"falling back to static", file=sys.stderr)
                animated = None
            else:
                animated_orientations += 1
                for out_n, m in enumerate(range(1, child_n + 1, ANIM_FRAME_STRIDE)):
                    csvg_path = os.path.join(child_frame_dir, f"{m}.svg")
                    if not os.path.exists(csvg_path):
                        continue
                    with open(csvg_path, errors="ignore") as f:
                        csvg = f.read()
                    im, bbox = render_padded(csvg)
                    if bbox is None:
                        continue
                    trimmed = im.crop(bbox)
                    points_px = [(name, round((x - off_x) * ANIM_ZOOM + PAD - bbox[0]),
                                  round((y - off_y) * ANIM_ZOOM + PAD - bbox[1]))
                                 for (name, x, y) in points_raw]
                    fname = f"{item_id}_{n}_{out_n}.png"
                    entries.append((fname, trimmed, points_px))
                    zooms_used.add(ANIM_ZOOM)

        if not animated:
            im, bbox = render_padded(clean_svg)
            if bbox is None:
                print(f"WARNING: frame {n} is empty after stripping points, skipping", file=sys.stderr)
                continue
            trimmed = im.crop(bbox)
            points_px = [(name, round(x * static_zoom + PAD - bbox[0]), round(y * static_zoom + PAD - bbox[1]))
                         for (name, x, y) in points_raw]
            fname = f"{item_id}_{n}.png"
            entries.append((fname, trimmed, points_px))
            zooms_used.add(static_zoom)

    if not entries:
        print("ERROR: no frames produced", file=sys.stderr)
        sys.exit(1)
    # "scale" is what PixiJS divides every frame rect by, so it has to state
    # the zoom these pixels were actually rendered at, not a constant. zoom 2
    # is the shipped 1x (see the module doc), hence zoom/2. Getting this wrong
    # is silent and only shows up as an item rendering at the wrong SIZE:
    # dancefloor shipped at ANIM_ZOOM=2 while still declaring scale 2, so it
    # drew at half the size it should have.
    if len(zooms_used) != 1:
        print(f"ERROR: mixed render zooms in one sheet ({sorted(zooms_used)}). A "
              f"TexturePacker sheet has a single 'scale' for all its frames, so an "
              f"item with both static and animated orientations can't be expressed "
              f"here -- give the animated orientation its own sheet.", file=sys.stderr)
        sys.exit(1)
    zoom_used = zooms_used.pop()

    atlas, frames = pack_atlas(entries)
    os.makedirs(out_dir, exist_ok=True)
    atlas.save(os.path.join(out_dir, f"{item_id}.png"))
    meta = {"version": "1.0", "image": f"{item_id}.png", "format": "RGBA8888",
            "size": {"w": atlas.width, "h": atlas.height}, "scale": format_scale(zoom_used / 2)}
    if animated_orientations:
        # Playback rate for the runtime. Every ANIM_FRAME_STRIDE-th frame was
        # kept, so the remaining ones have to be shown that many times slower
        # to keep the animation's real duration.
        meta["animationFps"] = round(swf_frame_rate(swf_path) / ANIM_FRAME_STRIDE, 3)
    json.dump({"frames": frames, "meta": meta}, open(os.path.join(out_dir, f"{item_id}.json"), "w"))
    n_pts = len(entries[0][2])
    anim_note = f", {animated_orientations} animated orientation(s)" if animated_orientations else ""
    src_note = ", bitmap source (rendered 1x)" if bitmap_backed else ""
    print(f"wrote {item_id}.png/.json ({len(frames)} total frames, {n_pts} ground points"
          f"{anim_note}{src_note}, scale {meta['scale']}) to {out_dir}")


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
