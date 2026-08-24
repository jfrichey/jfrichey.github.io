#!/usr/bin/env python3
"""Generate the larger stochastic figures used by the redesigned website."""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy.ndimage import gaussian_filter
from scipy.spatial import cKDTree


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "math_images"


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    name = "DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf"
    try:
        return ImageFont.truetype(name, size)
    except OSError:
        return ImageFont.load_default()


def colorize(values: np.ndarray, stops: list[tuple[int, int, int]]) -> np.ndarray:
    values = np.clip(values, 0.0, 1.0)
    scaled = values * (len(stops) - 1)
    low = np.floor(scaled).astype(np.int16)
    high = np.minimum(low + 1, len(stops) - 1)
    blend = (scaled - low)[..., None]
    palette = np.asarray(stops, dtype=np.float32)
    return np.rint(palette[low] * (1 - blend) + palette[high] * blend).astype(np.uint8)


# ---------------------------------------------------------------------------
# Three regimes of a 2D Gibbs field weighted by monochromatic 2 x 2 squares.
# ---------------------------------------------------------------------------


def candidate_mono_counts(grid: np.ndarray, color: int) -> np.ndarray:
    down = np.roll(grid, -1, axis=0)
    up = np.roll(grid, 1, axis=0)
    right = np.roll(grid, -1, axis=1)
    left = np.roll(grid, 1, axis=1)
    down_right = np.roll(down, -1, axis=1)
    down_left = np.roll(down, 1, axis=1)
    up_right = np.roll(up, -1, axis=1)
    up_left = np.roll(up, 1, axis=1)
    top_left = ((down == color) & (right == color) & (down_right == color)).astype(np.uint8)
    top_right = ((down == color) & (left == color) & (down_left == color)).astype(np.uint8)
    bottom_left = ((up == color) & (right == color) & (up_right == color)).astype(np.uint8)
    bottom_right = ((up == color) & (left == color) & (up_left == color)).astype(np.uint8)
    return top_left + top_right + bottom_left + bottom_right


def gibbs_sweep(grid: np.ndarray, beta: float, rng: np.random.Generator) -> None:
    rows, cols = np.indices(grid.shape)
    for row_parity in (0, 1):
        for col_parity in (0, 1):
            counts = np.stack([candidate_mono_counts(grid, c) for c in range(3)])
            weights = np.exp(beta * counts.astype(np.float32))
            weights /= weights.sum(axis=0, keepdims=True)
            draw = rng.random(grid.shape)
            new_color = (draw > weights[0]).astype(np.uint8)
            new_color += (draw > weights[0] + weights[1]).astype(np.uint8)
            mask = ((rows & 1) == row_parity) & ((cols & 1) == col_parity)
            grid[mask] = new_color[mask]


def sample_sft_phase(
    shape: tuple[int, int],
    beta: float,
    seed: int,
    schedule: list[tuple[float, int]],
) -> np.ndarray:
    rng = np.random.default_rng(seed)
    grid = rng.integers(0, 3, size=shape, dtype=np.uint8)
    for current_beta, sweeps in schedule:
        for _ in range(sweeps):
            gibbs_sweep(grid, current_beta, rng)
    if not schedule or schedule[-1][0] != beta:
        for _ in range(100):
            gibbs_sweep(grid, beta, rng)
    return grid


