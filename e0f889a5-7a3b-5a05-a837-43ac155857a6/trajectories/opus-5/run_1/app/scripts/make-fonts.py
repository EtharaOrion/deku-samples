from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.subset import Subsetter, Options
import sys

CHARS = ''.join([
    ''.join(chr(c) for c in range(0x20, 0x7F)),
    '\u2018\u2019\u201c\u201d\u2013\u2014\u2026\u00a0\u00b7\u2022\u00d7\u2192\u2190\u00a9\u00ae\u2122\u00b0\u00e9\u00e8\u00e4\u00f6\u00fc\u00df\u00e5\u00f8\u00e6',
])

for weight, out in ((400, 'vela-grotesque-400.woff2'), (700, 'vela-grotesque-700.woff2')):
    f = TTFont('archivo-var.ttf')
    inst = instantiateVariableFont(f, {'wght': weight, 'wdth': 100}, inplace=True, updateFontNames=False)
    opts = Options()
    opts.layout_features = ['kern', 'liga', 'calt', 'tnum', 'lnum', 'ccmp', 'locl', 'mark', 'mkmk']
    opts.desubroutinize = True
    opts.notdef_outline = True
    opts.name_IDs = ['*']
    opts.name_legacy = True
    opts.recalc_bounds = True
    s = Subsetter(options=opts)
    s.populate(text=CHARS)
    s.subset(inst)
    inst.flavor = 'woff2'
    inst.save(out)
    print(out, 'ok')
