#!/usr/bin/env python3
"""Regenerate the chart SVGs in images/ from the shipped trajectory bytes.

Everything this script draws is read out of the task bundles themselves:
task.toml for the declared domain and language, trajectories/opus-5/run_N/
final_score.json for the combined score and its three channels, reward.json for
the RL signal, workflows.json for the workflow/substep counts, and usage.json for
cost and request counts. Nothing is hard-coded, and the loader refuses to
aggregate a task that is missing any part of the 3 x 8 grid.

The loader also re-derives every stored number rather than trusting it:

  * combined_score == workflow**0.50 * pytest**0.25 * (rubric * coverage)**0.25
  * reward.json reward == final_score reward == workflows_passed / workflows_total
  * every run declares deployed == 1.0 with empty invalid[] and degraded[]

It emits SVG only. It does NOT rasterize PNGs: the matching .png fallbacks in
images/ are browser-rendered exports of these exact SVGs. To regenerate them:

    for f in images/*-light.svg images/*-dark.svg; do
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \\
        --headless --disable-gpu --hide-scrollbars \\
        --screenshot="${f%.svg}.png" --window-size=1600,900 "file://$PWD/$f"
    done

(tasks_by_domain is 1600x1200; pass the taller window size for that pair.)

images/hero.svg is hand-drawn artwork, not output of this script, and is left
untouched by the loop above; export it at 1760x532.

The script also prints a plain-text summary of every number it computed. Run it
and diff the printed figures against README.md - they are the same numbers,
computed the same way, from the same files.

Usage:  python3 scripts/generate_charts.py
"""

import glob
import json
import math
import os
import statistics
import sys

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMAGES_DIR = os.path.join(REPO_ROOT, "images")

MODEL = "opus-5"
EXPECTED_RUNS = 8
EXPECTED_TASKS = 3

# The score fields ship rounded to four decimals, so a recomputed value can
# legitimately sit half a ten-thousandth away from the stored one. Anything
# beyond that is a real inconsistency and should stop the build.
RECOMPUTE_TOLERANCE = 0.001

# Ordered by observed pass rate, hardest last, so every chart reads left to right
# as difficulty increases and the three figures stay directly comparable.
TASK_ORDER = ["e0f889a5", "1b21d4ac", "63376906"]

SHORT_LABEL = {
    "e0f889a5": "storefront",
    "1b21d4ac": "talent-roster",
    "63376906": "mass-balance",
}

# Task accents, taken from the hero: signal gold, periwinkle, magenta.
TASK_COLORS = {
    "e0f889a5": ("#9a7400", "#ffd21f"),
    "1b21d4ac": ("#3f63a8", "#7a99d1"),
    "63376906": ("#a3008f", "#ee00ee"),
}

DOMAIN_LABEL = {
    "ecommerce-retail": "Ecommerce retail",
    "content-publishing": "Content publishing",
    "supply-chain-inventory": "Supply chain",
}

FONT_SANS = "'DM Sans','Inter','Segoe UI',Roboto,ui-sans-serif,system-ui,sans-serif"
FONT_MONO = "'JetBrains Mono','SF Mono','Berkeley Mono',ui-monospace,'Courier New',monospace"


def theme(dark):
    if dark:
        return {
            "bg0": "#0b0f1a", "bg1": "#161d31", "bg2": "#0d1220",
            "text": "#ffffff", "muted": "#8fa0c4",
            "grid": "rgba(122,153,209,0.13)", "axis": "rgba(122,153,209,0.40)",
            "slate": "#2b3352", "ring": "#0b0f1a",
        }
    return {
        "bg0": "#f8f9fc", "bg1": "#eceff7", "bg2": "#f8f9fc",
        "text": "#0b0f1a", "muted": "#4d5878",
        "grid": "rgba(43,51,82,0.11)", "axis": "rgba(43,51,82,0.35)",
        "slate": "#c9d0e4", "ring": "#ffffff",
    }


def color(uuid8, dark):
    light_col, dark_col = TASK_COLORS[uuid8]
    return dark_col if dark else light_col


def esc(s):
    return (str(s).replace("&", "&amp;").replace("<", "&lt;")
            .replace(">", "&gt;").replace('"', "&quot;"))


