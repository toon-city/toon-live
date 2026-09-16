#!/usr/bin/env python3
"""Convert a Gabbos-era Flash (.swf) clothing/accessory item into a
game-ready spritesheet (PNG atlas + TexturePacker-style JSON), matching the
conventions Clothe.ts / AnimatedClothe.ts / ClotheSleeve.ts already expect.

Two source conventions exist in the original game and are both supported:

  "garment" (category: pant, tshirt, ...): the item's own SWF has a
  top-level MovieClip instance named 'vetbas' (bottom wear) or 'vetmil'
  (top wear / makeup / ghost skin) with a 16-frame timeline: frame N is
  CA state N, i.e. 8 directions x 2 poses (walk, stop).

  --slot bas outputs AnimatedClothe's frame contract (Pant.ts):
  {id}_{direction}_{n}.png, n=0 (stop) or 1 (walk).

  --slot milieu outputs Tshirt.ts's contract (Clothe, overridden):
  {id}_bd_{direction}.png, one static frame per direction, embedded arm
  content stripped out. See export_milieu()'s docstring for why this
  does NOT also generate ClotheSleeve ({id}_al/ar_*) overlays.

  "accessory" (category: hat, hair): the item's own SWF has a top-level
  instance named 'chap' (hat) or 'coif' (hair) with an 8-frame timeline:
  frame N is CHAP/CHEV state N, one static pose per direction (no
  walk/stop split -- CHAP and CHEV always share the same index per
  direction in the original _keys table). Output uses Clothe.ts's frame
  contract: {id}_{direction}.png.

Both conventions were reverse-engineered from the decompiled _keys table
in User.as (ANIM field forms a closed rotation used to resolve which
compass direction each CA/CHAP index is) and cross-checked against the
game's own movement bitmask (up=2, down=1, left=8, right=4). See the CA_TO_DIR
comment below for the resulting table.

Positioning for "accessory" (hat/hair) IS re-derived from the SWF's own
placement matrix -- see cmd_accessory's "self-anchor" comment. Cross-symbol
matrix math (combining a LOADED item's own coordinates with the BODY rig's
placeholder matrix) was tried and abandoned earlier this session and ruled
out entirely; the technique that actually works is narrower and doesn't
need that: within one item's OWN 8-direction timeline, retainBounds keeps
a single, real, consistent (0,0) origin (confirmed: the body rig places
casquette/cheveux ONCE, never moves them again across its own 16-frame
timeline -- same static-placeholder pattern holds in every item SWF
checked). Calibrate dir1 against the body with the old heuristic (still
needed -- it's the one direction with nothing to anchor against yet), then
carry that SAME origin through to the other 7 directions via each frame's
own bbox. No cross-file assumption, no shared template needed -- confirmed
on a 9-item family from one shared template AND on lone items with no
siblings at all.

"garment" (bas/milieu) still uses the older, plainer techniques: a fixed
pixel offset for "bas" (center-matched once against the body's hip overlap
zone, proven across 176 items sharing one source-SWF family) and per-frame
body-torso-center-matching for "milieu" (SLOT_OFFSET's comment has the
full reasoning for why each slot ended up where it did, including the
cross-file-registration dead end that self-anchor for accessories got
past).

Usage:
  python3 swf_to_spritesheet.py garment INPUT.swf ITEM_ID --slot bas
  python3 swf_to_spritesheet.py garment INPUT.swf ITEM_ID --slot milieu
  python3 swf_to_spritesheet.py accessory INPUT.swf ITEM_ID --slot hat
  python3 swf_to_spritesheet.py accessory INPUT.swf ITEM_ID --slot hair [--no-tint-detect]

Requires: JPEXS FFDec (path below), cairosvg, Pillow, numpy.
"""
import argparse, io, json, os, re, subprocess, sys, tempfile
import xml.etree.ElementTree as ET

from PIL import Image
import numpy as np
import cairosvg

FFDEC = "/mnt/c/Program Files (x86)/FFDec/ffdec.jar"
RESOLUTION = 3       # shipped pixel density over the logical 80x120 canvas
ZOOM = RESOLUTION * 2  # empirically: ffdec -zoom N == (N/2)x of the logical canvas

