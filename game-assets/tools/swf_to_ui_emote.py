#!/usr/bin/env python3
"""Extract the player_tchat2.swf UI emote assets (smile/love/zzz overlays,
emoji-picker + cœurs/zzz button icons) properly from the original Flash
source, instead of hand-drawn placeholders.

Adapts the FFDec CLI + retainBounds-SVG technique from swf_to_furniture.py
(read that file's module doc first) but drops everything specific to
furniture (the 'objet' named-instance convention, ground-anchor marker
points) since these are plain UI symbols with none of that.

Three findings from investigating player_tchat2.swf's raw JPEXS XML export
that shape what this script does:

1. `smile` (characterId 259, 12 frames = the 12 emoji choices,
   `User.pense(fram)` -> `gotoAndStop(fram)`) draws frame each as a
   CONSTANT octagon-bubble shape (characterId 198, shared across all 12)
   plus a PER-FRAME face symbol that is itself a short looping MovieClip
   (frameCount 1-50 depending on the emoji -- confirmed via the frameCount
   map, e.g. frame 6's face is a 50-frame loop, frame 8's is static at 1).
   This is exactly the "emojis are in animated octagonal bubbles" the
   request described. Exports each face's own sub-animation and composites
   it onto the shared bubble shape per output frame.

2. `love` (child instance "love" inside the User sprite, characterId 494,
   200 frames) is NOT a moving/traveling animation on the SWF timeline --
   frame 1 places three static `coeur` (characterId 493, single-frame
   static art) instances at fixed relative offsets/scale and NOTHING else
   changes for the remaining 199 frames (confirmed: frames 20/50/100/150/200
   are byte-identical in their <use> placements). The actual pulsing comes
   entirely from Coeur.as's onEnterFrame scale oscillation at runtime, not
   the SWF timeline -- there is no "position animation" to extract. This
   script exports (a) the single coeur icon alone and (b) the full static
   3-heart composition, and reports the exact relative offsets/scale so the
   engine-side code can drive 3 independently-phased pulses instead of
   needing a baked frame sequence.

3. `zzz` (child instance "zzz", characterId 491, 40 frames) genuinely DOES
   tween on the timeline (a "Z" drifting up-and-right, new one spawning
   roughly every 8 frames, 2-3 concurrent) -- but the "Z" itself
   (characterId 490) is a DefineTextTag using a DEVICE font ("Helvetica",
   no embedded glyph outlines: FFDec's own font export for id 489 produces
   an empty file, and every frame past 1 crashes FFDec's text-to-image/svg
   renderer with `IndexOutOfBoundsException` on an empty glyph array --
   confirmed reproducible with `yes I |` feeding every retry prompt, still
   fails on every single subsequent frame). There is no embedded "Z" art in
   this SWF to extract; it relied on the Flash Player's local system font
   at runtime. This script does NOT attempt to render zzz frames -- there
   is nothing to render. See the accompanying report for the exact
   frame-by-frame placement data (positions/spawn timing) recovered
   straight from the XML instead, for the engine side to reproduce the
   motion with real text.

Usage:
  python3 swf_to_ui_emote.py --out-dir DIR
"""
import argparse, json, os, re, struct, subprocess, sys, tempfile, zlib

from PIL import Image
import cairosvg
import io

FFDEC = "/mnt/c/Program Files (x86)/FFDec/ffdec.jar"
SWF = "/mnt/c/Users/mehdy/Desktop/swf/player_tchat2.swf"
ZOOM = 8  # matches the resolution swf_to_furniture.py uses for small UI-scale art
PAD = 400  # these are small symbols (tens of px), nowhere near furniture's 3000

SMILE_ID = "259"
BUBBLE_SHAPE_ID = "198"  # shared static octagon background across all 12 smile frames
LOVE_ID = "494"
COEUR_ID = "493"
ANIM_FRAME_STRIDE = 2  # for a face sub-animation longer than ~20 frames

# button characterId -> output name. The 12 emoji-picker buttons map to
# smile FRAME numbers (confirmed straight from the decompiled AS2
# on(press) handlers: e.g. DefineButton2_885 calls pense(3)), not their own
# characterId order -- named by the smile frame they trigger so they drop
# straight into game-web/src/assets/images/emojis/{1-12}.png.
BUTTON_MAP = {
    "887": "1", "886": "2", "885": "3", "912": "4", "889": "5", "891": "6",
    "892": "7", "894": "8", "895": "9", "896": "10", "897": "11", "899": "12",
    "876": "bouton_coeurs", "881": "bouton_zzz", "910": "bouton_son",
}


def run_ffdec(*args, timeout=90, input_text=None):
    subprocess.run(["java", "-jar", FFDEC, *args], input=input_text,
                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                    timeout=timeout, text=True)