def parse_toml_flat(path):
    """Minimal reader for the handful of scalars we need.

    tomllib only exists from Python 3.11 and this script is meant to run on a
    bare system interpreter, so the few keys we care about are pulled out
    directly. The shipped files also pad keys with alignment spaces, which a
    partition-and-strip handles and a stricter reader would not need to.
    """
    out = {}
    section = None
    with open(path, encoding="utf-8") as fh:
        for raw in fh:
            line = raw.strip()
            if not line or line.startswith("#"):
                continue
            if line.startswith("[") and line.endswith("]"):
                section = line[1:-1].strip()
                continue
            if "=" not in line:
                continue
            key, _, val = line.partition("=")
            key, val = key.strip(), val.strip()
            if val.startswith('"') and val.endswith('"') and len(val) >= 2:
                out[f"{section}.{key}" if section else key] = val[1:-1]
    return out


def discover_task_uuids():
    uuids = []
    for name in sorted(os.listdir(REPO_ROOT)):
        path = os.path.join(REPO_ROOT, name)
        if not os.path.isdir(path) or name.startswith(".") or name in ("images", "scripts"):
            continue
        if not os.path.isfile(os.path.join(path, "task.toml")):
            continue
        # A task only counts once the full cohort is present, so a partially
        # copied bundle can never quietly shrink an aggregate.
        if os.path.isdir(os.path.join(path, "trajectories", MODEL)):
            uuids.append(name)
    return uuids


def load_task_meta(uuid):
    meta = parse_toml_flat(os.path.join(REPO_ROOT, uuid, "task.toml"))
    assert meta.get("task.uuid_v5") == uuid, \
        f"{uuid}: task.uuid_v5 {meta.get('task.uuid_v5')!r} does not match its directory"
    domain = meta.get("metadata.domain")
    assert domain in DOMAIN_LABEL, f"{uuid}: unexpected domain {domain!r}"
    return {
        "domain": domain,
        "language": meta.get("metadata.language"),
        "sub_category": meta.get("metadata.sub_category"),
        "name": meta.get("task.name"),
    }


