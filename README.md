# Website source

The redesigned website is live from the `master` branch. The
`research-redesign` branch remains the working branch for follow-up changes.
The former site is recoverable from Git history at commit `6a0090e`.

## Canonical pages

- `index.html` — homepage
- `research.html` — research page
- `teaching.html` — teaching page
- `bridge.html` — bridge

Shared presentation and behavior live in `style.css` and `site.js`. Edit these
canonical files directly; Git history preserves earlier versions, so versioned
copies such as `research-v2.html` are unnecessary.

## Responsive breakpoints

- Above `1080px`, the homepage and research page use pane-by-pane scrolling.
- At `1080px` and below, sections stack and use normal document scrolling.
- At `720px` and below, the compact menu, phone-sized type, full-width figures,
  and static ARW fallbacks are enabled. These values are near the bottom of
  `style.css` if you want to tune them.

Site images live in `math_images/`. Their reproducible generators live in
`tools/`:

- `generate_arw_animation.js` — three-regime ARW animation
- `generate_arw_hockey.js` — driven-dissipative density animation
- `generate_soc_stills.js` — homepage avalanche triptych
- `generate_visual_assets.py` — both SFT sample families and the square/disk Voronoi figures