TOON_JSON = "/root/git/toon-live/game-core/assets/toon/toon.json"
TOON_PNG = "/root/git/toon-live/game-core/assets/toon/toon.png"

# Per-item manual nudges, applied on TOP of whatever the slot's formula
# computes -- the same thing this codebase has always done for an outlier
# item (pant1's own spriteSourceSize was hand-edited across several commits:
# "pant1 fine-tune offsets round 2 (1px nudges, all 8 directions)",
# "pant1 per-direction placement nudges", etc. -- see its git log), just
# centralized here instead of hand-editing baked pixel offsets in a JSON
# every time a new outlier turns up. No slot formula generalizes perfectly
# (see SLOT_OFFSET / HAIR_WIDEST_ROW_OFFSET comments for why) -- this is the
# escape hatch for the item that doesn't fit the formula, not a replacement
# for it.
#
# Every frame already gets its OWN independently-baked spriteSourceSize
# (TexturePacker's own per-frame contract, nothing shared) -- this override
# table only needs to express a CORRECTION on top of that, at whatever
# granularity the outlier needs: item-wide, one direction, or (for a
# garment with a stop/walk split) one specific direction+pose. Chain, each
# level adding on top of the last: {"dx": N, "dy": N} (every frame of this
# item) -> "dirs": {"<direction>": {"dx": N, "dy": N} (every frame of that
# direction) -> "frames": {"<n>": {"dx": N, "dy": N}}}} (that one pose only,
# n=0 stop / n=1 walk -- "bas"/AnimatedClothe items only, "milieu"/hat/hair
# have a single frame per direction so this level never applies there).
#
# In practice n=0 and n=1 shouldn't need independent correction for "bas":
# both poses of a direction are rasterized from the SAME shared retainBounds
# canvas and pasted at the SAME fixed OX/OY (see cmd_garment), so whatever
# offset fixes one fixes the other -- their relative position to each other
# is already correct straight from the source SWF, only their position
# relative to the BODY can be off, uniformly for both. The "frames" level
# exists as an escape hatch in case a real exception turns up, not because
# one is expected.
ANCHOR_OVERRIDES_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "anchor_overrides.json")


def load_anchor_overrides():
    if os.path.exists(ANCHOR_OVERRIDES_PATH):
        with open(ANCHOR_OVERRIDES_PATH) as f:
            return json.load(f)
    return {}


def get_anchor_override(overrides, item_id, direction, n=None):
    cfg = overrides.get(item_id, {})
    dx, dy = cfg.get("dx", 0), cfg.get("dy", 0)
    per_dir = cfg.get("dirs", {}).get(str(direction), {})
    dx += per_dir.get("dx", 0)
    dy_dir = per_dir.get("dy", 0)
    if n is not None:
        per_frame = per_dir.get("frames", {}).get(str(n), {})
        dx += per_frame.get("dx", 0)
        dy_dir += per_frame.get("dy", 0)
    dy += dy_dir
    return dx, dy

# CA (garment, 16 states) and CHAP/CHEV (accessory, 8 states) both resolve
# to compass directions via the same table -- CHAP/CHEV just skip the
# walk/stop split CA has. index: (direction, frame) for CA; index: direction
# for CHAP/CHEV (using only the STOP half of the CA table, i.e. n=0).
CA_TO_DIR_FRAME = {
    1: (1, 1), 2: (1, 0), 3: (5, 1), 4: (5, 0), 5: (9, 1), 6: (9, 0), 7: (2, 1), 8: (2, 0),
    9: (6, 1), 10: (6, 0), 11: (10, 1), 12: (10, 0), 13: (8, 1), 14: (8, 0), 15: (4, 1), 16: (4, 0),
}
CHAP_TO_DIR = {1: 1, 2: 2, 3: 10, 4: 6, 5: 9, 6: 5, 7: 8, 8: 4}

SLOT_INSTANCE_NAME = {"bas": "vetbas", "milieu": "vetmil", "hat": "chap", "hair": "coif"}

