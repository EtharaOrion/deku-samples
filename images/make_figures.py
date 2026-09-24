#!/usr/bin/env python3
"""Regenerate every chart in images/ from the shipped trajectory bytes.

Reads final_score.json, workflows.json and usage.json out of every run
directory, plus task.toml for labels, and writes the -light and -dark SVG
pair for each figure. Nothing is hand-entered.

    python3 images/make_figures.py

PNG fallbacks are rendered from these SVGs separately; see the Reproduction
section of README.md.
"""

from __future__ import annotations

import json
import math
import pathlib
import re
from collections import defaultdict

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "images"
MODELS = ["opus-5", "glm-5.3"]

SERIF = "Georgia, 'Iowan Old Style', 'Times New Roman', ui-serif, serif"
MONO = "'JetBrains Mono','SF Mono','Berkeley Mono',ui-monospace,'Courier New',monospace"

THEMES = {
    "light": dict(
        bg=("#faf8f4", "#f3efe6", "#faf8f4"),
        ink="#0a1414",
        muted="#4a6560",
        grid="rgba(10,30,28,0.10)",
        axis="rgba(10,30,28,0.35)",
        outline="#ffffff",
        hatch="rgba(255,255,255,0.55)",
        hole="#f3efe6",
        series=("#0e8a78", "#b9781f", "#6a5acd"),
    ),
    "dark": dict(
        bg=("#071313", "#0a1e1c", "#050c0c"),
        ink="#eef2ea",
        muted="#9fc4bc",
        grid="rgba(190,225,218,0.12)",
        axis="rgba(190,225,218,0.38)",
        outline="#050c0c",
        hatch="rgba(5,12,12,0.55)",
        hole="#0f2723",
        series=("#35d0ba", "#e2ac52", "#9d8df1"),
    ),
}

# plot box shared by every 1600x900 chart
X0, X1, Y0, Y1 = 110.0, 1540.0, 150.0, 770.0

# glyph advance as a fraction of font-size, used only to keep labels on canvas
SERIF_ADVANCE, MONO_ADVANCE = 0.56, 0.60
TEXT_COL_LEFT, TEXT_COL_RIGHT = 110.0, 1490.0


# --------------------------------------------------------------------------
# data
# --------------------------------------------------------------------------


def task_dirs() -> list[pathlib.Path]:
    return sorted(p for p in ROOT.iterdir() if p.is_dir() and len(p.name) == 36)


def toml_value(text: str, key: str) -> str:
    m = re.search(rf"^\s*{key}\s*=\s*(.+?)\s*$", text, re.M)
    return m.group(1).strip().strip('"') if m else ""


def load() -> dict:
    """Every number every figure needs, straight out of the run directories."""
    tasks = []
    for d in task_dirs():
        toml = (d / "task.toml").read_text()
        tasks.append(
            dict(
                uuid=d.name,
                short=d.name[:8],
                label=toml_value(toml, "name").split("/")[-1],
                domain=toml_value(toml, "domain"),
                difficulty=toml_value(toml, "difficulty"),
                dir=d,
            )
        )

    runs = defaultdict(list)  # (short, model) -> [per-run dict]
    for t in tasks:
        for m in MODELS:
            paths = sorted(
                (t["dir"] / "trajectories" / m).glob("run_*"),
                key=lambda p: int(p.name.split("_")[1]),
            )
            for r in paths:
                fs = json.loads((r / "final_score.json").read_text())
                wf = json.loads((r / "workflows.json").read_text())["summary"]
                us = json.loads((r / "usage.json").read_text())
                runs[(t["short"], m)].append(
                    dict(
                        score=fs["combined_score"],
                        workflow=fs["components"]["workflow"]["score"],
                        pytest=fs["components"]["pytest"]["score"],
                        rubric=fs["components"]["rubric"]["score"],
                        cost=us["cost_usd"],
                        summary=wf,
                    )
                )
    return dict(tasks=tasks, runs=runs)


def mean(xs) -> float:
    xs = list(xs)
    return sum(xs) / len(xs) if xs else 0.0


# --------------------------------------------------------------------------
# svg primitives
# --------------------------------------------------------------------------


