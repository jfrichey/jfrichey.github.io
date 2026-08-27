#!/usr/bin/env python3
"""Generate the larger stochastic figures used by the redesigned website."""

from __future__ import annotations

import argparse
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
# Two families of 2D Gibbs fields: a soft 2 x 2 interaction and a hard
# 1 x 3-strip SFT with an external field.
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
    filenames = (
        "sft_phase_beta_neg1.webp",
        "sft_phase_beta_1_25.webp",
        "sft_phase_beta_3.webp",
    )
    for (beta, seed, schedule), filename in zip(specs, filenames, strict=True):
        grid = sample_sft_phase((rows, cols), beta, seed, schedule)
        panel = Image.fromarray(palette[grid], "RGB")
        panel.save(OUT / filename, "WEBP", quality=96, method=6)


def strip_candidate_valid(grid: np.ndarray, color: int) -> np.ndarray:
    """Whether assigning ``color`` avoids a 111 strip at each site."""
    if color == 0:
        return np.ones(grid.shape, dtype=bool)
    left_1 = np.roll(grid, 1, axis=1)
    left_2 = np.roll(grid, 2, axis=1)
    right_1 = np.roll(grid, -1, axis=1)
    right_2 = np.roll(grid, -2, axis=1)
    up_1 = np.roll(grid, 1, axis=0)
    up_2 = np.roll(grid, 2, axis=0)
    down_1 = np.roll(grid, -1, axis=0)
    down_2 = np.roll(grid, -2, axis=0)
    invalid = (
        ((left_2 == 1) & (left_1 == 1))
        | ((left_1 == 1) & (right_1 == 1))
        | ((right_1 == 1) & (right_2 == 1))
        | ((up_2 == 1) & (up_1 == 1))
        | ((up_1 == 1) & (down_1 == 1))
        | ((down_1 == 1) & (down_2 == 1))
    )
    return ~invalid


def strip_gibbs_sweep(grid: np.ndarray, beta: float, rng: np.random.Generator) -> None:
    """Heat-bath sweep for exp(beta * number of ones) on the strip SFT."""
    rows, cols = np.indices(grid.shape)
    one_weight = np.exp(beta)
    # A 3 x 3 sublattice decomposition makes simultaneous updates independent:
    # no two sites in a mask belong to the same horizontal or vertical 1 x 3 strip.
    for row_class in range(3):
        for col_class in range(3):
            valid_zero = strip_candidate_valid(grid, 0)
            valid_one = strip_candidate_valid(grid, 1)
            weight_zero = valid_zero.astype(np.float32)
            weight_one = one_weight * valid_one.astype(np.float32)
            probability_one = weight_one / np.maximum(weight_zero + weight_one, 1e-12)
            mask = ((rows % 3) == row_class) & ((cols % 3) == col_class)
            grid[mask] = (rng.random(grid.shape)[mask] < probability_one[mask]).astype(np.uint8)


def sample_strip_sft(
    beta: float,
    seed: int,
    schedule: list[tuple[float, int]],
    side: int = 216,
) -> np.ndarray:
    # ``side`` is divisible by 3, which keeps the sublattice updates independent
    # across the torus seam.  The all-zero state is valid and not frozen under
    # the single-site heat bath.
    grid = np.zeros((side, side), dtype=np.uint8)
    rng = np.random.default_rng(seed)
    for current_beta, sweeps in schedule:
        for _ in range(sweeps):
            strip_gibbs_sweep(grid, current_beta, rng)
    if not schedule or schedule[-1][0] != beta:
        for _ in range(120):
            strip_gibbs_sweep(grid, beta, rng)
    return grid