# Fixed placement offset for "bas", calibrated by center-matching a pilot
# item's frame-1 (CA1/dir1, untrimmed canvas) against the BODY's hip overlap
# zone directly -- proven across all 176 imported pant/jupe items (a single
# source-SWF family, consistent registration). In 3x-canvas px, applied as a
# paste offset for the FULL untrimmed retainBounds frame.
#
# "milieu" does NOT use a fixed offset -- a fixed constant that matched
# tshirt_rayebleu within ~1px landed tshirt_policier's shoulders ~9-10px off
# center (confirmed: its two sleeve caps sit symmetric to EACH OTHER but the
# whole garment is shifted right relative to the body). Different milieu
# source SWFs don't share a common registration the way the 176 bas items
# do, so milieu instead centers each frame's own trimmed content directly
# against the body's own torso (bd) sprite center for that direction -- see
# cmd_garment. Anchoring against another shipped item's json instead of the
# body was tried once for "bas" while building this script (pant1 needed
# several rounds of manual nudging historically, per its own git log, and
# sure enough the result landed ~9px off) -- second-hand references inherit
# whatever imprecision the first one had, so always anchor against the body.
SLOT_OFFSET = {"bas": (-97, 3)}
HAT_HEAD_K = 48  # px (3x canvas): vertical depth a cap sits into the head silhouette
HAIR_WIDEST_ROW_OFFSET = 34  # px (3x canvas): head.y + this = where a hairstyle's own
                             # widest row sits -- see cmd_accessory's hair branch


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


def export_all_frames(swf_path, char_id, work_dir, retain_bounds=True):
    """Export every frame of `char_id`'s own timeline as SVG. retain_bounds
    keeps one consistent canvas across frames (needed when frames must stay
    positioned relative to each other, e.g. a 16-frame garment) -- turn it
    off if ffdec reports a degenerate/negative bounding box for this
    symbol (seen once, on a hat); each accessory frame is independently
    positioned anyway so per-frame auto-crop is harmless there.
    """
    out_dir = os.path.join(work_dir, "frames")
    args = ["-zoom", str(ZOOM), "-format", "sprite:svg", "-selectid", char_id,
            "-export", "sprite", out_dir, swf_path]
    if retain_bounds:
        args = ["-config", "svgRetainBounds=true"] + args
    run_ffdec(*args)
    frame_dir = None
    for d in os.listdir(out_dir) if os.path.isdir(out_dir) else []:
        if d.startswith("DefineSprite_"):
            frame_dir = os.path.join(out_dir, d)
            break
    return frame_dir


def strip_root_use_by_href(svg_text, drop_if_sprite_href):
    """Root-level <use> elements are the frame's top-level shapes/sprites
    (garment fabric, an accessory badge, the arm, ...). Each is either a
    flat shape (href="#shapeN") or a nested sprite (href="#spriteN") --
    skin/arm content is always the latter (its own skin-fill + outline
    sub-shapes), never the former. drop_if_sprite_href=True strips arm-like
    (sprite-href) elements to isolate garment fabric; False strips
    shape-href elements to isolate just the arm.
    """
    lines = svg_text.split("\n")
    keep = []
    for l in lines:
        is_root_use = l.startswith("    <use ")
        is_sprite_href = 'xlink:href="#sprite' in l
        if is_root_use and (is_sprite_href == drop_if_sprite_href):
            continue
        keep.append(l)
    return "\n".join(keep)


def neutralize_white_point(im, mask=None):
    """Rescale luminance so the lightest tone in `mask` (or the whole
    image) hits pure white, proportionally darkening the rest -- turns a
    baked-in placeholder tint (skin f7ceaf, or a hair color) into a neutral
    base for PIXI's multiplicative tint, without assuming a single exact
    hex (shading overlays and stray secondary tones vary per symbol)."""
    arr = np.array(im).astype(float)
    rgb, alpha = arr[:, :, :3], arr[:, :, 3]
    lum = rgb.mean(axis=2)
    region = mask if mask is not None else (alpha > 250)
    white_point = np.percentile(lum[region], 99) if region.any() else 255
    scale = 255.0 / white_point if white_point > 0 else 1.0
    new_lum = np.clip(lum * scale, 0, 255)
    arr[:, :, 0] = new_lum; arr[:, :, 1] = new_lum; arr[:, :, 2] = new_lum
    return Image.fromarray(arr.astype("uint8"), "RGBA")


def has_named_subinstance(svg_text, name):
    return f'id="{name}"' in svg_text


