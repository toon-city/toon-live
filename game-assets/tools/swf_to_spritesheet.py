#!/usr/bin/env python3
"""Convert a Gabbos-era Flash (.swf) clothing/accessory item into a
game-ready spritesheet (PNG atlas + TexturePacker-style JSON), matching the
conventions Clothe.ts / AnimatedClothe.ts / ClotheSleeve.ts already expect.

Two source conventions exist in the original game and are both supported:

  "garment" (category: pant, tshirt, ...): the item's own SWF has a
  top-level MovieClip instance named 'vetbas' (bottom wear) or 'vetmil'
  (top wear / makeup / ghost skin) with a 16-frame timeline: frame N is
  CA state N, i.e. 8 directions x 2 poses (walk, stop). Output uses
  AnimatedClothe's frame contract: {id}_{direction}_{n}.png, n=0 (stop) or
  1 (walk).

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

Positioning is NOT re-derived from the SWF's own placement matrices --
that was tried and abandoned this session (svgRetainBounds only guarantees
a consistent canvas across ONE symbol's own frames, not a shared origin
between different symbols, so cross-symbol matrix math produced garbage).
Instead each item slot uses a fixed pixel offset, independently calibrated
by center-matching a pilot item directly against the BODY's own real
anatomical anchor (hip overlap zone for "bas", torso bbox for "milieu",
head bbox for accessories) -- see SLOT_OFFSET / HAT_HEAD_K. Anchoring
against another shipped item instead of the body was tried once and
inherited that item's own imprecision (pant1 needed several rounds of
manual nudging historically; matching against its json landed ~9px off).
Verify visually before trusting a new slot's calibration on more than one
item; the offset that works for one item in a slot should hold for all
others sharing the same placeholder, but confirm on all 8 directions the
first time (this session found real per-direction exceptions on the body
itself -- shared-symbol mirror ambiguities, a front/back content mismatch
-- so don't assume a single global offset is automatically safe).

Usage:
  python3 swf_to_spritesheet.py garment INPUT.swf ITEM_ID --slot bas
  python3 swf_to_spritesheet.py garment INPUT.swf ITEM_ID --slot milieu [--no-arm-strip]
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

# Fixed placement offsets, each independently calibrated and verified this
# session by center-matching a pilot item's frame-1 (CA1/dir1, untrimmed
# canvas) against the BODY's own real anatomical anchor directly -- NOT
# against another shipped item (tried anchoring "bas" against pant1's own
# json instead of the body once while building this script: pant1 needed
# several rounds of manual nudging historically, per its own git log, and
# sure enough the result landed ~9px too low -- second-hand references
# inherit whatever imprecision the first one had). "bas" was anchored
# against the hip overlap zone in the body's own torso/leg art (proven
# across all 176 imported pant/jupe items). "milieu" was anchored against
# the torso bbox directly (proven across tshirt_rayebleu + tshirt_policier).
# Both are in 3x-canvas px, applied as a paste offset for the FULL
# untrimmed retainBounds frame (see cmd_garment).
SLOT_OFFSET = {"bas": (-97, 3), "milieu": (-102, 34)}
HAT_HEAD_K = 48  # px (3x canvas): vertical depth a cap sits into the head silhouette
HAIR_BOTTOM_OFFSET = 124  # px (3x canvas): head.y + this = where hair's bottom edge sits,
                          # derived from the already-shipped hair7's own position


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
    sourceSize_w, sourceSize_h). Returns (atlas_image, frames_dict)."""
    entries = sorted(entries, key=lambda e: -e[1].height)
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

    OX, OY = SLOT_OFFSET[args.slot]
    do_strip = args.strip_arm and args.slot == "milieu"  # bas items never embed an arm
    canvas_size = (80 * RESOLUTION, 120 * RESOLUTION)

    entries = []
    for ca, (d, n) in CA_TO_DIR_FRAME.items():
        svg_path = os.path.join(frame_dir, f"{ca}.svg")
        if not os.path.exists(svg_path):
            print(f"WARNING: missing frame {ca}, skipping", file=sys.stderr)
            continue
        with open(svg_path, errors="ignore") as f:
            svg = f.read()
        if do_strip:
            svg = strip_root_use_by_href(svg, drop_if_sprite_href=True)
        png = cairosvg.svg2png(bytestring=svg.encode("utf-8"))
        im = Image.open(io.BytesIO(png)).convert("RGBA")
        canvas = Image.new("RGBA", canvas_size, (0, 0, 0, 0))
        canvas.paste(im, (OX, OY), im)
        bbox = canvas.getbbox()
        if bbox is None:
            continue
        trimmed = canvas.crop(bbox)
        fname = f"{args.item_id}_{d}_{n}.png"
        entries.append((fname, trimmed, bbox[0], bbox[1], canvas_size[0], canvas_size[1]))

    if not entries:
        print("ERROR: no frames produced", file=sys.stderr)
        sys.exit(1)
    atlas, frames = pack_atlas(entries)
    write_item(args.out_dir, args.item_id, atlas, frames)
    print(f"wrote {args.item_id}.png/.json ({len(frames)} frames) to {args.out_dir}  [OX={OX} OY={OY}]")


