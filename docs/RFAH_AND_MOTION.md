# Typography, motion, and the RfaH viewer

The site uses locally hosted variable WOFF2 fonts: Manrope for body copy and
Space Grotesk for headings and navigation. Together, the Latin subsets are
46,756 bytes before transfer compression. `next/font/local` handles preloading,
`font-display: swap`, and a metric-adjusted Arial fallback. The font licenses
and source URLs are under `public/fonts/`. No visitor font requests go to Google.

There is no font that independently improves search rankings. This setup focuses
on readable HTML, early text rendering, limited font downloads, and reduced font
layout movement. The existing metadata, canonical links, headings, and sitemap
remain in place. Fonts may fall back to system glyphs for characters outside the
Latin subset. Short essay quotations and the document cover retain serif styling.

## RfaH: real structures, separate states

The homepage displays experimental coordinates from these depositions:

| State | Entry and method | Displayed selection |
| --- | --- | --- |
| α-helical hairpin | [2OUG](https://www.rcsb.org/structure/2OUG), X-ray diffraction, 2.10 Å | Chain A, residues 115–156 |
| β-barrel | [2LCL](https://www.rcsb.org/structure/2LCL), solution NMR | Chain A, residues 115–162, model 1 of 20 |

The α state is cropped from full-length RfaH; the β state is the isolated
C-terminal domain. Unresolved crystal residues are omitted, not fabricated.
The common 42-residue sequence matches between the two selections. The β view
retains residues 159–161, which form the fifth strand. The first deposited NMR
model is one representative of an ensemble, not a claim of a unique conformation.
See [Burmann et al., Cell (2012)](https://doi.org/10.1016/j.cell.2012.05.042).

`public/structures/rfah/` contains chain/domain excerpts with the original ATOM
coordinates and the relevant HELIX/SHEET records. Hydrogens and unrelated chains
are omitted. `data/rfah.json` records source and excerpt checksums, residue IDs,
Cα coordinates, and provenance for the static preview. To regenerate from the
original RCSB downloads:

```sh
python3 scripts/build_rfah.py --source-dir /path/to/original-pdb-files
```

The state buttons change between experimental structures. They do not interpolate
atom positions or depict a folding trajectory. The viewer supports dragging,
zoom controls, keyboard-operable rotation buttons, reset, and pause. Rotation
stops when the figure leaves the viewport, the tab is hidden, or reduced motion
is enabled. The figure does not automatically alternate between states.

A pinned, locally hosted [3Dmol.js](https://github.com/3dmol/3Dmol.js) 3.0.0 build
renders the cartoon. Its BSD and bundled notices are in
`public/vendor/3dmol/LICENSE.txt`; package provenance is in `source.json`. It loads
only when the homepage figure enters the viewport, after the initial text paint.
Structure data are fetched from this website. No external viewer service is used.
The library is approximately 580 KB, or 168 KB with gzip; it is absent from the
main Next.js JavaScript bundle and other pages do not request it.

If JavaScript, WebGL, or the viewer library is unavailable, a server-rendered
backbone preview and the scientific explanation remain visible. The static
preview is an orthographic projection of deposited Cα coordinates. It is
labeled separately from the 3D cartoon.

## Motion

Page entrances use a depth-and-blur transition and a light sweep. The homepage
headline enters in staggered lines; scroll reveals include depth and a small
overshoot. Desktop cards use a pointer-following highlight and limited tilt.
Buttons have a light sweep on hover or keyboard focus. Reading progress remains
available on article pages.

Animations do not delay navigation, hide the server-rendered reading content,
or use scroll hijacking. Touch devices get normal scrolling outside the viewer.
Reduced-motion settings disable the decorative CSS and JavaScript effects,
including auto-rotation, and are respected when changed while a page is open.

Primary implementation references:
- [Next.js font loading](https://nextjs.org/docs/pages/getting-started/fonts)
- [Google font performance guidance](https://web.dev/articles/font-best-practices)
- [3Dmol.js source and documentation](https://github.com/3dmol/3Dmol.js)
