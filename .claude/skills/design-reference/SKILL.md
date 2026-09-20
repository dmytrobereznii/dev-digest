---
name: design-reference
description: >-
  The workshop mentor's design for the features the starter doesn't ship yet,
  extracted to greppable source under `.context/docs/design/`. Read it before
  building any UI: to find every surface a feature touches, to read a
  component's spec and states, or to shape fixtures.
---

# design-reference

Reference we implement against, provided by the workshop author. Screens live in
`.context/docs/design/src/*.jsx`, tokens in `tokens.css`.

## Find every surface

Run both greps. The component grep alone is the trap:

```sh
cd .context/docs/design/src
grep -rln 'CostBadge' .        # the shared component
grep -rlin 'cost' .            # every other way the feature is drawn
```

For cost that is 4 surfaces against 11 — `screen_agents.jsx`, `components2.jsx`
and `screen_multiagent.jsx` all render cost without touching the badge. Discount
`primitives.jsx` from either count; it defines the component rather than using
it. Finish when every surface is accounted for, the bespoke ones included, and
say how many you found.

`data.jsx` and `data2.jsx` match most greps and are **fixtures**, not surfaces:
mock agents, eval cases, traces, CI runs, perf stats. Mine them for prop shapes
and seed data.

## Read the module

`head -1 src/*.jsx` prints every banner — filename plus what the module is.
Screens are `screen_*.jsx`; the rest is the shared kit.

Modules are transpiled to `React.createElement`. Legible to read, not runnable,
and nothing here renders — React and Babel are not in the repo. When structure
and tokens leave a layout question open, ask for a look at the mentor's HTML
bundle, which the user keeps outside the repo.

The shared kit is not only the non-`screen_` files: `screen_skills.jsx` defines
`CodeEditor` and exports it on `window`, and `screen_conv_conf.jsx` uses it. A
component can live in a screen module — grep for the name, not the filename.

## Tokens transcribe

`tokens.css` and `client/src/vendor/ui/styles.css` hold identical values, so an
artboard's `var(--crit)` is already the app's `var(--crit)`. Copy them straight
across, and read `client/src/vendor/ui/README.md` before editing the kit.

## The numbering is the author's

Screen banners carry **N1–N13**, the author's own feature numbering. It maps to
no lesson in `README.md`'s L01–L08 list. Ask which artboard a lesson means.

Not every screen has a number — Skills Lab, Repo Dashboard, Memory, the
onboarding wizard and PR Detail are unnumbered. `canvas/canvas.jsx` is the map
that settles it: it lists every section and artboard with the props each one is
rendered at, so a screen module with no artboard there is design the author has
not placed on the canvas.

## Regenerating

This directory **is** the repo's copy of the design; the mentor's HTML bundle
lives on the user's machine and never in the repo. Re-extraction needs a path
to it:

```sh
node .context/docs/design/extract.mjs ~/Documents/devdigest-design/designs_with_skills.html
```

`index.json` fingerprints the bundle it came from (name, size and md5), so a
newer copy is detectable — the current tree came from
`designs_with_skills.html` (1,809,188 B, md5 `06bfb6e3…`), extracted
2026-09-20. Re-extracting a new bundle rewrites `template.html` wholesale (the
loader re-issues every asset UUID); only
`src/`, `canvas/canvas.jsx` and `tokens.css` carry design meaning. Fix an
extraction problem in `extract.mjs` and re-run rather than editing the
generated tree.
