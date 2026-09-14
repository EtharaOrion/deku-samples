#!/usr/bin/env python3
"""Subset Liberation faces into the characters Ravel uses, and minify.
Liberation fonts are licensed under the SIL Open Font License 1.1, which permits
redistribution and subsetting. Ravel is a zero-asset build: these are the text
families named in the substitution manifest."""
import os, sys
from fontTools.subset import Subsetter, Options
from fontTools.ttLib import TTFont

SRC = "/usr/share/fonts/truetype/liberation"
OUT = os.environ.get("RAVEL_FONT_OUT", "/tmp/ravel-fonts")
os.makedirs(OUT, exist_ok=True)

CHARS = "".join(sorted(set(
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    " .,;:!?'" '"' "`"
    "([{<)]}>/*+-=_#@$%&|^~\\\n\t"
    "éèêëàâäîïôöûüçñÉÈÊÀÂÄÎÏÔÖÛÜÇÑ"
    "åÅøØæÆß€£¥"
    "×÷±°µ²³½¼¾"
    "–—…‹›«»"
    "  −"
    "  "
)))

def one(path, out, name, keep_cmap_variants=False):
    font = TTFont(path)
    opt = Options()
    opt.name_IDs = ["*"]
    opt.name_legacy = True
    opt.name_languages = ["*"]
    opt.notdef_outline = True
    opt.recommended_glyphs = True
    opt.glyph_names = False
    opt.hinting = False
    opt.legacy_kern = True
    opt.layout_features = ["kern", "liga", "calt", "clig", "ccmp", "locl", "mark", "mkmk", "onum", "tnum"]
    opt.no_subset_tables += []
    ss = Subsetter(options=opt)
    ss.populate(unicodes=[ord(c) for c in CHARS])
    ss.subset(font)
    font.save(out)
    print(out, os.path.getsize(out))

one(f"{SRC}/LiberationSerif-Regular.ttf", f"{OUT}/{name}" if (name := "ravel-serif-regular.ttf") else "", name)
one(f"{SRC}/LiberationSerif-Bold.ttf", f"{OUT}/ravel-serif-bold.ttf", "ravel-serif-bold.ttf")
one(f"{SRC}/LiberationSerif-Italic.ttf", f"{OUT}/ravel-serif-italic.ttf", "ravel-serif-italic.ttf")
one(f"{SRC}/LiberationSans-Regular.ttf", f"{OUT}/ravel-grotesk-regular.ttf", "ravel-grotesk-regular.ttf")
one(f"{SRC}/LiberationSans-Bold.ttf", f"{OUT}/ravel-grotesk-bold.ttf", "ravel-grotesk-bold.ttf")
one(f"{SRC}/LiberationMono-Regular.ttf", f"{OUT}/ravel-mono-regular.ttf", "ravel-mono-regular.ttf")
one(f"{SRC}/LiberationMono-Bold.ttf", f"{OUT}/ravel-mono-bold.ttf", "ravel-mono-bold.ttf")
print("done")