def pack_atlas(entries, atlas_w=1024, pad=6):
    """entries: list of (filename, PIL image, spriteSourceSize_x, spriteSourceSize_y,
    sourceSize_w, sourceSize_h). Returns (atlas_image, frames_dict).

    atlas_w grows to fit whichever single entry is widest -- see the
    identical function's comment in swf_to_furniture.py for why this
    matters (a lone item wider than the default 1024 gets silently
    clipped by Image.paste() otherwise). Never triggered here so far
    (every avatar item comfortably under 240px) but cheap insurance.
    """
    entries = sorted(entries, key=lambda e: -e[1].height)
    atlas_w = max(atlas_w, max((im.width for _, im, *_ in entries), default=0) + 2 * pad)
    cx, cy, row_h = pad, pad, 0
    placements = []
    for fname, im, sx, sy, sw, sh in entries:
        if cx + im.width + pad > atlas_w:
            cx, cy, row_h = pad, cy + row_h + pad, 0
        placements.append((fname, im, sx, sy, sw, sh, cx, cy))
        cx += im.width + pad
        row_h = max(row_h, im.height)
    atlas_h = cy + row_h + pad
    atlas = Image.new("RGBA", (atlas_w, atlas_h), (0, 0, 0, 0))
    frames = {}
    for fname, im, sx, sy, sw, sh, px, py in placements:
        atlas.paste(im, (px, py))
        frames[fname] = {
            "frame": {"x": px, "y": py, "w": im.width, "h": im.height},
            "rotated": False, "trimmed": True,
            "spriteSourceSize": {"x": sx, "y": sy, "w": im.width, "h": im.height},
            "sourceSize": {"w": sw, "h": sh},
        }
    return atlas, frames


def write_item(out_dir, item_id, atlas, frames):
    os.makedirs(out_dir, exist_ok=True)
    atlas.save(os.path.join(out_dir, f"{item_id}.png"))
    meta = {"version": "1.0", "image": f"{item_id}.png", "format": "RGBA8888",
            "size": {"w": atlas.width, "h": atlas.height}, "scale": str(RESOLUTION)}
    json.dump({"frames": frames, "meta": meta}, open(os.path.join(out_dir, f"{item_id}.json"), "w"))


def export_milieu(args, frame_dir, toon):
    """"milieu" (tshirt/...) targets Tshirt.ts's contract: Clothe,
    OVERRIDDEN to `{id}_bd_{direction}.png` (one static frame per
    direction, no walk/stop split -- the fabric itself never animates,
    only what's under it does). Built from each direction's CA "stop"
    (n=0) pose with the arm sub-instance stripped, centered on the body's
    own torso (bd) sprite -- see SLOT_OFFSET comment for why a fixed
    offset doesn't work here.

    No ClotheSleeve (`{id}_al/ar_{direction}_{n}.png`) output: every
    milieu SWF inspected this session embeds an "arm" sub-instance
    (nested sprite, the strip_root_use_by_href arm-vs-fabric split
    targets it) purely as a skin-toned positioning aid for directions the
    body rig itself can't draw an arm at correctly -- the exact same
    technique this session already used to backfill the BODY's own
    toon.json arm frames -- NOT colored sleeve fabric. Exporting it as a
    ClotheSleeve would paste a raw un-neutralized skin-tone patch (own
    baked placeholder tone, never tinted, per ClotheSleeve.ts's class doc)
    over the body's own already-correct, tintable arm. The body's arm
    showing bare past the fabric's own short-sleeve cap is therefore the
    CORRECT look for a short-sleeve garment, not a gap. A future
    genuinely long-sleeved item should have its embedded arm content
    inspected for real fabric coloring before assuming this applies to it
    too.
    """
    canvas_size = (80 * RESOLUTION, 120 * RESOLUTION)
    entries = []

    for ca, (d, n) in CA_TO_DIR_FRAME.items():
        if n != 0:
            continue
        svg_path = os.path.join(frame_dir, f"{ca}.svg")
        if not os.path.exists(svg_path):
            continue
        with open(svg_path, errors="ignore") as f:
            svg = f.read()
        fabric_svg = strip_root_use_by_href(svg, drop_if_sprite_href=True)
        im = Image.open(io.BytesIO(cairosvg.svg2png(bytestring=fabric_svg.encode("utf-8")))).convert("RGBA")
        bbox = im.getbbox()
        if bbox is None:
            continue
        trimmed = im.crop(bbox)
        bd_key = f"human_bd_{d}_0.png"
        if bd_key not in toon:
            continue
        bdsss = toon[bd_key]["spriteSourceSize"]
        ox = round(bdsss["x"] + bdsss["w"] / 2 - trimmed.width / 2)
        oy = round(bdsss["y"] + bdsss["h"] / 2 - trimmed.height / 2)
        dx, dy = get_anchor_override(args.anchor_overrides, args.item_id, d)
        entries.append((f"{args.item_id}_bd_{d}.png", trimmed, ox + dx, oy + dy, canvas_size[0], canvas_size[1]))

    return entries