def head(th: dict, w: int, h: int, aria: str, title: str, sub: str) -> list[str]:
    a, b, c = th["bg"]
    return [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" '
        f'height="{h}" role="img" aria-label="{aria}">',
        "  <defs>",
        '    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">',
        f'      <stop offset="0%" stop-color="{a}"/>',
        f'      <stop offset="60%" stop-color="{b}"/>',
        f'      <stop offset="100%" stop-color="{c}"/>',
        "    </linearGradient>",
        '    <pattern id="hatch" width="8" height="8" patternUnits="userSpaceOnUse" '
        'patternTransform="rotate(45)">',
        f'      <rect width="8" height="8" fill="{th["series"][1]}"/>',
        f'      <line x1="0" y1="0" x2="0" y2="8" stroke="{th["hatch"]}" stroke-width="3"/>',
        "    </pattern>",
        '    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">',
        '      <feGaussianBlur stdDeviation="6"/>',
        "    </filter>",
        "  </defs>",
        f'  <rect width="{w}" height="{h}" fill="url(#bg)"/>',
        "",
        f'  <text x="110" y="{72 if h == 900 else 96}" font-family="{SERIF}" '
        f'font-size="{40 if h == 900 else 44}" font-weight="bold" fill="{th["ink"]}">{title}</text>',
        f'  <text x="110" y="{108 if h == 900 else 136}" font-family="{MONO}" '
        f'font-size="{19 if h == 900 else 20}" fill="{th["muted"]}">{sub}</text>',
    ]


def legend(th: dict, x: float) -> list[str]:
    """opus-5 solid teal circle, glm-5.3 dashed amber hatched diamond."""
    o, g = th["series"][0], th["series"][1]
    return [
        f'  <line x1="{x}" y1="47" x2="{x + 46}" y2="47" stroke="{o}" stroke-width="4"/>',
        f'  <circle cx="{x + 23}" cy="47" r="8" fill="{o}" stroke="{th["outline"]}" stroke-width="3"/>',
        f'  <text x="{x + 58}" y="54" font-family="{MONO}" font-size="20" fill="{th["ink"]}">opus-5</text>',
        f'  <line x1="{x + 158}" y1="47" x2="{x + 204}" y2="47" stroke="{g}" stroke-width="3.5" '
        'stroke-dasharray="9 7"/>',
        f'  <polygon points="{x + 181},38 {x + 190},47 {x + 181},56 {x + 172},47" '
        f'fill="url(#hatch)" stroke="{th["outline"]}" stroke-width="2.5"/>',
        f'  <text x="{x + 216}" y="54" font-family="{MONO}" font-size="20" fill="{th["ink"]}">glm-5.3</text>',
    ]


def y_axis(th: dict, ticks: list[float], vmax: float, fmt) -> list[str]:
    out = []
    for v in ticks:
        y = Y1 - (v / vmax) * (Y1 - Y0)
        out.append(f'  <line x1="{X0}" y1="{y:.1f}" x2="{X1}" y2="{y:.1f}" stroke="{th["grid"]}" stroke-width="1"/>')
        out.append(
            f'  <text x="{X0 - 16}" y="{y + 7:.1f}" text-anchor="end" font-family="{MONO}" '
            f'font-size="18" fill="{th["muted"]}">{fmt(v)}</text>'
        )
    out.append(f'  <line x1="{X0}" y1="{Y1}" x2="{X1}" y2="{Y1}" stroke="{th["axis"]}" stroke-width="2"/>')
    return out


def footnote(th: dict, text: str, y: int) -> str:
    return f'  <text x="110" y="{y}" font-family="{MONO}" font-size="16" fill="{th["muted"]}">{text}</text>'


def write(name: str, theme: str, body: list[str]) -> None:
    path = OUT / f"{name}-{theme}.svg"
    path.write_text("\n".join(body) + "\n</svg>\n")
    print("wrote", path.relative_to(ROOT))


# --------------------------------------------------------------------------
# chart builders
# --------------------------------------------------------------------------