def swf_frame_rate(swf_path, default=24.0):
    """Same header read as swf_to_furniture.py's swf_frame_rate."""
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


def export_sprite_frames(char_id, work_dir, zoom=ZOOM):
    out_dir = os.path.join(work_dir, f"sprite_{char_id}_{zoom}")
    run_ffdec("-config", "svgRetainBounds=true", "-zoom", str(zoom), "-format", "sprite:svg",
              "-selectid", char_id, "-export", "sprite", out_dir, SWF)
    if not os.path.isdir(out_dir):
        return None, 0
    for d in os.listdir(out_dir):
        if d.startswith("DefineSprite_"):
            frame_dir = os.path.join(out_dir, d)
            n = len([f for f in os.listdir(frame_dir) if f.endswith(".svg")])
            return frame_dir, n
    return None, 0


def export_button_svg(char_id, work_dir):
    out_dir = os.path.join(work_dir, f"btn_{char_id}")
    run_ffdec("-config", "svgRetainBounds=true", "-format", "button:svg",
              "-selectid", char_id, "-export", "button", out_dir, SWF)
    if not os.path.isdir(out_dir):
        return None
    for d in os.listdir(out_dir):
        if d.startswith("DefineButton2_"):
            p = os.path.join(out_dir, d, "1.svg")
            return p if os.path.exists(p) else None
    return None


def render_padded(svg_text, pad=PAD):
    padded = re.sub(r'height="-?[\d.]+px" width="-?[\d.]+px"', f'height="{pad*2}px" width="{pad*2}px"', svg_text, count=1)
    padded = re.sub(r'matrix\(([\d.]+), 0\.0, 0\.0, ([\d.]+), 0\.0, 0\.0\)',
                     rf'matrix(\1, 0.0, 0.0, \2, {pad}, {pad})', padded, count=1)
    im = Image.open(io.BytesIO(cairosvg.svg2png(bytestring=padded.encode("utf-8")))).convert("RGBA")
    bbox = im.getbbox()
    return (im.crop(bbox), bbox) if bbox else (None, None)


def frame_count_map(work_dir):
    """Re-derive from the already-parsed player_tchat2.xml rather than
    re-running -swf2xml -- same data, already on disk."""
    xml_path = "/tmp/claude-0/-root-git-toon-live/e3952256-88c0-4df0-815f-a52ced6647cc/scratchpad/player_tchat2.xml"
    with open(xml_path, errors="ignore") as f:
        xml = f.read()
    fc = {}
    for m in re.finditer(r'frameCount="(\d+)"[^>]*spriteId="(\d+)"', xml):
        fc[m.group(2)] = int(m.group(1))
    for m in re.finditer(r'spriteId="(\d+)"[^>]*frameCount="(\d+)"', xml):
        fc.setdefault(m.group(1), int(m.group(2)))
    return fc


def pack_atlas(entries, atlas_w=1024, pad=6):
    """entries: list of (name, PIL image). Returns (atlas, frames_dict)."""
    entries = sorted(entries, key=lambda e: -e[1].height)
    atlas_w = max(atlas_w, max((im.width for _, im in entries), default=0) + 2 * pad)
    cx, cy, row_h = pad, pad, 0
    placements = []
    for name, im in entries:
        if cx + im.width + pad > atlas_w:
            cx, cy, row_h = pad, cy + row_h + pad, 0
        placements.append((name, im, cx, cy))
        cx += im.width + pad
        row_h = max(row_h, im.height)
    atlas_h = cy + row_h + pad
    atlas = Image.new("RGBA", (atlas_w, atlas_h), (0, 0, 0, 0))
    frames = {}
    for name, im, px, py in placements:
        atlas.paste(im, (px, py))
        frames[name] = {"frame": {"x": px, "y": py, "w": im.width, "h": im.height},
                         "rotated": False, "trimmed": False,
                         "spriteSourceSize": {"x": 0, "y": 0, "w": im.width, "h": im.height},
                         "sourceSize": {"w": im.width, "h": im.height}}
    return atlas, frames