def generate_sft() -> None:
    # Keep each sample genuinely square.  The page lays the three files out as
    # a horizontal triptych on wide screens and stacks them on small screens.
    rows = cols = 640
    specs = [
        (-1.0, 14011, [(-0.35, 35), (-0.7, 60), (-1.0, 210)]),
        (1.25, 24017, [(0.25, 35), (0.55, 55), (0.82, 80), (1.05, 120), (1.25, 280)]),
        (3.0, 39019, [(0.35, 30), (0.75, 50), (1.15, 80), (1.6, 110), (2.2, 150), (3.0, 230)]),
    ]
    palette = np.asarray(
        [
            [82, 98, 143],   # dusk blue
            [218, 121, 113], # muted coral
            [232, 183, 108], # sunset gold
        ],
        dtype=np.uint8,
    )
    panels = []
    filenames = (
        "sft_phase_beta_neg1.webp",
        "sft_phase_beta_1_25.webp",
        "sft_phase_beta_3.webp",
    )
    for (beta, seed, schedule), filename in zip(specs, filenames, strict=True):
        grid = sample_sft_phase((rows, cols), beta, seed, schedule)
        panel = Image.fromarray(palette[grid], "RGB")
        draw = ImageDraw.Draw(panel, "RGBA")
        label = f"β = {beta:g}"
        label_font = font(19, True)
        text_box = draw.textbbox((0, 0), label, font=label_font)
        text_width = text_box[2] - text_box[0]
        text_height = text_box[3] - text_box[1]
        pad_x, pad_y = 11, 8
        left, top = 16, 16
        right = left + text_width + 2 * pad_x
        bottom = top + text_height + 2 * pad_y
        draw.rounded_rectangle((left, top, right, bottom), radius=7, fill=(18, 24, 40, 178))
        draw.text(
            (left + pad_x, top + pad_y - text_box[1]),
            label,
            font=label_font,
            fill=(255, 255, 255, 238),
        )
        panel.save(OUT / filename, "WEBP", quality=96, method=6)
        panels.append(panel)

    combined = Image.new("RGB", (cols * 3, rows), (9, 16, 24))
    for index, panel in enumerate(panels):
        combined.paste(panel, (index * cols, 0))
    combined.save(OUT / "sft_phases_2d.webp", "WEBP", quality=96, method=6)


# ---------------------------------------------------------------------------
# Planar simple random walk occupation maps.
# ---------------------------------------------------------------------------


WALK_STOPS = [
    (7, 4, 19),
    (35, 12, 86),
    (102, 22, 127),
    (190, 48, 112),
    (241, 111, 91),
    (255, 201, 106),
    (255, 244, 186),
]


def walk_occupation(seed: int, steps: int = 4_000_000) -> tuple[Image.Image, float, float]:
    rng = np.random.default_rng(seed)
    directions = rng.integers(0, 4, size=steps, dtype=np.uint8)
    dx = np.zeros(steps, dtype=np.int8)
    dy = np.zeros(steps, dtype=np.int8)
    dx[directions == 0] = 1
    dx[directions == 1] = -1
    dy[directions == 2] = 1
    dy[directions == 3] = -1
    x = np.empty(steps + 1, dtype=np.int32)
    y = np.empty(steps + 1, dtype=np.int32)
    x[0] = y[0] = 0
    np.cumsum(dx, out=x[1:])
    np.cumsum(dy, out=y[1:])

    xmin, xmax = int(x.min()), int(x.max())
    ymin, ymax = int(y.min()), int(y.max())
    span_x = xmax - xmin + 1
    span_y = ymax - ymin + 1
    pad = max(25, int(0.055 * max(span_x, span_y)))
    xmin -= pad
    xmax += pad
    ymin -= pad
    ymax += pad

    target_ratio = 4 / 3
    width = xmax - xmin + 1
    height = ymax - ymin + 1
    if width / height < target_ratio:
        add = math.ceil(target_ratio * height - width)
        xmin -= add // 2
        xmax += add - add // 2
    else:
        add = math.ceil(width / target_ratio - height)
        ymin -= add // 2
        ymax += add - add // 2

    width = xmax - xmin + 1
    height = ymax - ymin + 1
    visits = np.zeros((height, width), dtype=np.uint32)
    np.add.at(visits, (y - ymin, x - xmin), 1)
    positive = visits[visits > 0]
    ceiling = max(2.0, float(np.quantile(np.log1p(positive), 0.997)))
    intensity = np.clip(np.log1p(visits) / ceiling, 0, 1)
    intensity = intensity ** 0.72
    rgb = colorize(intensity, WALK_STOPS)
    image = Image.fromarray(rgb, "RGB").resize((1200, 900), Image.Resampling.LANCZOS)
    source_x = (0 - xmin) / max(1, width - 1)
    source_y = (0 - ymin) / max(1, height - 1)
    return image, source_x, source_y