def cmd_garment(args):
    work_dir = args.work_dir or tempfile.mkdtemp(prefix="swf_to_spritesheet_")
    os.makedirs(work_dir, exist_ok=True)
    instance_name = SLOT_INSTANCE_NAME[args.slot]
    char_id = find_named_instance_id(args.swf, instance_name, work_dir)
    if not char_id:
        print(f"ERROR: no '{instance_name}' instance found in {args.swf}", file=sys.stderr)
        sys.exit(1)
    frame_dir = export_all_frames(args.swf, char_id, work_dir, retain_bounds=True)
    if not frame_dir:
        print("ERROR: ffdec export produced no frames", file=sys.stderr)
        sys.exit(1)

    if args.slot == "milieu":
        toon = json.load(open(TOON_JSON))["frames"]
        entries = export_milieu(args, frame_dir, toon)
    else:
        canvas_size = (80 * RESOLUTION, 120 * RESOLUTION)
        OX, OY = SLOT_OFFSET[args.slot]
        entries = []
        for ca, (d, n) in CA_TO_DIR_FRAME.items():
            svg_path = os.path.join(frame_dir, f"{ca}.svg")
            if not os.path.exists(svg_path):
                print(f"WARNING: missing frame {ca}, skipping", file=sys.stderr)
                continue
            with open(svg_path, errors="ignore") as f:
                svg = f.read()
            png = cairosvg.svg2png(bytestring=svg.encode("utf-8"))
            im = Image.open(io.BytesIO(png)).convert("RGBA")
            canvas = Image.new("RGBA", canvas_size, (0, 0, 0, 0))
            canvas.paste(im, (OX, OY), im)
            bbox = canvas.getbbox()
            if bbox is None:
                continue
            trimmed = canvas.crop(bbox)
            dx, dy = get_anchor_override(args.anchor_overrides, args.item_id, d, n)
            fname = f"{args.item_id}_{d}_{n}.png"
            entries.append((fname, trimmed, bbox[0] + dx, bbox[1] + dy, canvas_size[0], canvas_size[1]))

    if not entries:
        print("ERROR: no frames produced", file=sys.stderr)
        sys.exit(1)
    atlas, frames = pack_atlas(entries)
    write_item(args.out_dir, args.item_id, atlas, frames)
    print(f"wrote {args.item_id}.png/.json ({len(frames)} frames) to {args.out_dir}")


def heuristic_ox_oy(slot, trimmed, hsss):
    """Fallback per-direction placement when there's no usable shared origin
    for this item (see cmd_accessory) -- the same formulas used before the
    self-anchor technique existed. Also used to calibrate dir1 even on the
    self-anchor path: it's the one direction we still independently place,
    everything else is derived from it geometrically (see cmd_accessory).
    """
    head_center_x = hsss["x"] + hsss["w"] / 2
    OX = round(head_center_x - trimmed.width / 2)
    if slot == "hair":
        # A cap's own height barely varies by design, so anchoring its TOP
        # at a fixed depth above the head (HAT_HEAD_K) holds across
        # different caps. Hair styles vary far more (a bun/spike/bow
        # extends way up, a ponytail/sidelock extends way down) -- BOTH
        # top-anchor and bottom-anchor were tried and both failed: top-
        # anchor floats/clips tall styles, and bottom-anchor (matching
        # hair7's position) shoves a style with little downward extension
        # down over the face, and pulls a style with a lot of downward
        # reach up so far its top floats above the head (confirmed on
        # coiffure5/6 vs. coiffure23). The widest row of the silhouette is
        # nearly always around ear/temple level regardless of how far the
        # style reaches up or down from there -- anchoring THAT row is
        # what's actually invariant. Offset calibrated against the cluster
        # of items that were never flagged as misplaced, mean ~34px.
        arr = np.array(trimmed)
        row_widths = (arr[:, :, 3] > 10).sum(axis=1)
        widest_row_local = int(np.argmax(row_widths)) if row_widths.any() else 0
        OY = round((hsss["y"] + HAIR_WIDEST_ROW_OFFSET) - widest_row_local)
    else:
        OY = round(hsss["y"] - HAT_HEAD_K)
    return OX, OY