def cmd_accessory(args):
    work_dir = args.work_dir or tempfile.mkdtemp(prefix="swf_to_spritesheet_")
    os.makedirs(work_dir, exist_ok=True)
    instance_name = SLOT_INSTANCE_NAME[args.slot]
    char_id = find_named_instance_id(args.swf, instance_name, work_dir)
    if not char_id:
        print(f"ERROR: no '{instance_name}' instance found in {args.swf}", file=sys.stderr)
        sys.exit(1)

    def has_degenerate_bounds(frame_dir):
        f1 = os.path.join(frame_dir or "", "1.svg")
        if not os.path.exists(f1):
            return True
        with open(f1, errors="ignore") as f:
            header = f.read(300)
        m = re.search(r'height="(-?[\d.]+)px" width="(-?[\d.]+)px"', header)
        return bool(m) and (float(m.group(1)) <= 0 or float(m.group(2)) <= 0)

    frame_dir = export_all_frames(args.swf, char_id, work_dir, retain_bounds=True)
    if has_degenerate_bounds(frame_dir):
        # Some symbols report a degenerate bounding box under retainBounds
        # (seen once, negative height) -- fall back to per-frame auto-crop.
        # Harmless here: each direction is independently positioned anyway.
        frame_dir = export_all_frames(args.swf, char_id, work_dir, retain_bounds=False)
    if not frame_dir:
        print("ERROR: ffdec export produced no frames", file=sys.stderr)
        sys.exit(1)

    toon = json.load(open(TOON_JSON))["frames"]
    tint_target = "c1" if args.slot == "hair" else None  # hat fabric is never tinted

    entries = []
    for chap, d in CHAP_TO_DIR.items():
        svg_path = os.path.join(frame_dir, f"{chap}.svg")
        if not os.path.exists(svg_path):
            print(f"WARNING: missing frame {chap}, skipping", file=sys.stderr)
            continue
        with open(svg_path, errors="ignore") as f:
            svg = f.read()
        png = cairosvg.svg2png(bytestring=svg.encode("utf-8"))
        im = Image.open(io.BytesIO(png)).convert("RGBA")

        if tint_target and args.tint_detect and has_named_subinstance(svg, tint_target):
            im = neutralize_white_point(im)  # whole-image: color is only ever this one tone in practice

        bbox = im.getbbox()
        if bbox is None:
            continue
        trimmed = im.crop(bbox)

        head_key = f"human_hd_{d}_0.png"
        if head_key not in toon:
            continue
        hsss = toon[head_key]["spriteSourceSize"]
        head_center_x = hsss["x"] + hsss["w"] / 2
        OX = round(head_center_x - trimmed.width / 2)
        if args.slot == "hair":
            # A cap's own height barely varies by design, so anchoring its
            # TOP at a fixed depth above the head (HAT_HEAD_K) holds across
            # different caps. Hair styles vary wildly in height (short bob
            # vs. tall spikes) -- a fixed top-offset either floats a tall
            # style above the scalp or clips it, confirmed visually on a
            # spot check across several styles. Anchor the BOTTOM instead
            # (where hair actually meets the head, roughly constant
            # regardless of how far up a style extends) using the already-
            # shipped hair7's own proven position as the reference depth.
            OY = round((hsss["y"] + HAIR_BOTTOM_OFFSET) - trimmed.height)
        else:
            OY = round(hsss["y"] - HAT_HEAD_K)

        fname = f"{args.item_id}_{d}.png"
        entries.append((fname, trimmed, OX, OY, 80 * RESOLUTION, 120 * RESOLUTION))

    if not entries:
        print("ERROR: no frames produced", file=sys.stderr)
        sys.exit(1)
    atlas, frames = pack_atlas(entries)
    write_item(args.out_dir, args.item_id, atlas, frames)
    print(f"wrote {args.item_id}.png/.json ({len(frames)} frames) to {args.out_dir}")


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)

    g = sub.add_parser("garment", help="16-frame CA-based item (pant/tshirt/...)")
    g.add_argument("swf")
    g.add_argument("item_id")
    g.add_argument("--slot", choices=["bas", "milieu"], required=True)
    g.add_argument("--out-dir", required=True)
    g.add_argument("--no-arm-strip", dest="strip_arm", action="store_false",
                    help="milieu items only: keep the embedded arm instead of dropping it "
                         "(the arm is never tinted by skin color in the original game, "
                         "so this is almost never what you want -- see conversation notes)")
    g.add_argument("--work-dir")
    g.set_defaults(strip_arm=True, func=cmd_garment)

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
    args.func(args)


if __name__ == "__main__":
    main()