def generate_walks() -> None:
    samples = []
    for index, seed in enumerate((48391, 77101, 126181), start=2):
        image, source_x, source_y = walk_occupation(seed)
        name = f"random_walk_source_{index}.webp"
        image.save(OUT / name, "WEBP", quality=94, method=6)
        samples.append(
            {
                "src": f"math_images/{name}",
                "x": round(100 * source_x, 4),
                "y": round(100 * source_y, 4),
            }
        )
    (OUT / "random_walk_samples.json").write_text(json.dumps(samples, indent=2) + "\n")


# ---------------------------------------------------------------------------
# Repeated Voronoi elimination in the square.
# ---------------------------------------------------------------------------


def voter_grid(width: int, height: int) -> np.ndarray:
    x = (np.arange(width) + 0.5) / width
    y = (np.arange(height) + 0.5) / height
    xx, yy = np.meshgrid(x, y)
    return np.column_stack((xx.ravel(), yy.ravel()))


def candidate_colors(points: np.ndarray) -> np.ndarray:
    angle = (np.arctan2(points[:, 1] - 0.5, points[:, 0] - 0.5) / (2 * np.pi) + 1) % 1
    radius = np.clip(np.linalg.norm(points - 0.5, axis=1) / 0.72, 0, 1)
    hue = (0.54 + 0.43 * angle) % 1
    saturation = 0.34 + 0.33 * radius
    value = 0.76 + 0.14 * (1 - radius)
    h6 = hue * 6
    sector = np.floor(h6).astype(int)
    fraction = h6 - sector
    p = value * (1 - saturation)
    q = value * (1 - saturation * fraction)
    t = value * (1 - saturation * (1 - fraction))
    choices = np.stack(
        [
            np.column_stack((value, t, p)),
            np.column_stack((q, value, p)),
            np.column_stack((p, value, t)),
            np.column_stack((p, q, value)),
            np.column_stack((t, p, value)),
            np.column_stack((value, p, q)),
        ]
    )
    return np.rint(255 * choices[sector, np.arange(len(points))]).astype(np.uint8)


def eliminate(
    points: np.ndarray,
    grid_points: np.ndarray,
    grid_shape: tuple[int, int],
    capture_counts: set[int] | None = None,
) -> tuple[int, dict[int, tuple[np.ndarray, np.ndarray]]]:
    active = np.arange(len(points), dtype=np.int32)
    captures: dict[int, tuple[np.ndarray, np.ndarray]] = {}
    while len(active) > 1:
        owners = cKDTree(points[active]).query(grid_points, k=1)[1]
        if capture_counts and len(active) in capture_counts:
            captures[len(active)] = (active.copy(), owners.reshape(grid_shape).copy())
        counts = np.bincount(owners, minlength=len(active))
        smallest = int(np.flatnonzero(counts == counts.min())[0])
        active = np.delete(active, smallest)
    if capture_counts and 1 in capture_counts:
        captures[1] = (
            active.copy(),
            np.zeros(grid_shape, dtype=np.int32),
        )
    return int(active[0]), captures


def render_voronoi_frame(
    points: np.ndarray,
    colors: np.ndarray,
    active: np.ndarray,
    owners: np.ndarray,
    count: int,
) -> Image.Image:
    # Render the tessellation at its final display resolution.  Earlier
    # versions enlarged a 200 x 150 ownership grid with nearest-neighbor
    # sampling, which made the boundaries look needlessly stair-stepped.
    rgb = colors[active][owners].copy()
    boundary = np.zeros(owners.shape, dtype=bool)
    horizontal = owners[:, 1:] != owners[:, :-1]
    vertical = owners[1:, :] != owners[:-1, :]
    boundary[:, 1:] |= horizontal
    boundary[:, :-1] |= horizontal
    boundary[1:, :] |= vertical
    boundary[:-1, :] |= vertical
    rgb[boundary] = np.array([241, 237, 227], dtype=np.uint8)
    image = Image.fromarray(rgb, "RGB")
    draw = ImageDraw.Draw(image, "RGBA")
    point_radius = 1 if count > 450 else 2 if count > 90 else 4 if count > 15 else 7
    for point in points[active]:
        x = int(point[0] * image.width)
        y = int(point[1] * image.height)
        draw.ellipse(
            (x - point_radius, y - point_radius, x + point_radius, y + point_radius),
            fill=(23, 26, 34, 225),
            outline=(255, 253, 246, 220),
            width=1,
        )
    label = f"{count:,} candidate" + ("s" if count != 1 else "")
    draw.rounded_rectangle((21, 19, 242, 67), radius=8, fill=(12, 15, 22, 205))
    draw.text((37, 31), label, font=font(22, True), fill=(255, 255, 255, 240))
    return image


