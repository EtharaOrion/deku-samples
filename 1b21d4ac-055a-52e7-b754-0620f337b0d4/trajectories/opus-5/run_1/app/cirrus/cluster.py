"""The entry cluster's authored positions.

Twenty slots, percentages of the window, dense toward the centre and thinning
toward the edges, four corners empty and the exact centre clear for the mark.
Positions are authored, not random, and the overlap order is stable.
"""

# (left %, top %, long edge px, z-index 0..5)
SLOTS = [
    (22.0, 16.0, 232, 2),
    (37.5, 9.5, 186, 3),
    (55.0, 13.0, 268, 1),
    (70.5, 20.0, 204, 2),
    (13.5, 31.0, 176, 1),
    (28.0, 34.5, 300, 4),
    (46.0, 27.5, 219, 5),
    (62.0, 36.0, 330, 3),
    (79.0, 41.0, 165, 1),
    (8.0, 52.0, 198, 2),
    (24.5, 57.0, 262, 3),
    (41.0, 62.5, 178, 4),
    (57.5, 58.0, 240, 2),
    (73.0, 63.0, 288, 1),
    (17.0, 74.5, 214, 3),
    (33.5, 80.0, 152, 2),
    (49.0, 77.0, 246, 1),
    (64.5, 82.5, 190, 4),
    (80.5, 72.0, 168, 2),
    (43.0, 45.0, 158, 0),
]


def layout(works):
    """Lay the published works over the authored slots, cycling if fewer."""
    out = []
    if not works:
        return out
    for index, (left, top, size, depth) in enumerate(SLOTS):
        work = works[index % len(works)]
        poster = work.get("poster") or {}
        width = poster.get("width") or 598
        height = poster.get("height") or 320
        ratio = (height / width) if width else 0.66
        w = size
        h = round(size * ratio)
        out.append(
            {
                "work": work,
                "left": left,
                "top": top,
                "width": w,
                "height": h,
                "depth": depth,
                "slot": index,
            }
        )
    return out