def generate_sft_strips() -> None:
    specs = [
        (-1.0, 51131, [(-0.25, 70), (-0.6, 90), (-1.0, 240)]),
        (1.25, 61843, [(0.25, 70), (0.65, 90), (1.0, 120), (1.25, 240)]),
        (3.0, 72901, [(0.35, 60), (0.8, 80), (1.4, 100), (2.1, 140), (3.0, 260)]),
    ]
    palette = np.asarray(
        [
            [48, 67, 91],    # deep slate blue
            [232, 184, 103], # muted gold
        ],
        dtype=np.uint8,
    )
    filenames = (
        "sft_strips_beta_neg1.webp",
        "sft_strips_beta_1_25.webp",
        "sft_strips_beta_3.webp",
    )
    for (beta, seed, schedule), filename in zip(specs, filenames, strict=True):
        grid = sample_strip_sft(beta, seed, schedule)
        panel = Image.fromarray(palette[grid], "RGB").resize((648, 648), Image.Resampling.NEAREST)
        panel = panel.crop((4, 4, 644, 644))
        panel.save(OUT / filename, "WEBP", quality=96, method=6)


# ---------------------------------------------------------------------------
# Repeated Voronoi elimination in the square and disk.
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


def points_in_disk(count: int, rng: np.random.Generator) -> np.ndarray:
    radii = np.sqrt(rng.random(count))
    angles = rng.uniform(0, 2 * np.pi, count)
    return np.column_stack((radii * np.cos(angles), radii * np.sin(angles)))


def disk_voters(side: int) -> np.ndarray:
    axis = -1 + (np.arange(side) + 0.5) * 2 / side
    xx, yy = np.meshgrid(axis, axis)
    mask = xx**2 + yy**2 <= 1
    return np.column_stack((xx[mask], yy[mask]))


def eliminate_unstructured(
    points: np.ndarray,
    voters: np.ndarray,
    capture_counts: set[int] | None = None,
) -> tuple[int, dict[int, np.ndarray]]:
    active = np.arange(len(points), dtype=np.int32)
    captures: dict[int, np.ndarray] = {}
    while len(active) > 1:
        owners = cKDTree(points[active]).query(voters, k=1)[1]
        if capture_counts and len(active) in capture_counts:
            captures[len(active)] = active.copy()
        counts = np.bincount(owners, minlength=len(active))
        smallest = int(np.flatnonzero(counts == counts.min())[0])
        active = np.delete(active, smallest)
    if capture_counts and 1 in capture_counts:
        captures[1] = active.copy()
    return int(active[0]), captures


def disk_candidate_colors(points: np.ndarray) -> np.ndarray:
    normalized = points / 2 + 0.5
    return candidate_colors(normalized)


def render_disk_voronoi_frame(
    points: np.ndarray,
    colors: np.ndarray,
    active: np.ndarray,
    count: int,
) -> Image.Image:
    width, height = 900, 675
    disk_side = 630
    left, top = (width - disk_side) // 2, (height - disk_side) // 2
    background = np.array([15, 18, 29], dtype=np.uint8)
    rgb = np.broadcast_to(background, (disk_side, disk_side, 3)).copy()

    axis = -1 + (np.arange(disk_side) + 0.5) * 2 / disk_side
    xx, yy = np.meshgrid(axis, axis)
    inside = xx**2 + yy**2 <= 1
    render_voters = np.column_stack((xx[inside], yy[inside]))
    owners_flat = cKDTree(points[active]).query(render_voters, k=1)[1]
    owners = np.full((disk_side, disk_side), -1, dtype=np.int32)
    owners[inside] = owners_flat
    rgb[inside] = colors[active][owners_flat]

    boundary = np.zeros(owners.shape, dtype=bool)
    horizontal = (owners[:, 1:] != owners[:, :-1]) & (owners[:, 1:] >= 0) & (owners[:, :-1] >= 0)
    vertical = (owners[1:, :] != owners[:-1, :]) & (owners[1:, :] >= 0) & (owners[:-1, :] >= 0)
    boundary[:, 1:] |= horizontal
    boundary[:, :-1] |= horizontal
    boundary[1:, :] |= vertical
    boundary[:-1, :] |= vertical
    rgb[boundary] = np.array([241, 237, 227], dtype=np.uint8)

    image = Image.new("RGB", (width, height), tuple(background))
    image.paste(Image.fromarray(rgb, "RGB"), (left, top))
    draw = ImageDraw.Draw(image, "RGBA")
    draw.ellipse((left, top, left + disk_side - 1, top + disk_side - 1), outline=(255, 255, 255, 125), width=2)
    point_radius = 1 if count > 350 else 2 if count > 80 else 4 if count > 15 else 7
    for point in points[active]:
        x = left + int((point[0] + 1) * 0.5 * (disk_side - 1))
        y = top + int((point[1] + 1) * 0.5 * (disk_side - 1))
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