def one_voronoi_movie(seed: int = 115249) -> None:
    rng = np.random.default_rng(seed)
    points = rng.random((1000, 2))
    colors = candidate_colors(points)
    grid_width, grid_height = 200, 150
    captures_wanted = {1000, 760, 560, 400, 280, 190, 120, 70, 38, 20, 10, 5, 2, 1}
    _, captures = eliminate(
        points,
        voter_grid(grid_width, grid_height),
        (grid_height, grid_width),
        captures_wanted,
    )
    render_width, render_height = 900, 675
    render_voters = voter_grid(render_width, render_height)
    frames = []
    durations = []
    for count in sorted(captures, reverse=True):
        active, _ = captures[count]
        owners = cKDTree(points[active]).query(render_voters, k=1)[1]
        owners = owners.reshape((render_height, render_width))
        frames.append(render_voronoi_frame(points, colors, active, owners, count))
        durations.append(950 if count in (1000, 1) else 520)
    frames[0].save(
        OUT / "voronoi_runoff.webp",
        "WEBP",
        save_all=True,
        append_images=frames[1:],
        duration=durations,
        loop=0,
        quality=88,
        method=6,
    )


def winner_distribution(trials: int = 1200, candidates: int = 120) -> None:
    grid_width, grid_height = 60, 45
    voters = voter_grid(grid_width, grid_height)
    winners = np.empty((trials, 2), dtype=np.float64)
    for trial in range(trials):
        rng = np.random.default_rng(93107 + 7919 * trial)
        points = rng.random((candidates, 2))
        winner, _ = eliminate(points, voters, (grid_height, grid_width))
        winners[trial] = points[winner]

    histogram, _, _ = np.histogram2d(
        winners[:, 1],
        winners[:, 0],
        bins=(54, 72),
        range=((0, 1), (0, 1)),
    )
    density = gaussian_filter(histogram, sigma=3.1, mode="reflect")
    density /= max(density.max(), 1e-9)
    density = density ** 0.68
    rgb = colorize(
        density,
        [
            (15, 18, 29),
            (35, 47, 85),
            (79, 62, 125),
            (159, 70, 113),
            (228, 107, 82),
            (255, 202, 111),
            (255, 244, 198),
        ],
    )
    image = Image.fromarray(rgb, "RGB").resize((900, 675), Image.Resampling.BICUBIC)
    draw = ImageDraw.Draw(image, "RGBA")
    draw.rectangle((1, 1, 898, 673), outline=(255, 255, 255, 100), width=2)
    draw.rounded_rectangle((21, 19, 316, 67), radius=8, fill=(12, 15, 22, 205))
    draw.text(
        (37, 31),
        f"winner density - {trials} games",
        font=font(21, True),
        fill=(255, 255, 255, 240),
    )
    image.save(OUT / "voronoi_winner_heatmap.webp", "WEBP", quality=94, method=6)


def generate_voronoi() -> None:
    one_voronoi_movie()
    winner_distribution()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("targets", nargs="*", choices=("sft", "walks", "voronoi"))
    args = parser.parse_args()
    targets = set(args.targets or ("sft", "walks", "voronoi"))
    OUT.mkdir(parents=True, exist_ok=True)
    if "sft" in targets:
        generate_sft()
    if "walks" in targets:
        generate_walks()
    if "voronoi" in targets:
        generate_voronoi()


if __name__ == "__main__":
    main()
