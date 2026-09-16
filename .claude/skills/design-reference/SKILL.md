---
name: design-reference
description: >-
  The workshop mentor's design for the features the starter doesn't ship yet,
  extracted to greppable source under `.context/docs/design/`. Read it before
  building any UI: to find every surface a feature touches, to read a
  component's spec and states, or to shape fixtures.
---

# design-reference

Reference we implement against, provided by workshop autho. Screens live in
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
and tokens leave a layout question open, ask for a look at the mentor's
`DevDigest_design.html`, which the user keeps outside the repo.

## Tokens transcribe

`tokens.css` and `client/src/vendor/ui/styles.css` hold identical values, so an
artboard's `var(--crit)` is already the app's `var(--crit)`. Copy them straight
across, and read `client/src/vendor/ui/README.md` before editing the kit.

## The numbering is the author's

Screen banners carry **N1–N13**, the author's own feature numbering. It maps to
no lesson in `README.md`'s L01–L08 list. Ask which artboard a lesson means.

## Regenerating

This directory **is** the repo's copy of the design; the mentor's
`DevDigest_design.html` lives on the user's machine. Re-extraction therefore
needs a path to it:

```sh
node .context/docs/design/extract.mjs ~/path/to/DevDigest_design.html
```

`index.json` fingerprints the bundle it came from (size and md5), so a differing
copy is detectable. Fix an extraction problem in `extract.mjs` and re-run rather
than editing the generated tree.