def render_padded(svg_text, pad):
    """Rasterize a retainBounds SVG frame after overriding its declared
    canvas to `2*pad` square and shifting the root transform by (pad, pad)
    -- see cmd_accessory's self-anchor comment for why: retainBounds'
    DECLARED width/height can be smaller than the frame's true content
    (confirmed on coiffure16 -- its declared canvas silently clipped off
    one whole pigtail), but its transform staying at (0,0) translate is
    reliable, so re-declaring a generous canvas around that same (0,0)
    keeps the one thing worth keeping (a shared origin across this
    symbol's own frames) while fixing the clipping. Returns (image, bbox)
    or (image, None) if the frame is empty.
    """
    padded = re.sub(r'height="[\d.]+px" width="[\d.]+px"', f'height="{pad*2}px" width="{pad*2}px"', svg_text, count=1)
    padded = re.sub(r'matrix\(([\d.]+), 0\.0, 0\.0, ([\d.]+), 0\.0, 0\.0\)',
                     rf'matrix(\1, 0.0, 0.0, \2, {pad}, {pad})', padded, count=1)
    im = Image.open(io.BytesIO(cairosvg.svg2png(bytestring=padded.encode("utf-8")))).convert("RGBA")
    return im, im.getbbox()


def has_degenerate_bounds(frame_dir):
    f1 = os.path.join(frame_dir or "", "1.svg")
    if not os.path.exists(f1):
        return True
    with open(f1, errors="ignore") as f:
        header = f.read(300)
    m = re.search(r'height="(-?[\d.]+)px" width="(-?[\d.]+)px"', header)
    return bool(m) and (float(m.group(1)) <= 0 or float(m.group(2)) <= 0)


