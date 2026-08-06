"""Reproducibly generate raster figures used by the redesigned website."""

from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np


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


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    random_walk_source()
