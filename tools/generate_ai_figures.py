#!/usr/bin/env python3
"""Nine deterministic, theme-aware mathematical illustrations for the AI page.

These are exact finite examples or explicitly described schematics, not research
plots. Inline SVGs inherit the page's --figure-* colors; fallbacks support direct
viewing. IDs are prefixed per asset so all nine may coexist in one document.
"""
from fractions import Fraction
from html import escape
from pathlib import Path
import random
import xml.etree.ElementTree as ET

OUT = Path(__file__).resolve().parents[1] / "math_images"
BG = "var(--figure-bg, #e8f1e5)"
INK = "var(--figure-ink, #244333)"
MUTED = "var(--figure-muted, #476452)"
LINE = "var(--figure-line, #92b89d)"
ACCENT = "var(--figure-accent, #16763a)"
SOFT = "var(--figure-soft, #cee8d1)"
CONTRAST = "var(--figure-contrast, #f7fcf6)"
GENERATED = []


def canvas(slug, title, description):
    return [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480" role="img" aria-labelledby="{slug}-title {slug}-desc">',
        f'<title id="{slug}-title">{escape(title)}</title>',
        f'<desc id="{slug}-desc">{escape(description)}</desc>',
        f'<rect width="640" height="480" fill="{BG}"/>',
    ]


def label(p, x, y, text, size=26, fill=INK, anchor="start", weight=400):
    p.append(f'<text x="{x}" y="{y}" fill="{fill}" font-size="{size}" font-family="DejaVu Sans,Arial,sans-serif" font-weight="{weight}" text-anchor="{anchor}">{escape(text)}</text>')


