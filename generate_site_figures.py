"""Reproducibly generate raster figures used by the redesigned website."""

from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
from PIL import Image


OUT = Path(__file__).with_name("math_images")


def random_walk_source() -> None:
    """Make a binned occupation map while retaining the exact starting pixel."""
    rng = np.random.default_rng(20260808)
    steps = 4_000_000
    directions = rng.integers(0, 4, size=steps, dtype=np.int8)
    dx = (directions == 0).astype(np.int32) - (directions == 1).astype(np.int32)
    dy = (directions == 2).astype(np.int32) - (directions == 3).astype(np.int32)
    x = np.empty(steps + 1, dtype=np.int32)
    y = np.empty(steps + 1, dtype=np.int32)
    x[0] = y[0] = 0
    np.cumsum(dx, out=x[1:])
    np.cumsum(dy, out=y[1:])

    pad = 24
    xmin, xmax = int(x.min()) - pad, int(x.max()) + pad
    ymin, ymax = int(y.min()) - pad, int(y.max()) + pad
    width = 1180
    height = max(720, round(width * (ymax - ymin) / (xmax - xmin)))
    height = min(height, 900)
    hist, _, _ = np.histogram2d(
        y,
        x,
        bins=(height, width),
        range=((ymin, ymax), (xmin, xmax)),
    )
    intensity = np.log1p(hist)
    positive = intensity[intensity > 0]
    floor = np.quantile(positive, 0.08)
    ceiling = np.quantile(positive, 0.997)

    fig = plt.figure(figsize=(11.8, height / 100), dpi=160, facecolor="#100735")
    ax = fig.add_axes((0, 0, 1, 1))
    ax.imshow(
        intensity,
        origin="lower",
        cmap="magma",
        vmin=floor,
        vmax=ceiling,
        interpolation="bilinear",
        aspect="auto",
    )
    ax.set_axis_off()
    path = OUT / "random_walk_source.webp"
    fig.savefig(path, format="webp", dpi=160, facecolor="#100735")
    plt.close(fig)

    star_x = 100 * (0 - xmin) / (xmax - xmin)
    star_y = 100 * (ymax - 0) / (ymax - ymin)
    print(f"random_walk_source.webp start: left={star_x:.3f}% top={star_y:.3f}%")


def _monochromatic_square_scores(grid: np.ndarray) -> np.ndarray:
    """Count affected monochromatic 2x2 squares for each possible color."""
    right = np.roll(grid, -1, axis=1)
    left = np.roll(grid, 1, axis=1)
    down = np.roll(grid, -1, axis=0)
    up = np.roll(grid, 1, axis=0)
    down_right = np.roll(down, -1, axis=1)
    down_left = np.roll(down, 1, axis=1)
    up_right = np.roll(up, -1, axis=1)
    up_left = np.roll(up, 1, axis=1)
    scores = np.empty((*grid.shape, 3), dtype=np.int8)
    for color in range(3):
        affected_blocks = (
            (right == color) & (down == color) & (down_right == color),
            (up == color) & (up_right == color) & (right == color),
            (left == color) & (down_left == color) & (down == color),
            (up_left == color) & (up == color) & (left == color),
        )
        scores[..., color] = np.sum(affected_blocks, axis=0, dtype=np.int8)
    return scores


def _sample_monochromatic_squares(
    size: int,
    beta: float,
    seed: int,
    sweeps: int,
) -> np.ndarray:
    """Four-sublattice heat-bath sampler for weighted 3-color configurations."""
    rng = np.random.default_rng(seed)
    grid = rng.integers(0, 3, size=(size, size), dtype=np.int8)
    parity_classes = [(0, 0), (0, 1), (1, 0), (1, 1)]

    for sweep in range(sweeps):
        # Annealing is only an aesthetic accelerator for the strongly ordered panel.
        current_beta = beta
        if beta > 1:
            current_beta = 0.35 + (beta - 0.35) * min(1, sweep / (0.72 * sweeps))
        rng.shuffle(parity_classes)
        for row_parity, column_parity in parity_classes:
            scores = _monochromatic_square_scores(grid)[
                row_parity::2,
                column_parity::2,
            ]
            weights = np.exp(current_beta * scores)
            uniforms = rng.random(scores.shape[:2]) * weights.sum(axis=2)
            choices = (uniforms > weights[..., 0]).astype(np.int8)
            choices += (uniforms > weights[..., :2].sum(axis=2)).astype(np.int8)
            grid[row_parity::2, column_parity::2] = choices
    return grid


def monochromatic_square_triptych() -> None:
    """Generate three clean phases without plotting-library margins or gutters."""
    size = 210
    scale = 3
    specifications = [
        (-1.4, 2026081301, 170),
        (1.0, 2026081302, 320),
        (2.35, 2026081303, 620),
    ]
    colors = np.array(
        [
            [176, 47, 73],
            [38, 170, 105],
            [29, 86, 157],
        ],
        dtype=np.uint8,
    )
    panels = []
    for beta, seed, sweeps in specifications:
        grid = _sample_monochromatic_squares(size, beta, seed, sweeps)
        panel = Image.fromarray(colors[grid], mode="RGB")
        panels.append(
            panel.resize(
                (size * scale, size * scale),
                resample=Image.Resampling.NEAREST,
            )
        )

    separator = 5
    width = len(panels) * size * scale + (len(panels) - 1) * separator
    triptych = Image.new("RGB", (width, size * scale), color=(10, 20, 26))
    x = 0
    for panel in panels:
        triptych.paste(panel, (x, 0))
        x += panel.width + separator
    triptych.save(OUT / "monosquares_v2.webp", "WEBP", quality=95, method=6)


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    random_walk_source()
    monochromatic_square_triptych()