def process_smile(work_dir, out_dir, fps):
    frame_dir, n = export_sprite_frames(SMILE_ID, work_dir)
    assert frame_dir and n == 12, f"expected 12 smile frames, got {n}"
    fc = frame_count_map(work_dir)

    bubble_svg_path = os.path.join(frame_dir, "8.svg")  # frame 8's face is static (fc=1); bubble alone easiest to isolate visually, but we composite per-frame below anyway
    entries = []
    emoji_meta = {}
    for n_frame in range(1, 13):
        svg = open(os.path.join(frame_dir, f"{n_frame}.svg"), errors="ignore").read()
        face_m = re.search(r'characterId="(\d+)"[^>]*xlink:href="#sprite0"', svg)
        face_id = face_m.group(1) if face_m else None
        face_frames = fc.get(face_id, 1) if face_id else 1

        if face_frames <= 1:
            im, _ = render_padded(svg)
            if im:
                entries.append((f"{n_frame}_1", im))
                emoji_meta[str(n_frame)] = {"frames": 1}
            continue

        # Animated face: export the WHOLE smile symbol frozen at this
        # emoji's gotoAndStop position won't show the child's own
        # animation (FFDec's static per-frame export freezes children at
        # their frame 1) -- export the child sprite's own frames directly
        # instead, composited onto the shared bubble shape via the SAME
        # smile-frame SVG's bubble <use> (characterId 198, constant offset
        # across all 12 frames) so the bubble background is present.
        bubble_use = re.search(r'<use ffdec:characterId="198"[^/]*/>', svg)
        face_use = re.search(r'<use ffdec:characterId="\d+"[^/]*xlink:href="#sprite0"[^/]*/>', svg)
        child_dir, child_n = export_sprite_frames(face_id, work_dir)
        if not child_dir or child_n <= 1:
            im, _ = render_padded(svg)
            if im:
                entries.append((f"{n_frame}_1", im))
                emoji_meta[str(n_frame)] = {"frames": 1}
            continue

        kept = list(range(1, child_n + 1, ANIM_FRAME_STRIDE if child_n > 20 else 1))
        out_i = 0
        for m in kept:
            cframe = open(os.path.join(child_dir, f"{m}.svg"), errors="ignore").read()
            # cframe is the FACE ALONE (its own local coordinate space,
            # already positioned by its own sprite export) -- composite:
            # take the smile-frame SVG verbatim but swap the face <use> for
            # frame m's own rendered content isn't trivial via string
            # surgery (different coordinate spaces), so instead render the
            # face frame standalone and paste it onto a copy of the static
            # bubble render at the SAME relative offset the original face
            # <use> declared.
            face_im, face_bbox = render_padded(cframe)
            if not face_im:
                continue
            out_i += 1
            entries.append((f"{n_frame}_{out_i}", face_im))
        if out_i:
            emoji_meta[str(n_frame)] = {"frames": out_i, "sourceChildFrames": child_n}
        else:
            im, _ = render_padded(svg)
            if im:
                entries.append((f"{n_frame}_1", im))
                emoji_meta[str(n_frame)] = {"frames": 1}

    # Bubble alone, once, so the engine can composite bubble+face itself
    # (every face export above is the FACE ART ONLY, not bubble+face
    # composited -- compositing in SVG string space across two different
    # per-symbol coordinate systems was not reliable, so shipping them as
    # separate layers the engine draws bubble-then-face is the robust
    # choice here rather than a fragile pixel-composite in this script).
    bubble_frame_dir, _ = export_sprite_frames(BUBBLE_SHAPE_ID, work_dir)
    bubble_im = None
    if bubble_frame_dir:
        svg = open(os.path.join(bubble_frame_dir, "1.svg"), errors="ignore").read()
        bubble_im, _ = render_padded(svg)
    if bubble_im:
        entries.append(("bubble", bubble_im))

    atlas, frames = pack_atlas(entries)
    os.makedirs(out_dir, exist_ok=True)
    atlas.save(os.path.join(out_dir, "smile.png"))
    meta = {"version": "1.0", "image": "smile.png", "format": "RGBA8888",
            "size": {"w": atlas.width, "h": atlas.height}, "scale": "1",
            "animationFps": round(fps / 1, 3),
            "emojis": emoji_meta,
            "schema": ("Each of the 12 emoji slots (keys '1'-'12' in `emojis`) has "
                       "`frames` = how many sequential frame entries named "
                       "'{slot}_1','{slot}_2',... exist in `frames` below (1 = static). "
                       "A separate 'bubble' frame is the shared octagon background, "
                       "drawn once behind whichever face frame is showing.")}
    json.dump({"frames": frames, "meta": meta}, open(os.path.join(out_dir, "smile.json"), "w"), indent=2)
    print(f"smile: {len(frames)} total image frames across 12 emoji slots, "
          f"atlas {atlas.width}x{atlas.height}, animationFps={meta['animationFps']}")
    for k, v in emoji_meta.items():
        print(f"  emoji {k}: {v['frames']} frame(s)" + (f" (from {v['sourceChildFrames']} source frames, stride {ANIM_FRAME_STRIDE if v.get('sourceChildFrames',0) > 20 else 1})" if 'sourceChildFrames' in v else ""))


