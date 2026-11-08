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

## AI-generated research and themes

The ai.html page is headed AI-generated research and has five topics:
SFT, ARW, Counting clusters, Coupon collection and The balloon process.
A right-hand table of contents links to every topic and individual project;
it moves above the projects on smaller screens. Each project has a one-sentence
description and an Open main PDF link to its selected publication snapshot.
Each project has its own mathematical illustration, aligned beside its text
without creating a separate heading row. On narrow screens each figure follows
its project. A shared header toggle switches the entire website between light
and dark modes, starting in dark mode for new visitors and remembering the choice
across pages. Only the AI section uses the Matrix-green palette; the other pages
keep their established light colors and use a slate-blue dark palette.
The AI page has a Matrix-style terminal treatment with dense, irregular code
rain behind nearly opaque reading surfaces. Its heading types a small typo,
corrects it, pauses, erases and repeats every 15 seconds. Pause effects stops
both animations; reduced motion starts still. The accessible heading remains
constant and its full space is reserved to avoid layout shifts.
Local previews also carry an explicit choice in their HTML page links because
file URLs may have separate storage. The hosted pages recheck the shared setting
when restored with Back/Forward. Run node tools/test_theme.cjs for controller
regression checks; these do not replace visual browser testing.
All nine entries have reader PDFs in pagedocs/ai/. Update these deliberately
from the corresponding research masters, preserving bylines and proof status.
The current ARW monotonicity collection has 92 pages. Website PDFs are fixed
publication snapshots; editing a research master does not update them automatically.
Nine reproducible mathematical illustrations inherit the selected palette.
The AI page has no submission form. The combinatorial-processes PDF on the
main Research page remains a separate document.
Run node tools/test_theme.cjs and node tools/test_ai_effects.cjs for the
theme and animation controller checks. Preview files and local review records
are not part of this public repository.