def line(p, x1, y1, x2, y2, color=LINE, width=3, extra=""):
    p.append(f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{color}" stroke-width="{width}" {extra}/>')


def dot(p, x, y, radius=12, fill=ACCENT, stroke=BG, width=2):
    p.append(f'<circle cx="{x}" cy="{y}" r="{radius}" fill="{fill}" stroke="{stroke}" stroke-width="{width}"/>')


def arrow(p, x1, y1, x2, y2, color=ACCENT, width=4):
    import math
    line(p, x1, y1, x2, y2, color, width)
    angle = math.atan2(y2-y1, x2-x1)
    length, half = 14, 7
    bx, by = x2-length*math.cos(angle), y2-length*math.sin(angle)
    ax, ay = bx+half*math.sin(angle), by-half*math.cos(angle)
    cx, cy = bx-half*math.sin(angle), by+half*math.cos(angle)
    p.append(f'<path d="M {x2} {y2} L {ax:.2f} {ay:.2f} L {cx:.2f} {cy:.2f} Z" fill="{color}"/>')


def save(name, p):
    OUT.mkdir(parents=True, exist_ok=True)
    result = "\n".join(p+["</svg>"])+"\n"
    root = ET.fromstring(result)
    assert root.attrib["viewBox"] == "0 0 640 480"
    assert not root.findall(".//{http://www.w3.org/2000/svg}script")
    (OUT/name).write_text(result)
    GENERATED.append(name)


def word_overlaps():
    word = "10101"
    borders = [n for n in range(1, len(word)) if word[:n] == word[-n:]]
    assert borders == [1, 3]
    p = canvas("ai-word-overlaps", "The two proper borders of 10101", "Two copies of 10101 shifted by two places overlap in 101; shifted by four places, they overlap in 1. These are the word's two proper borders.")
    for border, y, x in ((3, 82, 140), (1, 310, 88)):
        shift = len(word)-border
        label(p, 36, y-30, f"OVERLAP  {word[:border]}", 25)
        for row in range(2):
            for i, symbol in enumerate(word):
                col = i+row*shift
                selected = shift <= col < len(word)
                cx, cy = x+col*52, y+row*62
                fill = ACCENT if selected else SOFT
                p.append(f'<rect x="{cx}" y="{cy}" width="48" height="48" rx="3" fill="{fill}" stroke="{ACCENT if selected else LINE}" stroke-width="2"/>')
                label(p, cx+24, cy+34, symbol, 31, CONTRAST if selected else INK, "middle")
    line(p, 36, 240, 604, 240, LINE, 2)
    save("ai-word-overlaps.svg", p)


def word_potentials():
    word, sequence = "101", "1010101"
    starts = [i for i in range(len(sequence)-len(word)+1) if sequence[i:i+len(word)] == word]
    assert starts == [0, 2, 4]
    p = canvas("ai-word-potentials", "Three occurrences of 101", "The finite word 1010101 contains three possibly overlapping occurrences of 101, at zero-based positions 0, 2 and 4. The brackets mark occurrences; this is not a Gibbs-frequency plot.")
    label(p, 36, 52, "COUNT THE OCCURRENCES", 25)
    for i, symbol in enumerate(sequence):
        x = 96+64*i
        p.append(f'<rect x="{x}" y="108" width="60" height="64" rx="3" fill="{SOFT}" stroke="{LINE}" stroke-width="2"/>')
        label(p, x+30, 153, symbol, 39, INK, "middle")
    for i, start in enumerate(starts):
        x, y = 96+64*start, 240+65*i
        line(p, x, y-12, x, y+2, ACCENT, 4)
        line(p, x, y, x+188, y, ACCENT, 4)
        line(p, x+188, y-12, x+188, y+2, ACCENT, 4)
        label(p, x+94, y-17, word, 27, ACCENT, "middle")
    label(p, 320, 447, "3 occurrences", 29, INK, "middle")
    save("ai-word-potentials.svg", p)


def pattern_overlaps():
    support = {(x, y) for x in range(3) for y in range(3)}
    shift = (2, 1)
    translated = {(x+shift[0], y+shift[1]) for x, y in support}
    common = support & translated
    assert common == {(2, 1), (2, 2)}
    p = canvas("ai-pattern-overlaps", "Two translated pattern supports", "Two three-by-three supports differ by the lattice translation (2, 1). Their intersection consists of two sites. Solid and dashed outlines distinguish the supports; this is a geometric schematic, not a claim about compatible pattern symbols.")
    label(p, 36, 52, "TRANSLATED SUPPORTS", 25)
    for x, y in sorted(support|translated):
        color = ACCENT if (x, y) in common else SOFT
        p.append(f'<rect x="{160+64*x}" y="{102+64*y}" width="60" height="60" fill="{color}" stroke="{LINE}" stroke-width="1.5"/>')
    p.append(f'<rect x="156" y="98" width="196" height="196" fill="none" stroke="{INK}" stroke-width="4"/>')
    p.append(f'<rect x="284" y="162" width="196" height="196" fill="none" stroke="{ACCENT}" stroke-width="4" stroke-dasharray="12 7"/>')
    label(p, 124, 130, "A", 29, INK, "middle")
    label(p, 506, 348, "B", 29, ACCENT, "middle")
    label(p, 320, 414, "shift (2, 1)", 29, INK, "middle")
    label(p, 320, 452, "2 shared sites", 25, MUTED, "middle")
    save("ai-pattern-overlaps.svg", p)


def particle_wakeup():
    p = canvas("ai-particle-wakeup", "One arrival wakes a sleeper", "Before a jump there is one active particle at a site, a sleeping particle at its right neighbor, and another unchanged sleeper farther right. After the jump the arrival site has two active particles. This is one legal ARW event, not a simulation.")
    for y, title in ((132, "BEFORE"), (304, "AFTER")):
        label(p, 36, y-63, title, 25)
        line(p, 64, y, 576, y, LINE, 3)
        for x in (88, 180, 272, 364, 456, 548):
            dot(p, x, y, 4, LINE, LINE)
    dot(p, 272, 132, 15)
    dot(p, 364, 132, 14, BG, INK, 4)
    dot(p, 548, 132, 14, BG, INK, 4)
    p.append(f'<path d="M 282 103 Q 318 75 351 100" fill="none" stroke="{ACCENT}" stroke-width="4"/>')
    p.append(f'<path d="M 351 100 L 335 99 L 343 87 Z" fill="{ACCENT}"/>')
    dot(p, 364, 287, 15)
    dot(p, 364, 321, 15)
    dot(p, 548, 304, 14, BG, INK, 4)
    label(p, 364, 367, "2 active", 26, INK, "middle")
    dot(p, 128, 432, 13)
    label(p, 151, 441, "active", 25)
    dot(p, 356, 432, 13, BG, INK, 3)
    label(p, 379, 441, "sleeping", 25)
    save("ai-particle-wakeup.svg", p)


def sleeper_dependence():
    group_a = {(x, y) for x in range(3) for y in range(3)}
    group_b = {(x+4, y) for x in range(3) for y in range(3)}
    assert not group_a & group_b
    p = canvas("ai-sleeper-dependence", "Dependence between disjoint groups of sites", "Two disjoint groups A and B of possible sleeping sites are marked with solid and dashed boundaries. A question mark asks about their dependence. The pictured occupancy choices are illustrative, not a sample from a stationary law and not a negative-correlation claim.")
    label(p, 36, 52, "TWO DISJOINT GROUPS", 25)
    for x, title, dashed in ((64, "A", False), (360, "B", True)):
        p.append(f'<rect x="{x}" y="107" width="216" height="232" rx="16" fill="{SOFT}" fill-opacity="0.65" stroke="{ACCENT if dashed else INK}" stroke-width="3"'+(' stroke-dasharray="11 7"' if dashed else '')+'/>')
        label(p, x+108, 91, title, 31, ACCENT if dashed else INK, "middle")
        for row in range(3):
            for col in range(3):
                occupied = (row+2*col+(1 if dashed else 0))%3 != 0
                dot(p, x+40+68*col, 151+68*row, 15, INK if occupied else BG, INK, 3)
    label(p, 320, 244, "?", 50, ACCENT, "middle")
    label(p, 320, 420, "How are A and B related?", 26, INK, "middle")
    save("ai-sleeper-dependence.svg", p)


def random_release():
    before = [Fraction(1,4), Fraction(5,4), Fraction(1,4)]
    release = Fraction(3,4)
    after = [before[0]+release/2, before[1]-release, before[2]+release/2]
    assert after == [Fraction(5,8), Fraction(1,2), Fraction(5,8)]
    assert sum(before) == sum(after) == Fraction(7,4)
    p = canvas("ai-random-release", "A conservative release of mass", "A site with mass 5/4 releases 3/4, divided equally between its two neighbors. Their masses change from (1/4, 5/4, 1/4) to (5/8, 1/2, 5/8). Total mass remains 7/4. This is a chosen legal toppling, not stationary-law data.")
    label(p, 36, 52, "RELEASE 3/4", 25)
    for y, values in ((142, before), (350, after)):
        line(p, 120, y, 520, y, LINE, 4)
        for x, value in zip((120, 320, 520), values):
            dot(p, x, y, 40, SOFT, ACCENT if x==320 else LINE, 3)
            label(p, x, y+10, str(value), 29, INK, "middle")
    arrow(p, 286, 188, 157, 292)
    arrow(p, 354, 188, 483, 292)
    label(p, 181, 222, "3/8", 27, ACCENT, "middle")
    label(p, 459, 222, "3/8", 27, ACCENT, "middle")
    arrow(p, 320, 197, 320, 292, MUTED, 3)
    label(p, 320, 444, "total mass = 7/4", 28, INK, "middle")
    save("ai-random-release.svg", p)


def clusters():
    size = 14
    rng = random.Random(2014)
    black = {(x, y) for y in range(size) for x in range(size) if rng.randrange(2)}
    remaining, components = set(black), []
    while remaining:
        first = min(remaining, key=lambda p: (p[1], p[0]))
        remaining.remove(first)
        component, stack = {first}, [first]
        while stack:
            x, y = stack.pop()
            for point in ((x-1,y),(x+1,y),(x,y-1),(x,y+1)):
                if point in remaining:
                    remaining.remove(point)
                    component.add(point)
                    stack.append(point)
        components.append(component)
    largest = max(components, key=len)
    assert (len(components), len(largest)) == (21, 27)
    p = canvas("ai-cluster-grid", "Twenty-one clusters in a finite coloring", "A fixed fourteen-by-fourteen coloring has twenty-one black clusters under shared-edge adjacency. The largest cluster has twenty-seven squares, highlighted in the accent color. This finite example does not estimate the limiting density.")
    for y in range(size):
        for x in range(size):
            color = ACCENT if (x,y) in largest else INK if (x,y) in black else SOFT
            p.append(f'<rect x="{124+x*28}" y="{30+y*28}" width="26" height="26" fill="{color}"/>')
    label(p, 320, 458, "21 clusters / largest 27", 26, INK, "middle")
    save("ai-cluster-grid.svg", p)


def coupon_clocks():
    waits = [2, 5, 5, 8]
    assert [i for i, t in enumerate(waits) if t == 5] == [1, 2]
    p = canvas("ai-coupon-clocks", "Independent discovery clocks can ring together", "Four chosen integer waiting times are 2, 5, 5 and 8. Clocks B and C ring together at time 5, illustrating a possible event for independent geometric clocks that cannot be two first discoveries in one coupon draw. This is a schematic, not a sampled data set.")
    label(p, 36, 48, "INDEPENDENT CLOCKS", 25)
    for row, (name, wait) in enumerate(zip("ABCD", waits)):
        y = 112+76*row
        label(p, 58, y+9, name, 27)
        line(p, 110, y, 566, y, LINE, 3)
        for t in range(9):
            line(p, 110+55*t, y-6, 110+55*t, y+6, LINE, 2)
        line(p, 110, y, 110+55*wait, y, ACCENT if wait==5 else INK, 5)
        dot(p, 110+55*wait, y, 13, ACCENT if wait==5 else INK, BG, 3)
    line(p, 385, 84, 385, 374, ACCENT, 2, 'stroke-dasharray="7 7"')
    for t in (0, 2, 5, 8):
        label(p, 110+55*t, 400, str(t), 25, MUTED, "middle")
    label(p, 320, 453, "B and C ring at t = 5", 27, INK, "middle")
    save("ai-coupon-clocks.svg", p)


def balloon_collisions():
    positions = [0, 2, 7, 13, 21]
    alive, events = list(range(5)), []
    while len(alive)>1:
        gaps = [(positions[b]-positions[a], a, b) for a,b in zip(alive,alive[1:])]
        gap, a, b = min(gaps)
        events.append((Fraction(gap,2), a, b))
        alive = [i for i in alive if i not in (a,b)]
    assert events == [(Fraction(1),0,1),(Fraction(3),2,3)] and alive == [4]
    p = canvas("ai-balloon-collisions", "Two collisions leave one balloon", "Five unit-speed growing intervals start at positions 0, 2, 7, 13 and 21 on a line, labelled A through E. A and B meet and disappear at time 1; C and D at time 3; E survives. Each row shows the remaining intervals just before its collision. This is a finite deterministic example.")
    label(p, 36, 46, "COLLISIONS ON A LINE", 25)
    for t, y, members, collision in ((1, 139, range(5), (0,1)), (3, 291, (2,3,4), (2,3))):
        label(p, 36, y-38, f"t = {t}", 25)
        for i in members:
            x, radius = 80+22*positions[i], 22*t
            color = ACCENT if i in collision else MUTED
            line(p, x-radius, y, x+radius, y, color, 8)
            line(p, x-radius, y-12, x-radius, y+12, color, 3)
            line(p, x+radius, y-12, x+radius, y+12, color, 3)
            dot(p, x, y, 8, color, BG, 2)
            label(p, x, y+41, "ABCDE"[i], 25, INK, "middle")
        meet = 80+22*(positions[collision[0]]+positions[collision[1]])/2
        dot(p, meet, y, 18, "none", ACCENT, 3)
    label(p, 36, 429, "E survives", 29)
    dot(p, 542, 419, 18, ACCENT, BG, 3)
    save("ai-balloon-collisions.svg", p)


def validate_ids():
    ids = []
    for name in GENERATED:
        root = ET.parse(OUT/name).getroot()
        own = {element.attrib["id"] for element in root.iter() if "id" in element.attrib}
        assert all(ref in own for ref in root.attrib["aria-labelledby"].split())
        ids.extend(own)
        assert all("href" not in key for element in root.iter() for key in element.attrib)
    assert len(ids) == len(set(ids)), "All inline figure IDs must be unique"


if __name__ == "__main__":
    word_overlaps()
    word_potentials()
    pattern_overlaps()
    particle_wakeup()
    sleeper_dependence()
    random_release()
    clusters()
    coupon_clocks()
    balloon_collisions()
    validate_ids()
    print("Generated nine theme-aware SVG illustrations; exact finite examples and unique inline IDs checked.")