def load_runs(uuid):
    base = os.path.join(REPO_ROOT, uuid, "trajectories", MODEL)
    run_dirs = sorted(glob.glob(os.path.join(base, "run_*")),
                      key=lambda p: int(os.path.basename(p).split("_")[1]))
    assert len(run_dirs) == EXPECTED_RUNS, \
        f"{uuid}: {len(run_dirs)} runs, expected {EXPECTED_RUNS}"

    ids = [int(os.path.basename(p).split("_")[1]) for p in run_dirs]
    assert ids == list(range(1, EXPECTED_RUNS + 1)), f"{uuid}: run ids {ids}"

    scores, rewards, pytest_ch, rubric_ch, cover = [], [], [], [], []
    costs, requests = [], []
    wf_pass = wf_total = 0
    br_pass = br_total = 0
    py_pass = py_total = 0
    critical_failed = 0
    declared_workflows, declared_substeps, declared_criteria = set(), set(), set()

    for run in run_dirs:
        with open(os.path.join(run, "final_score.json"), encoding="utf-8") as fh:
            fs = json.load(fh)
        with open(os.path.join(run, "reward.json"), encoding="utf-8") as fh:
            rw = json.load(fh)
        with open(os.path.join(run, "workflows.json"), encoding="utf-8") as fh:
            wf = json.load(fh)["summary"]
        with open(os.path.join(run, "usage.json"), encoding="utf-8") as fh:
            us = json.load(fh)

        c = fs["components"]
        w, p = c["workflow"]["score"], c["pytest"]["score"]
        r, cv = c["rubric"]["score"], c["rubric"]["coverage"]

        # The headline number is a weighted geometric mean of three channels, with
        # rubric credit discounted by how much of the rubric actually resolved.
        # Check it against the stored value rather than trusting either alone.
        recomputed = (w ** 0.50) * (p ** 0.25) * ((r * cv) ** 0.25)
        assert abs(recomputed - fs["combined_score"]) <= RECOMPUTE_TOLERANCE, \
            f"{run}: recomputed {recomputed:.6f} != stored {fs['combined_score']}"

        # reward.json is the only number that trains. It must be the workflow
        # pass rate and nothing else, in all three places it is written down.
        assert abs(rw["reward"] - fs["reward"]) <= RECOMPUTE_TOLERANCE, \
            f"{run}: reward.json {rw['reward']} != final_score {fs['reward']}"
        assert abs(wf["workflows_passed"] / wf["workflows_total"] - rw["reward"]) <= RECOMPUTE_TOLERANCE, \
            f"{run}: reward {rw['reward']} != {wf['workflows_passed']}/{wf['workflows_total']}"

        assert wf["deployed"] == 1.0, f"{run}: did not clear the deploy gate"
        assert fs["invalid"] == [] and fs["degraded"] == [], f"{run}: flagged run"

        scores.append(fs["combined_score"])
        rewards.append(rw["reward"])
        pytest_ch.append(p)
        rubric_ch.append(r)
        cover.append(cv)
        costs.append(us["cost_usd"])
        requests.append(us["request_count"])

        wf_pass += wf["workflows_passed"]
        wf_total += wf["workflows_total"]
        br_pass += wf["browser_substeps_passed"]
        br_total += wf["browser_substeps_total"]
        py_pass += wf["pytest_substeps_passed"]
        py_total += wf["pytest_substeps_total"]
        critical_failed += wf["critical_substeps_failed"]

        declared_workflows.add(wf["workflows_total"])
        declared_substeps.add(wf["substeps_total"])
        declared_criteria.add(c["rubric"]["criteria"])

    # Every run is graded against the same fixed spec, so a count that moves means
    # the task was edited mid-cohort and the pooled totals below are meaningless.
    for label, seen in (("workflows", declared_workflows),
                        ("substeps", declared_substeps),
                        ("rubric criteria", declared_criteria)):
        assert len(seen) == 1, f"{uuid}: {label} count varies across runs: {sorted(seen)}"

    def mean(xs):
        return sum(xs) / len(xs)

    return {
        "scores": scores,
        "pass_rate": mean(scores),
        # Sample standard deviation, n-1, matching the sigma quoted in README.md.
        "sigma": statistics.stdev(scores),
        "reward": mean(rewards),
        "pytest": mean(pytest_ch),
        "rubric": mean(rubric_ch),
        "coverage": mean(cover),
        "cost_per_run": mean(costs),
        "cost_min": min(costs),
        "cost_max": max(costs),
        "requests_per_run": mean(requests),
        "workflow_rate": wf_pass / wf_total,
        "browser_rate": br_pass / br_total,
        "pytest_rate": py_pass / py_total,
        "counts": {
            "workflows": (wf_pass, wf_total),
            "browser": (br_pass, br_total),
            "pytest": (py_pass, py_total),
            "critical_failed": critical_failed,
        },
    }


def build_dataset():
    uuids = discover_task_uuids()
    assert len(uuids) == EXPECTED_TASKS, f"found {len(uuids)} tasks, expected {EXPECTED_TASKS}"

    tasks = []
    for uuid in uuids:
        entry = {"uuid": uuid, "short": uuid[:8]}
        entry.update(load_task_meta(uuid))
        entry.update(load_runs(uuid))
        tasks.append(entry)

    shorts = {t["short"] for t in tasks}
    assert shorts == set(TASK_ORDER), f"tasks {sorted(shorts)} != {TASK_ORDER}"
    domains = {t["domain"] for t in tasks}
    assert len(domains) == EXPECTED_TASKS, f"expected one domain per task, got {sorted(domains)}"

    tasks.sort(key=lambda t: TASK_ORDER.index(t["short"]))
    return tasks


def svg_header(width, height, th, aria):
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" width="{width}" height="{height}" role="img" aria-label="{esc(aria)}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="{th['bg0']}"/>
      <stop offset="55%" stop-color="{th['bg1']}"/>
      <stop offset="100%" stop-color="{th['bg2']}"/>
    </linearGradient>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="6"/>
    </filter>
  </defs>
  <rect width="{width}" height="{height}" fill="url(#bg)"/>