def bar_chart(name, theme, title, sub, groups, series, vmax, ticks, fmt, note, label_fmt=None):
    """groups: [(caption, sub-caption, [v_opus, v_glm]), ...]"""
    label_fmt = label_fmt or fmt
    th = THEMES[theme]
    s = head(th, 1600, 900, f"{title}. {sub}", title, sub)
    s += legend(th, 1180)
    s += y_axis(th, ticks, vmax, fmt)

    span = (X1 - X0) / len(groups)
    bw, gap = 118.0, 18.0
    for i, (cap, subcap, vals) in enumerate(groups):
        cx = X0 + span * (i + 0.5)
        for k, v in enumerate(vals):
            x = cx - bw - gap / 2 + k * (bw + gap)
            h = (v / vmax) * (Y1 - Y0)
            fill = series[0] if k == 0 else "url(#hatch)"
            s.append(
                f'  <rect x="{x:.1f}" y="{Y1 - h:.1f}" width="{bw}" height="{h:.1f}" rx="3" '
                f'fill="{fill}" stroke="{th["outline"]}" stroke-width="2"/>'
            )
            s.append(
                f'  <text x="{x + bw / 2:.1f}" y="{Y1 - h - 16:.1f}" text-anchor="middle" '
                f'font-family="{MONO}" font-size="21" font-weight="bold" '
                f'fill="{series[0] if k == 0 else series[1]}">{label_fmt(v)}</text>'
            )
        s.append(
            f'  <text x="{cx:.1f}" y="810" text-anchor="middle" font-family="{SERIF}" '
            f'font-size="26" fill="{th["ink"]}">{cap}</text>'
        )
        s.append(
            f'  <text x="{cx:.1f}" y="838" text-anchor="middle" font-family="{MONO}" '
            f'font-size="18" fill="{th["muted"]}">{subcap}</text>'
        )
    s.append(footnote(th, note, 876))
    write(name, theme, s)


def swatch_legend(th: dict, entries: list[tuple[str, int]]) -> list[str]:
    """Right-aligned colour swatches, for charts where colour encodes the task."""
    out, x = [], 1540.0
    for label, ci in reversed(entries):
        w = MONO_ADVANCE * 20 * len(label)
        out.append(
            f'  <text x="{x:.1f}" y="54" text-anchor="end" font-family="{MONO}" '
            f'font-size="20" fill="{th["ink"]}">{label}</text>'
        )
        out.append(f'  <rect x="{x - w - 26:.1f}" y="38" width="18" height="18" rx="4" fill="{th["series"][ci]}"/>')
        x -= w + 52
    return out


def line_chart(name, theme, title, sub, xlabels, series, vmax, ticks, fmt, note, legend_entries=None):
    """series: [(label, colour_index, dashed, [values])]"""
    th = THEMES[theme]
    s = head(th, 1600, 900, f"{title}. {sub}", title, sub)
    s += swatch_legend(th, legend_entries) if legend_entries else legend(th, 1180)
    s += y_axis(th, ticks, vmax, fmt)

    n = len(xlabels)
    span = (X1 - X0) / n
    xs = [X0 + span * (i + 0.5) for i in range(n)]
    for x in xs:
        s.append(
            f'  <line x1="{x:.1f}" y1="{Y0}" x2="{x:.1f}" y2="{Y1}" stroke="{th["grid"]}" '
            'stroke-width="1" stroke-dasharray="4 8"/>'
        )

    def ypos(v):
        return Y1 - (v / vmax) * (Y1 - Y0)

    for _label, ci, dashed, vals in series:
        col = th["series"][ci]
        pts = " ".join(f"{x:.1f},{ypos(v):.1f}" for x, v in zip(xs, vals))
        dash = ' stroke-dasharray="9 7"' if dashed else ""
        s.append(f'  <polyline points="{pts}" fill="none" stroke="{col}" stroke-width="{3.5 if dashed else 4}"{dash}/>')
    for _label, ci, dashed, vals in series:
        col = th["series"][ci]
        for x, v in zip(xs, vals):
            y = ypos(v)
            if dashed:
                s.append(
                    f'  <polygon points="{x:.1f},{y - 9:.1f} {x + 9:.1f},{y:.1f} {x:.1f},{y + 9:.1f} '
                    f'{x - 9:.1f},{y:.1f}" fill="{th["bg"][1]}" stroke="{col}" stroke-width="3"/>'
                )
            else:
                s.append(f'  <circle cx="{x:.1f}" cy="{y:.1f}" r="8" fill="{col}" stroke="{th["outline"]}" stroke-width="3"/>')

    for x, lab in zip(xs, xlabels):
        cap, subcap = lab if isinstance(lab, tuple) else (lab, "")
        s.append(
            f'  <text x="{x:.1f}" y="810" text-anchor="middle" font-family="{SERIF}" '
            f'font-size="26" fill="{th["ink"]}">{cap}</text>'
        )
        if subcap:
            s.append(
                f'  <text x="{x:.1f}" y="838" text-anchor="middle" font-family="{MONO}" '
                f'font-size="18" fill="{th["muted"]}">{subcap}</text>'
            )
    s.append(footnote(th, note, 876))
    write(name, theme, s)