def cmd_accessory(args):
    work_dir = args.work_dir or tempfile.mkdtemp(prefix="swf_to_spritesheet_")
    os.makedirs(work_dir, exist_ok=True)
    instance_name = SLOT_INSTANCE_NAME[args.slot]
    char_id = find_named_instance_id(args.swf, instance_name, work_dir)
    if not char_id:
        print(f"ERROR: no '{instance_name}' instance found in {args.swf}", file=sys.stderr)
        sys.exit(1)

    toon = json.load(open(TOON_JSON))["frames"]
    tint_target = "c1" if args.slot == "hair" else None  # hat fabric is never tinted
    PAD = 500

    # Self-anchor: the ONE (translateX, translateY) matrix the source SWF
    # places this symbol's whole timeline at, per its OWN root, is fixed --
    # never changes across the 8 CHAP/CHEV frames (confirmed: casquette and
    # cheveux each get exactly one PlaceObject in the body rig's own
    # clipType timeline, never moved again; same pattern held on every item
    # SWF checked). That means each frame's local (0,0) origin -- where
    # retainBounds' own transform stays fixed at (see render_padded) -- is
    # the item's real, single, consistent registration point, IF retainBounds
    # produces valid (non-degenerate) geometry for this file. Calibrate dir1
    # with the heuristic (still the best guess for the very first placement
    # -- it has nothing to anchor against yet), then place every OTHER
    # direction by carrying that SAME origin through via each frame's own
    # bbox -- no independent heuristic guess per direction, no cross-file
    # assumption either (this works even for a lone item, no matching
    # sibling needed). Verified on a 9-item family sharing one source
    # template: one calibrated point placed all 8 directions of all 9 items
    # correctly with zero per-direction adjustment.
    #
    # Falls back to the OLD per-direction heuristic (independently, for
    # every direction) when retainBounds gives degenerate geometry for this
    # file (seen on a hat item -- negative height) -- no shared origin to
    # carry over then, so there's nothing to propagate.
    rb_frame_dir = export_all_frames(args.swf, char_id, work_dir, retain_bounds=True)
    self_anchor = rb_frame_dir and not has_degenerate_bounds(rb_frame_dir)
    frame_dir = rb_frame_dir if self_anchor else export_all_frames(args.swf, char_id, work_dir, retain_bounds=False)
    if not frame_dir:
        print("ERROR: ffdec export produced no frames", file=sys.stderr)
        sys.exit(1)

    entries = []
    T = None  # canvas-space position of this item's own (0,0), set from dir1

    def load_frame(chap):
        svg_path = os.path.join(frame_dir, f"{chap}.svg")
        if not os.path.exists(svg_path):
            return None
        with open(svg_path, errors="ignore") as f:
            return f.read()

    # dir1 first, however CHAP_TO_DIR happens to order it, so T is ready
    # before any other direction needs it.
    ordered = sorted(CHAP_TO_DIR.items(), key=lambda kv: kv[1] != 1)
    for chap, d in ordered:
        svg = load_frame(chap)
        if svg is None:
            print(f"WARNING: missing frame {chap}, skipping", file=sys.stderr)
            continue

        if self_anchor:
            im, bbox = render_padded(svg, PAD)
        else:
            im = Image.open(io.BytesIO(cairosvg.svg2png(bytestring=svg.encode("utf-8")))).convert("RGBA")
            bbox = im.getbbox()
        if bbox is None:
            continue

        if tint_target and args.tint_detect and has_named_subinstance(svg, tint_target):
            im = neutralize_white_point(im)  # whole-image: color is only ever this one tone in practice
        trimmed = im.crop(bbox)

        head_key = f"human_hd_{d}_0.png"
        if head_key not in toon:
            continue
        hsss = toon[head_key]["spriteSourceSize"]

        if not self_anchor:
            OX, OY = heuristic_ox_oy(args.slot, trimmed, hsss)
        elif d == 1:
            OX, OY = heuristic_ox_oy(args.slot, trimmed, hsss)
            T = (OX + (PAD - bbox[0]), OY + (PAD - bbox[1]))
        else:
            OX = round(T[0] - (PAD - bbox[0]))
            OY = round(T[1] - (PAD - bbox[1]))

        dx, dy = get_anchor_override(args.anchor_overrides, args.item_id, d)
        fname = f"{args.item_id}_{d}.png"
        entries.append((fname, trimmed, OX + dx, OY + dy, 80 * RESOLUTION, 120 * RESOLUTION))

    if not entries:
        print("ERROR: no frames produced", file=sys.stderr)
        sys.exit(1)
    atlas, frames = pack_atlas(entries)
    write_item(args.out_dir, args.item_id, atlas, frames)
    mode = "self-anchor" if self_anchor else "heuristic fallback (degenerate retainBounds)"
    print(f"wrote {args.item_id}.png/.json ({len(frames)} frames) to {args.out_dir}  [{mode}]")


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)

    g = sub.add_parser("garment", help="16-frame CA-based item (pant/tshirt/...)")
    g.add_argument("swf")
    g.add_argument("item_id")
    g.add_argument("--slot", choices=["bas", "milieu"], required=True)
    g.add_argument("--out-dir", required=True)
    g.add_argument("--work-dir")
    g.set_defaults(func=cmd_garment)

    a = sub.add_parser("accessory", help="8-frame CHAP/CHEV-based item (hat/hair)")
    a.add_argument("swf")
    a.add_argument("item_id")
    a.add_argument("--slot", choices=["hat", "hair"], required=True)
    a.add_argument("--out-dir", required=True)
    a.add_argument("--no-tint-detect", dest="tint_detect", action="store_false",
                    help="hair only: skip checking for a 'c1' sub-instance, never whiten "
                         "(use for a style you already know is fixed-color)")
    a.add_argument("--work-dir")
    a.set_defaults(tint_detect=True, func=cmd_accessory)

    args = p.parse_args()
    args.anchor_overrides = load_anchor_overrides()
    args.func(args)


if __name__ == "__main__":
    main()