"""


def titles(a, th, title, subtitle, left=110):
    a(f'  <text x="{left}" y="68" font-family="{FONT_SANS}" font-size="40" font-weight="bold" '
      f'fill="{th["text"]}" letter-spacing="-0.5">{esc(title)}</text>')
    a(f'  <text x="{left}" y="104" font-family="{FONT_MONO}" font-size="19" '
      f'fill="{th["muted"]}">{esc(subtitle)}</text>')
    a(f'  <rect x="{left}" y="120" width="64" height="4" rx="2" fill="#ffd21f"/>')


def legend(a, th, entries, x, y, gap=210):
    """entries is a list of (label, colour) pairs, laid out left to right."""
    for i, (label, col) in enumerate(entries):
        cx = x + i * gap
        a(f'  <rect x="{cx}" y="{y - 11}" width="22" height="22" rx="5" fill="{col}"/>')
        a(f'  <text x="{cx + 32}" y="{y + 7}" font-family="{FONT_MONO}" font-size="20" '
          f'fill="{th["text"]}">{esc(label)}</text>')


def footnote(a, th, text, x=110, y=876):
    a(f'  <text x="{x}" y="{y}" font-family="{FONT_MONO}" font-size="16" '
      f'fill="{th["muted"]}">{esc(text)}</text>')


def make_line_chart(path, dark, title, subtitle, x_labels, series,
                    y_max, y_step, axis_fmt, value_fmt, note):
    """series is a list of (label, colour_key, values) tuples, one line each."""
    th = theme(dark)
    W, H = 1600, 900
    # Stops short of the canvas to leave room for the mean labels on the right edge.
    left, right, top, bottom = 120, 1418, 190, 760

    n = len(x_labels)
    xs = [left + (right - left) * (i + 0.5) / n for i in range(n)]

    def y_of(v):
        return bottom - (v / y_max) * (bottom - top)

    out = [svg_header(W, H, th, f"{title}. {subtitle}")]
    a = out.append
    titles(a, th, title, subtitle)
    legend(a, th, [(lbl, color(key, dark)) for lbl, key, _ in series], 930, 62, 208)

    for i in range(int(round(y_max / y_step)) + 1):
        v = i * y_step
        y = y_of(v)
        a(f'  <line x1="{left}" y1="{y:.1f}" x2="{right}" y2="{y:.1f}" '
          f'stroke="{th["grid"]}" stroke-width="1"/>')
        a(f'  <text x="{left - 18}" y="{y + 7:.1f}" text-anchor="end" font-family="{FONT_MONO}" '
          f'font-size="18" fill="{th["muted"]}">{esc(axis_fmt(v))}</text>')
    a(f'  <line x1="{left}" y1="{y_of(0):.1f}" x2="{right}" y2="{y_of(0):.1f}" '
      f'stroke="{th["axis"]}" stroke-width="2"/>')

    for x in xs:
        a(f'  <line x1="{x:.1f}" y1="{top}" x2="{x:.1f}" y2="{bottom}" stroke="{th["grid"]}" '
          f'stroke-width="1" stroke-dasharray="4 8"/>')

    for _, key, values in series:
        for v in values:
            assert 0 <= v <= y_max, f"{path}: {v} outside axis range 0..{y_max}"
        col = color(key, dark)
        pts = " ".join(f"{x:.1f},{y_of(v):.1f}" for x, v in zip(xs, values))
        a(f'  <polyline points="{pts}" fill="none" stroke="{col}" stroke-width="4" '
          f'stroke-linejoin="round"/>')

    for _, key, values in series:
        col = color(key, dark)
        for x, v in zip(xs, values):
            y = y_of(v)
            a(f'  <circle cx="{x:.1f}" cy="{y:.1f}" r="10" fill="{col}" opacity="0.30" '
              f'filter="url(#glow)"/>')
            a(f'  <circle cx="{x:.1f}" cy="{y:.1f}" r="8" fill="{col}" stroke="{th["ring"]}" '
              f'stroke-width="3"/>')

    means = []
    for _, key, values in series:
        col = color(key, dark)
        mean = sum(values) / len(values)
        y = y_of(mean)
        a(f'  <line x1="{left}" y1="{y:.1f}" x2="{right}" y2="{y:.1f}" stroke="{col}" '
          f'stroke-width="1.5" stroke-dasharray="3 9" opacity="0.55"/>')
        means.append([y, col, value_fmt(mean)])

    # Two tasks can be a fraction of a point apart, which would stack their mean
    # labels on top of each other, so nudge them down until each clears the last.
    means.sort(key=lambda m: m[0])
    for i in range(1, len(means)):
        means[i][0] = max(means[i][0], means[i - 1][0] + 27)
    for y, col, text in means:
        a(f'  <text x="{right + 14}" y="{y + 7:.1f}" font-family="{FONT_MONO}" font-size="19" '
          f'font-weight="bold" fill="{col}">{esc(text)}</text>')

    for i, x in enumerate(xs):
        a(f'  <text x="{x:.1f}" y="{bottom + 42}" text-anchor="middle" font-family="{FONT_MONO}" '
          f'font-size="20" fill="{th["text"]}" letter-spacing="2">{esc(x_labels[i])}</text>')

    footnote(a, th, note)
    a("</svg>")
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(out) + "\n")


def make_bar_chart(path, dark, title, subtitle, groups, series,
                   y_max, y_step, axis_fmt, value_fmt, note, legend_entries=None):
    """Grouped columns.

    groups is a list of (label, sublabel) pairs, one cluster each. series is a
    list of (label, colour, values, ranges) tuples; ranges is either None or a
    list of (low, high) whiskers aligned with values.
    """
    th = theme(dark)
    W, H = 1600, 900
    left, right, top, bottom = 120, 1540, 200, 745

    out = [svg_header(W, H, th, f"{title}. {subtitle}")]
    a = out.append
    titles(a, th, title, subtitle)
    if legend_entries:
        legend(a, th, legend_entries, 1020, 62, 190)

    for i in range(int(round(y_max / y_step)) + 1):
        v = i * y_step
        y = bottom - (v / y_max) * (bottom - top)
        a(f'  <line x1="{left}" y1="{y:.1f}" x2="{right}" y2="{y:.1f}" '
          f'stroke="{th["grid"]}" stroke-width="1"/>')
        a(f'  <text x="{left - 18}" y="{y + 7:.1f}" text-anchor="end" font-family="{FONT_MONO}" '
          f'font-size="18" fill="{th["muted"]}">{esc(axis_fmt(v))}</text>')

    n_groups, n_series = len(groups), len(series)
    slot = (right - left) / n_groups
    bar_w = min(96.0, (slot * 0.62) / n_series)
    span = bar_w * n_series + 14 * (n_series - 1)

    for gi, (label, sublabel) in enumerate(groups):
        cx = left + slot * (gi + 0.5)
        if gi:
            a(f'  <line x1="{cx - slot / 2:.1f}" y1="{top - 20}" x2="{cx - slot / 2:.1f}" '
              f'y2="{bottom}" stroke="{th["grid"]}" stroke-width="1" stroke-dasharray="4 8"/>')

        for si, (_, col, values, ranges) in enumerate(series):
            v = values[gi]
            assert 0 <= v <= y_max, f"{path}: {v} outside axis range 0..{y_max}"
            x = cx - span / 2 + si * (bar_w + 14)
            y = bottom - (v / y_max) * (bottom - top)
            h = bottom - y
            a(f'  <rect x="{x:.1f}" y="{y:.1f}" width="{bar_w:.1f}" height="{h:.1f}" rx="6" '
              f'fill="{col}"/>')
            a(f'  <text x="{x + bar_w / 2:.1f}" y="{y - 16:.1f}" text-anchor="middle" '
              f'font-family="{FONT_MONO}" font-size="21" font-weight="bold" '
              f'fill="{col}">{esc(value_fmt(v))}</text>')

            if ranges:
                lo, hi = ranges[gi]
                assert lo <= v <= hi <= y_max, f"{path}: range {lo}..{hi} does not bracket {v}"
                y_lo = bottom - (lo / y_max) * (bottom - top)
                y_hi = bottom - (hi / y_max) * (bottom - top)
                # Beside the bar: drawn over the fill, the lower cap is unreadable.
                mx = x + bar_w + 30
                a(f'  <line x1="{mx:.1f}" y1="{y_hi:.1f}" x2="{mx:.1f}" y2="{y_lo:.1f}" '
                  f'stroke="{th["axis"]}" stroke-width="2"/>')
                for yy in (y_hi, y_lo):
                    a(f'  <line x1="{mx - 13:.1f}" y1="{yy:.1f}" x2="{mx + 13:.1f}" y2="{yy:.1f}" '
                      f'stroke="{th["axis"]}" stroke-width="2"/>')
                a(f'  <text x="{mx + 22:.1f}" y="{y_hi + 6:.1f}" font-family="{FONT_MONO}" '
                  f'font-size="17" fill="{th["muted"]}">{esc(value_fmt(hi))} max</text>')
                a(f'  <text x="{mx + 22:.1f}" y="{y_lo + 6:.1f}" font-family="{FONT_MONO}" '
                  f'font-size="17" fill="{th["muted"]}">{esc(value_fmt(lo))} min</text>')

        a(f'  <text x="{cx:.1f}" y="{bottom + 44}" text-anchor="middle" font-family="{FONT_SANS}" '
          f'font-size="26" fill="{th["text"]}">{esc(label)}</text>')
        a(f'  <text x="{cx:.1f}" y="{bottom + 74}" text-anchor="middle" font-family="{FONT_MONO}" '
          f'font-size="17" fill="{th["muted"]}">{esc(sublabel)}</text>')

    a(f'  <line x1="{left}" y1="{bottom}" x2="{right}" y2="{bottom}" stroke="{th["axis"]}" '
      f'stroke-width="2"/>')
    footnote(a, th, note)
    a("</svg>")
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(out) + "\n")


def make_donut(path, dark, title, subtitle, segments, centre_note, note):
    """segments is a list of (label, sublabel, count, colour) tuples."""
    th = theme(dark)
    W, H = 1600, 1200
    cx, cy, R, r = 700, 620, 300, 174
    total = sum(s[2] for s in segments)
    assert total > 0, f"{path}: empty donut"

    out = [svg_header(W, H, th, f"{title}. {subtitle}")]
    a = out.append
    titles(a, th, title, subtitle)

    angle = -90.0
    for label, sublabel, count, col in segments:
        sweep = 360.0 * count / total
        a0, a1 = math.radians(angle), math.radians(angle + sweep)
        large = 1 if sweep > 180 else 0

        x0, y0 = cx + R * math.cos(a0), cy + R * math.sin(a0)
        x1, y1 = cx + R * math.cos(a1), cy + R * math.sin(a1)
        xi0, yi0 = cx + r * math.cos(a1), cy + r * math.sin(a1)
        xi1, yi1 = cx + r * math.cos(a0), cy + r * math.sin(a0)
        a(f'  <path d="M {x0:.2f} {y0:.2f} A {R} {R} 0 {large} 1 {x1:.2f} {y1:.2f} '
          f'L {xi0:.2f} {yi0:.2f} A {r} {r} 0 {large} 0 {xi1:.2f} {yi1:.2f} Z" '
          f'fill="{col}" stroke="{th["bg1"]}" stroke-width="3"/>')

        mid = math.radians(angle + sweep / 2.0)
        lx0, ly0 = cx + (R + 8) * math.cos(mid), cy + (R + 8) * math.sin(mid)
        lx1, ly1 = cx + (R + 55) * math.cos(mid), cy + (R + 55) * math.sin(mid)
        a(f'  <line x1="{lx0:.2f}" y1="{ly0:.2f}" x2="{lx1:.2f}" y2="{ly1:.2f}" '
          f'stroke="{th["axis"]}" stroke-width="2"/>')
        a(f'  <circle cx="{lx1:.2f}" cy="{ly1:.2f}" r="5" fill="{col}"/>')

        rightish = math.cos(mid) >= 0
        tx = cx + (R + 90) * math.cos(mid)
        ty = cy + (R + 90) * math.sin(mid)
        anchor = "start" if rightish else "end"
        a(f'  <rect x="{tx if rightish else tx - 18:.2f}" y="{ty - 36:.2f}" width="18" '
          f'height="18" rx="4" fill="{col}"/>')
        lab_x = tx + 26 if rightish else tx - 26
        a(f'  <text x="{lab_x:.2f}" y="{ty - 20:.2f}" text-anchor="{anchor}" '
          f'font-family="{FONT_SANS}" font-size="30" font-weight="bold" '
          f'fill="{th["text"]}">{esc(label)}</text>')
        pct = 100.0 * count / total
        noun = "task" if count == 1 else "tasks"
        a(f'  <text x="{tx:.2f}" y="{ty + 12:.2f}" text-anchor="{anchor}" font-family="{FONT_MONO}" '
          f'font-size="20" fill="{th["muted"]}">{count} {noun} \u00b7 {pct:.0f}%</text>')
        a(f'  <text x="{tx:.2f}" y="{ty + 40:.2f}" text-anchor="{anchor}" font-family="{FONT_MONO}" '
          f'font-size="18" fill="{th["muted"]}">{esc(sublabel)}</text>')

        angle += sweep

    a(f'  <circle cx="{cx}" cy="{cy}" r="{r - 6}" fill="{th["bg1"]}"/>')
    a(f'  <text x="{cx}" y="{cy + 12}" text-anchor="middle" font-family="{FONT_SANS}" '
      f'font-size="86" font-weight="bold" fill="{th["text"]}">{total}</text>')
    a(f'  <text x="{cx}" y="{cy + 52}" text-anchor="middle" font-family="{FONT_MONO}" '
      f'font-size="22" fill="{th["muted"]}" letter-spacing="4">TASKS</text>')
    a(f'  <text x="{cx}" y="{cy + 86}" text-anchor="middle" font-family="{FONT_MONO}" '
      f'font-size="18" fill="{th["muted"]}">{esc(centre_note)}</text>')
    footnote(a, th, note, y=1160)
    a("</svg>")
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(out) + "\n")


def print_summary(tasks):
    print("=" * 78)
    print("Deku sample - figures recomputed from the shipped bytes")
    print("=" * 78)
    print()
    print(f"tasks {len(tasks)}   model {MODEL}   runs/task {EXPECTED_RUNS}   "
          f"rollouts {len(tasks) * EXPECTED_RUNS}")
    print()

    print("per task")
    print(f"  {'uuid':10} {'domain':24} {'lang':11} {'pass':>8} {'sigma':>8} "
          f"{'reward':>8} {'cost/run':>10}")
    for t in tasks:
        print(f"  {t['short']:10} {t['domain']:24} {t['language']:11} "
              f"{t['pass_rate'] * 100:7.2f}% {t['sigma']:8.4f} "
              f"{t['reward'] * 100:7.2f}% ${t['cost_per_run']:9.2f}")
    print()

    print("channels (mean over 8 runs)")
    for t in tasks:
        print(f"  {t['short']}  workflow {t['reward'] * 100:6.2f}%   "
              f"pytest {t['pytest'] * 100:6.2f}%   rubric {t['rubric'] * 100:6.2f}%   "
              f"coverage {t['coverage'] * 100:6.2f}%   combined {t['pass_rate'] * 100:6.2f}%")
    print()

    print("composition (pooled over 8 runs)")
    for t in tasks:
        c = t["counts"]
        print(f"  {t['short']}  workflows {c['workflows'][0]:4d}/{c['workflows'][1]:<4d} "
              f"{t['workflow_rate'] * 100:6.2f}%   "
              f"browser {c['browser'][0]:4d}/{c['browser'][1]:<4d} {t['browser_rate'] * 100:6.2f}%   "
              f"pytest {c['pytest'][0]:4d}/{c['pytest'][1]:<4d} {t['pytest_rate'] * 100:6.2f}%   "
              f"critical failed {c['critical_failed']}")
    print()

    print("cost spread (per run)")
    for t in tasks:
        print(f"  {t['short']}  mean ${t['cost_per_run']:7.2f}   "
              f"min ${t['cost_min']:7.2f}   max ${t['cost_max']:7.2f}   "
              f"{t['requests_per_run']:7.0f} requests")
    print()

    wf_p = sum(t["counts"]["workflows"][0] for t in tasks)
    wf_t = sum(t["counts"]["workflows"][1] for t in tasks)
    br_p = sum(t["counts"]["browser"][0] for t in tasks)
    br_t = sum(t["counts"]["browser"][1] for t in tasks)
    py_p = sum(t["counts"]["pytest"][0] for t in tasks)
    py_t = sum(t["counts"]["pytest"][1] for t in tasks)
    spend = sum(t["cost_per_run"] * EXPECTED_RUNS for t in tasks)

    print("corpus")
    print(f"  pass rate {sum(t['pass_rate'] for t in tasks) / len(tasks) * 100:6.2f}%   "
          f"reward {sum(t['reward'] for t in tasks) / len(tasks) * 100:6.2f}%")
    print(f"  workflows {wf_p}/{wf_t} ({wf_p / wf_t * 100:.2f}%)   "
          f"browser {br_p}/{br_t} ({br_p / br_t * 100:.2f}%)   "
          f"pytest {py_p}/{py_t} ({py_p / py_t * 100:.2f}%)")
    print(f"  critical substep failures {sum(t['counts']['critical_failed'] for t in tasks)}")
    print(f"  total agent spend ${spend:.2f} across {len(tasks) * EXPECTED_RUNS} rollouts")
    print()
    return {
        "workflow": wf_p / wf_t, "browser": br_p / br_t, "pytest": py_p / py_t,
    }


def main():
    os.makedirs(IMAGES_DIR, exist_ok=True)
    tasks = build_dataset()
    corpus = print_summary(tasks)

    run_labels = [f"R{i}" for i in range(1, EXPECTED_RUNS + 1)]
    pct = lambda xs: [v * 100.0 for v in xs]

    groups = [(SHORT_LABEL[t["short"]], t["short"]) for t in tasks]
    groups_with_corpus = groups + [("corpus", "all 24 runs")]

    segments = [
        (DOMAIN_LABEL[t["domain"]], f"{t['language']} \u00b7 {t['sub_category']}",
         1, color(t["short"], False))
        for t in tasks
    ]

    written = []
    for dark in (False, True):
        suffix = "dark" if dark else "light"


        p = os.path.join(IMAGES_DIR, f"pass_rate_by_run-{suffix}.svg")
        make_line_chart(
            p, dark,
            "Pass rate by run",
            "combined_score per rollout; dashed line is that task's 8-run mean",
            run_labels,
            [(SHORT_LABEL[t["short"]], t["short"], pct(t["scores"])) for t in tasks],
            y_max=60, y_step=15,
            axis_fmt=lambda v: f"{v:.0f}%",
            value_fmt=lambda v: f"{v:.1f}%",
            note="no run reached 1.0 and none reached 0.0; the corpus has neither a ceiling nor a floor effect",
        )
        written.append(p)

        p = os.path.join(IMAGES_DIR, f"cost_by_task-{suffix}.svg")
        make_bar_chart(
            p, dark,
            "Agent spend per run by task",
            "cost_usd from usage.json; whiskers span the cheapest and dearest of the 8 runs",
            groups,
            [("mean cost/run", "#ffd21f" if dark else "#9a7400",
              [t["cost_per_run"] for t in tasks],
              [(t["cost_min"], t["cost_max"]) for t in tasks])],
            y_max=400, y_step=100,
            axis_fmt=lambda v: f"${v:.0f}",
            value_fmt=lambda v: f"${v:.0f}",
            note="spend does not buy score: the dearest task per run is not the highest scoring one",
        )
        written.append(p)

        p = os.path.join(IMAGES_DIR, f"composition_gap-{suffix}.svg")
        wf_col = "#ee00ee" if dark else "#a3008f"
        br_col = "#7a99d1" if dark else "#3f63a8"
        py_col = "#ffd21f" if dark else "#9a7400"
        make_bar_chart(
            p, dark,
            "Substep accuracy versus workflow accuracy",
            "a workflow passes only when every one of its substeps passes",
            groups_with_corpus,
            [
                ("pytest substeps", py_col,
                 pct([t["pytest_rate"] for t in tasks] + [corpus["pytest"]]), None),
                ("browser substeps", br_col,
                 pct([t["browser_rate"] for t in tasks] + [corpus["browser"]]), None),
                ("workflows", wf_col,
                 pct([t["workflow_rate"] for t in tasks] + [corpus["workflow"]]), None),
            ],
            y_max=100, y_step=25,
            axis_fmt=lambda v: f"{v:.0f}%",
            value_fmt=lambda v: f"{v:.0f}%",
            note="the workflow column is the RL signal; the gap to its left is competence that did not compose",
            legend_entries=[("pytest", py_col), ("browser", br_col), ("workflow", wf_col)],
        )
        written.append(p)

        p = os.path.join(IMAGES_DIR, f"tasks_by_domain-{suffix}.svg")
        make_donut(
            p, dark,
            "Task coverage by domain",
            "three distinct product domains, one brief each",
            [(lbl, sub, n, dcol if dark else lcol)
             for (lbl, sub, n, _), (lcol, dcol) in
             zip(segments, [TASK_COLORS[t["short"]] for t in tasks])],
            f"{len({t['language'] for t in tasks})} languages",
            note="every brief ships all ten specification sections and an empty /app",
        )
        written.append(p)

    print("wrote")
    for p in written:
        print(f"  images/{os.path.basename(p)}")
    print()
    print("SVG only. The .png fallbacks in images/ are browser-rendered exports of")
    print("these exact files and are not produced by this script.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