def donut(name, theme, title, sub, slices, centre_big, centre_small, note):
    th = THEMES[theme]
    s = head(th, 1600, 1200, f"{title}. {sub}", title, sub)
    cx, cy, R, r = 672.0, 672.0, 330.0, 190.0
    total = sum(v for _, v, _ in slices)
    ang = -90.0
    for i, (label, value, caption) in enumerate(slices):
        sweep = 360.0 * value / total
        a0, a1 = math.radians(ang), math.radians(ang + sweep)
        col = th["series"][i % 3]
        large = 1 if sweep > 180 else 0
        p = (
            f"M {cx + R * math.cos(a0):.2f} {cy + R * math.sin(a0):.2f} "
            f"A {R:.0f} {R:.0f} 0 {large} 1 {cx + R * math.cos(a1):.2f} {cy + R * math.sin(a1):.2f} "
            f"L {cx + r * math.cos(a1):.2f} {cy + r * math.sin(a1):.2f} "
            f"A {r:.0f} {r:.0f} 0 {large} 0 {cx + r * math.cos(a0):.2f} {cy + r * math.sin(a0):.2f} Z"
        )
        s.append(f'  <path d="{p}" fill="{col}" stroke="{th["hole"]}" stroke-width="3"/>')

        mid = math.radians(ang + sweep / 2)
        lx, ly = cx + (R + 34) * math.cos(mid), cy + (R + 34) * math.sin(mid)
        ex, ey = cx + (R + 96) * math.cos(mid), cy + (R + 96) * math.sin(mid)
        right = math.cos(mid) >= 0
        fs = 30
        width = SERIF_ADVANCE * fs * len(label)
        if right:
            tx = min(ex + 26, TEXT_COL_RIGHT - width)
            anchor, sx = "start", tx
        else:
            tx = max(ex - 26, TEXT_COL_LEFT + width)
            anchor, sx = "end", tx - 18
        s.append(f'  <line x1="{lx:.2f}" y1="{ly:.2f}" x2="{ex:.2f}" y2="{ey:.2f}" stroke="{th["axis"]}" stroke-width="2"/>')
        s.append(f'  <circle cx="{ex:.2f}" cy="{ey:.2f}" r="5" fill="{col}"/>')
        s.append(f'  <rect x="{sx:.2f}" y="{ey - 34:.2f}" width="18" height="18" rx="4" fill="{col}"/>')
        s.append(
            f'  <text x="{(tx + 26 if right else tx - 26):.2f}" y="{ey - 18:.2f}" text-anchor="{anchor}" '
            f'font-family="{SERIF}" font-size="{fs}" font-weight="bold" fill="{th["ink"]}">{label}</text>'
        )
        s.append(
            f'  <text x="{tx:.2f}" y="{ey + 14:.2f}" text-anchor="{anchor}" font-family="{MONO}" '
            f'font-size="20" fill="{th["muted"]}">{caption}</text>'
        )
        ang += sweep

    s.append(f'  <circle cx="{cx:.0f}" cy="{cy:.0f}" r="184" fill="{th["hole"]}"/>')
    s.append(
        f'  <text x="{cx:.0f}" y="690" text-anchor="middle" font-family="{SERIF}" font-size="86" '
        f'font-weight="bold" fill="{th["ink"]}">{centre_big}</text>'
    )
    s.append(
        f'  <text x="{cx:.0f}" y="730" text-anchor="middle" font-family="{MONO}" font-size="22" '
        f'fill="{th["muted"]}" letter-spacing="4">TASKS</text>'
    )
    s.append(
        f'  <text x="{cx:.0f}" y="764" text-anchor="middle" font-family="{MONO}" font-size="18" '
        f'fill="{th["muted"]}">{centre_small}</text>'
    )
    s.append(footnote(th, note, 1160))
    write(name, theme, s)


# --------------------------------------------------------------------------
# figures
# --------------------------------------------------------------------------