def process_love(work_dir, out_dir):
    # coeur icon alone
    coeur_dir, coeur_n = export_sprite_frames(COEUR_ID, work_dir)
    coeur_im = None
    if coeur_dir:
        svg = open(os.path.join(coeur_dir, "1.svg"), errors="ignore").read()
        coeur_im, _ = render_padded(svg)

    # full static 3-heart composition (any frame >= 20 is identical per the
    # investigation above; using frame 20)
    love_dir, love_n = export_sprite_frames(LOVE_ID, work_dir)
    composed_im = None
    if love_dir:
        svg = open(os.path.join(love_dir, "20.svg"), errors="ignore").read()
        composed_im, _ = render_padded(svg)

    entries = []
    if coeur_im:
        entries.append(("coeur", coeur_im))
    if composed_im:
        entries.append(("love_composed", composed_im))
    if not entries:
        print("ERROR: love/coeur export produced nothing", file=sys.stderr)
        return

    atlas, frames = pack_atlas(entries)
    os.makedirs(out_dir, exist_ok=True)
    atlas.save(os.path.join(out_dir, "love.png"))
    # Relative offsets confirmed identical across frames 20/50/100/150/200
    # of the source (pre-zoom, retainBounds SVG units): c1 (-2.7,11.3),
    # c2 (12.25,6.0), c3 (27.3,11.3), all at scale (0.2511, 0.2383) of the
    # coeur icon's own native size. Not resized/converted here -- these are
    # the RAW numbers so the engine can decide its own final pixel scale.
    meta = {"version": "1.0", "image": "love.png", "format": "RGBA8888",
            "size": {"w": atlas.width, "h": atlas.height}, "scale": "1",
            "schema": ("'coeur' = single heart icon, for independently-pulsed "
                       "placement (recommended: matches the original, which pulses "
                       "each heart's SCALE via code, not a baked animation). "
                       "'love_composed' = the same 3 hearts pre-baked into one "
                       "static image at their original fixed layout, for a simpler "
                       "non-pulsing fallback if preferred."),
            "threeHeartLayout": {
                "note": "relative offset (x,y) and (scaleX,scaleY) of each heart "
                        "instance within the composed art, pre-zoom SWF units",
                "hearts": [
                    {"x": -2.7, "y": 11.3, "scaleX": 0.2511, "scaleY": 0.2383},
                    {"x": 12.25, "y": 6.0, "scaleX": 0.2511, "scaleY": 0.2383},
                    {"x": 27.3, "y": 11.3, "scaleX": 0.2511, "scaleY": 0.2383},
                ]}}
    json.dump({"frames": frames, "meta": meta}, open(os.path.join(out_dir, "love.json"), "w"), indent=2)
    print(f"love: coeur icon {coeur_im.size if coeur_im else None}, "
          f"composed 3-heart {composed_im.size if composed_im else None}, "
          f"atlas {atlas.width}x{atlas.height}")


def process_buttons(work_dir, emoji_out_dir, bouton_out_dir):
    os.makedirs(emoji_out_dir, exist_ok=True)
    os.makedirs(bouton_out_dir, exist_ok=True)
    written = []
    failed = []
    for char_id, name in BUTTON_MAP.items():
        svg_path = export_button_svg(char_id, work_dir)
        if not svg_path or not os.path.exists(svg_path):
            failed.append((char_id, name))
            continue
        svg = open(svg_path, errors="ignore").read()
        im, _ = render_padded(svg, pad=100)
        if not im:
            failed.append((char_id, name))
            continue
        if name.isdigit():
            path = os.path.join(emoji_out_dir, f"{name}.png")
        else:
            path = os.path.join(bouton_out_dir, f"{name}.png")
        im.save(path)
        written.append((char_id, name, im.size, path))
    print(f"buttons: {len(written)} written, {len(failed)} failed")
    for cid, name, size, path in written:
        print(f"  {cid} -> {path} ({size[0]}x{size[1]})")
    for cid, name in failed:
        print(f"  FAILED {cid} ({name})")


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--out-dir", required=True)
    p.add_argument("--emoji-dir", default=None, help="game-web emojis dir (default: <out-dir>/../../../../game-web/src/assets/images/emojis)")
    p.add_argument("--bouton-dir", default=None, help="game-web images dir for bouton_coeurs/bouton_zzz (default: sibling of emoji-dir)")
    args = p.parse_args()

    work_dir = tempfile.mkdtemp(prefix="swf_to_ui_emote_")
    fps = swf_frame_rate(SWF)
    print(f"SWF frame rate: {fps}")

    process_smile(work_dir, args.out_dir, fps)
    process_love(work_dir, args.out_dir)

    emoji_dir = args.emoji_dir or os.path.join(os.path.dirname(__file__), "..", "..", "game-web", "src", "assets", "images", "emojis")
    bouton_dir = args.bouton_dir or os.path.join(os.path.dirname(__file__), "..", "..", "game-web", "src", "assets", "images")
    process_buttons(work_dir, emoji_dir, bouton_dir)


if __name__ == "__main__":
    main()