def one_disk_voronoi_movie(seed: int = 448199) -> None:
    rng = np.random.default_rng(seed)
    points = points_in_disk(700, rng)
    colors = disk_candidate_colors(points)
    captures_wanted = {700, 520, 380, 270, 180, 110, 65, 35, 18, 9, 4, 2, 1}
    _, captures = eliminate_unstructured(points, disk_voters(72), captures_wanted)
    frames = []
    durations = []
    for count in sorted(captures, reverse=True):
        frames.append(render_disk_voronoi_frame(points, colors, captures[count], count))
        durations.append(950 if count in (700, 1) else 520)
    frames[0].save(
        OUT / "voronoi_disk_runoff.webp",
        "WEBP",
        save_all=True,
        append_images=frames[1:],
        duration=durations,
        loop=0,
        quality=88,
        method=6,
    )


def disk_winner_distribution(trials: int = 1200, candidates: int = 120) -> None:
    voters = disk_voters(58)
    winners = np.empty((trials, 2), dtype=np.float64)
    for trial in range(trials):
        rng = np.random.default_rng(170411 + 7919 * trial)
        points = points_in_disk(candidates, rng)
        winner, _ = eliminate_unstructured(points, voters)
        winners[trial] = points[winner]

    bins = 84
    histogram, _, _ = np.histogram2d(
        winners[:, 1],
        winners[:, 0],
        bins=(bins, bins),
        range=((-1, 1), (-1, 1)),
    )
    density = gaussian_filter(histogram, sigma=3.1, mode="constant")
    axis = -1 + (np.arange(bins) + 0.5) * 2 / bins
    xx, yy = np.meshgrid(axis, axis)
    inside = xx**2 + yy**2 <= 1
    density[~inside] = 0
    density /= max(density[inside].max(), 1e-9)
    density = density**0.68
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
    rgb[~inside] = np.array([15, 18, 29], dtype=np.uint8)
    disk_side = 630
    disk = Image.fromarray(rgb, "RGB").resize((disk_side, disk_side), Image.Resampling.BICUBIC)
    width, height = 900, 675
    left, top = (width - disk_side) // 2, (height - disk_side) // 2
    image = Image.new("RGB", (width, height), (15, 18, 29))
    mask = Image.new("L", (disk_side, disk_side), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, disk_side - 1, disk_side - 1), fill=255)
    image.paste(disk, (left, top), mask)
    draw = ImageDraw.Draw(image, "RGBA")
    draw.ellipse((left, top, left + disk_side - 1, top + disk_side - 1), outline=(255, 255, 255, 125), width=2)
    draw.rounded_rectangle((21, 19, 316, 67), radius=8, fill=(12, 15, 22, 205))
    draw.text(
        (37, 31),
        f"winner density - {trials} games",
        font=font(21, True),
        fill=(255, 255, 255, 240),
    )
    image.save(OUT / "voronoi_disk_winner_heatmap.webp", "WEBP", quality=94, method=6)


def generate_voronoi_disk() -> None:
    one_disk_voronoi_movie()
    disk_winner_distribution()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "targets",
        nargs="*",
        choices=("sft", "sft-strips", "voronoi", "voronoi-disk"),
    )
    args = parser.parse_args()
    targets = set(args.targets or ("sft", "sft-strips", "voronoi", "voronoi-disk"))
    OUT.mkdir(parents=True, exist_ok=True)
    if "sft" in targets:
        generate_sft()
    if "sft-strips" in targets:
        generate_sft_strips()
    if "voronoi" in targets:
        generate_voronoi()
    if "voronoi-disk" in targets:
        generate_voronoi_disk()


if __name__ == "__main__":
    main()