def main() -> None:
    d = load()
    tasks, runs = d["tasks"], d["runs"]
    pct = lambda v: f"{v * 100:.2f}%"
    pct0 = lambda v: f"{v * 100:.0f}%"
    usd = lambda v: f"${v:,.0f}"

    score = {k: mean(r["score"] for r in v) for k, v in runs.items()}
    cost = {k: mean(r["cost"] for r in v) for k, v in runs.items()}

    for theme in THEMES:
        th = THEMES[theme]

        # 1 — pass rate by task and model
        bar_chart(
            "pass_rate_by_model", theme,
            "Partial-credit pass rate by task",
            "mean combined_score over 8 runs per model",
            [
                (t["label"], f'{t["short"]} · {t["difficulty"]}',
                 [score[(t["short"], m)] for m in MODELS])
                for t in tasks
            ],
            th["series"], 0.60, [0.0, 0.15, 0.30, 0.45, 0.60], pct0,
            "no rollout passed every workflow; every bar is partial credit, not pass@k",
            label_fmt=pct,
        )

        # 2 — per-run pass rate
        line_chart(
            "pass_rate_by_run", theme,
            "Pass rate by run",
            "combined_score for each of the 8 rollouts; colour is the task, dash is glm-5.3",
            [f"run_{i}" for i in range(1, 9)],
            [
                (f'{t["short"]} {m}', i, m == "glm-5.3",
                 [r["score"] for r in runs[(t["short"], m)]])
                for i, t in enumerate(tasks) for m in MODELS
            ],
            0.60, [0.0, 0.15, 0.30, 0.45, 0.60], pct0,
            "solid with filled markers is opus-5, dashed with hollow markers is glm-5.3; "
            "run order is recording order, not a time series",
            legend_entries=[(t["short"], i) for i, t in enumerate(tasks)],
        )

        # 3 — cost per run
        bar_chart(
            "cost_by_task", theme,
            "Mean agent spend per run",
            "usage.json cost_usd, averaged over 8 runs per model",
            [
                (t["label"], t["short"], [cost[(t["short"], m)] for m in MODELS])
                for t in tasks
            ],
            th["series"], 200.0, [0.0, 50.0, 100.0, 150.0, 200.0], usd,
            "opus-5 spend is harness-reported; glm-5.3 spend is computed from published list rates",
            label_fmt=lambda v: f"${v:,.2f}",
        )

        # 4 — composition gap
        chan = {}
        for m in MODELS:
            agg = defaultdict(int)
            for t in tasks:
                for r in runs[(t["short"], m)]:
                    for k, v in r["summary"].items():
                        if isinstance(v, (int, float)):
                            agg[k] += v
            chan[m] = agg
        bar_chart(
            "composition_gap", theme,
            "Substep accuracy against workflow accuracy",
            "a workflow passes only when every one of its substeps passes",
            [
                ("browser substeps", "119 declared",
                 [chan[m]["browser_substeps_passed"] / chan[m]["browser_substeps_total"] for m in MODELS]),
                ("pytest substeps", "155 declared",
                 [chan[m]["pytest_substeps_passed"] / chan[m]["pytest_substeps_total"] for m in MODELS]),
                ("workflows", "52 declared",
                 [chan[m]["workflows_passed"] / chan[m]["workflows_total"] for m in MODELS]),
            ],
            th["series"], 0.80, [0.0, 0.20, 0.40, 0.60, 0.80], pct0,
            "the workflow column is the composed result; the two to its left are its parts",
            label_fmt=pct,
        )

        # 5 — pass rate by difficulty tier
        tiers = {}
        for t in tasks:
            tiers.setdefault(t["difficulty"], []).append(t["short"])
        order = [k for k in ("trivial", "easy", "medium", "hard", "expert") if k in tiers]
        line_chart(
            "pass_rate_by_tier", theme,
            "Partial-credit pass rate by tier",
            "mean combined_score over 8 runs per model, tiers cut on opus-5",
            [(k, f"n={len(tiers[k])}") for k in order],
            [
                (m, 0 if m == "opus-5" else 1, m == "glm-5.3",
                 [mean(score[(s, m)] for s in tiers[k]) for k in order])
                for m in MODELS
            ],
            0.60, [0.0, 0.15, 0.30, 0.45, 0.60], pct0,
            "two tiers are occupied; the line is a visual guide across bands, not a continuous trend",
        )

        # 6 — coverage by domain
        donut(
            "tasks_by_domain", theme,
            "Task coverage by domain",
            "three distinct domains, one task each",
            [(t["domain"], 1, f'1 task · {100 // len(tasks)}%') for t in tasks],
            len(tasks), f"{len(tasks)} domains",
            "every brief is hand-authored for this benchmark; no upstream repository content",
        )


if __name__ == "__main__":
    main()
