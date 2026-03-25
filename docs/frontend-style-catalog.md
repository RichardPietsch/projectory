# Frontend Style Catalog (Baseline + Mapping)

## Scope
This catalog covers the current high-impact renderers and token source:
- `public/theme.css`
- `public/js/views-clients.js`
- `public/js/app-admin-access.js`
- `public/js/app-projects-challenges.js`

## 1) Element catalog by screen/component

### Clients (`views-clients.js`)
- Top-level panel shell
- Table head/rows + sort buttons
- Mobile cards + stat tiles
- Action buttons (add/edit/delete)
- Muted secondary text blocks

### Admin access/configuration (`app-admin-access.js`)
- People overview table and selected row skin
- Search inputs + clear buttons
- Configuration cards, drag handles, color swatches
- Access management table/actions
- SMTP settings form controls
- Audit table and empty states
- Status badges (leaver/hidden)

### Projects/challenges (`app-projects-challenges.js`)
- Empty state shell
- Ownership overview table and mobile cards
- Role pills (owner/leader/contributor, secondary and self variants)
- Team-overview sub-panels
- Sort/select/search controls
- Additional project-detail surfaces still pending conversion

## 2) Current class-pattern frequency (baseline snapshot)

Collected with:
```bash
rg -o "(text|bg|border|ring|shadow|rounded)-[^\"'\s>]+|#[0-9a-fA-F]{3,6}" <file> | sort | uniq -c | sort -nr
```

### `public/js/views-clients.js` (top baseline)
- `text-sm` x6
- `text-muted` x3
- `text-xs` x2

### `public/js/app-admin-access.js` (top baseline)
- `text-sm` x28
- `text-xs` x24
- `rounded-full` x9
- `#64748B` x9
- `text-secondary` x7
- `text-amber-300` x4
- `text-zinc-100` x3
- `text-rose-300` x3

### `public/js/app-projects-challenges.js` (top baseline)
- `text-xs` x31
- `text-sm` x23
- `text-zinc-400` x16
- `text-zinc-100` x16
- `rounded-xl` x12
- `border-zinc-700` x10
- `bg-zinc-700` x10
- `text-blue-50` x8
- `text-zinc-300` x8

## 3) Visual-token leakage table (outside `theme.css`)

Examples requiring migration or explicit exception handling:
- Hardcoded state colors and rings in configuration swatches (e.g. `ring-[#00d8ff]`, `ring-zinc-700`).
- Role/ownership pill color bundles (`border-blue-*`, `bg-emerald-*`, `text-zinc-*`) in projects/challenges.
- Remaining `text-zinc-*`, `bg-zinc-*`, `border-zinc-*` strings in deep project-detail render paths.
- Accent hex usage (`#00d8ff`) still appears in some action controls.

## 4) Proposed semantic class map

| Old pattern family | Semantic replacement |
|---|---|
| `text-zinc-300/400/100` display tones | `ui-text-secondary`, `ui-text-muted`, `ui-section-title` |
| Table header muted text | `ui-table-head` + `ui-sort-button` |
| Common card/panel shells | `ui-panel`, `ui-panel-muted`, `ui-mobile-card` |
| Stat tiles | `ui-stat-card` |
| Selected row/interactive row | `ui-table-row`, `ui-table-row-interactive`, `ui-table-row-selected` |
| Form controls | `ui-input`, `ui-select`, `ui-textarea`, `ui-label`, `ui-help-text` |
| Action buttons | `ui-btn` + variant (`primary/secondary/danger/success/accent`) |
| Warning/muted badges | `ui-badge-warning`, `ui-badge-muted` |
| Swatch ring visuals | `ui-color-swatch-ring`, `ui-color-swatch-ring-active` |
| Role pills | `ui-pill-owner*`, `ui-pill-leader*`, `ui-pill-contributor*` |

## 5) Keep-as-layout utility guidance
These should remain in templates:
- Structural layout: `flex`, `grid`, `items-*`, `justify-*`
- Spacing/flow: `gap-*`, layout-related `p-*`/`m-*`
- Responsive structure: `sm:*`, `md:*`, `lg:*`
- Sizing/overflow: `w-*`, `min-w-*`, `overflow-*`

## 6) Post-change progress notes (this iteration)
- Added reusable semantic classes for warning/danger/success/accent text states.
- Added reusable badge, swatch ring, drag-handle, and role-pill semantic classes.
- Migrated high-reuse ownership/team pill classes and several shell/text patterns in `app-projects-challenges.js`.
- Migrated admin leaver/hidden badges and workload/assignment warning text classes to semantic classes.

## 7) Remaining exceptions for next pass
- Deep project-detail challenge cards and portability widgets still include direct zinc/accent classes.
- Some decorative ring/shadow patterns still need tokenized semantic wrappers.
- Remaining per-component one-off color bundles should be collapsed into a smaller set of semantic role/state classes.
