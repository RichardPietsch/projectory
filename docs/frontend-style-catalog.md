# Frontend Style Catalog (Migration + Validation)

## Scope
Targeted migration and validation scope:
- `public/theme.css`
- `public/js/views-clients.js`
- `public/js/app-admin-access.js`
- `public/js/app-projects-challenges.js`

## Semantic class map used in targeted renderers

| Pattern family | Semantic class(es) |
|---|---|
| Surface/background shells | `ui-panel`, `ui-panel-muted`, `ui-bg-surface-*`, `ui-ring-subtle` |
| Text tones | `ui-section-title`, `ui-text-secondary`, `ui-text-muted`, `ui-text-body`, `ui-text-strong*` |
| Borders and separators | `ui-border-default`, `ui-border-strong`, `ui-border-subtle` |
| Buttons/actions | `ui-btn` + `ui-btn-primary/secondary/danger/accent`, `ui-btn-ghost-soft` |
| Tabs | `ui-tab`, `ui-tab-active` |
| Role pills | `ui-pill-info*`, `ui-pill-success*`, `ui-pill-neutral*` |
| Progress/workload bars | `ui-progress-track`, `ui-progress-fill-info/success/neutral` |
| Configuration drag/drop | `ui-drag-handle`, `ui-drop-highlight`, swatch ring classes |
| Onboarding highlight ring | `ui-onboarding-highlight` |

## Validation commands used for metrics

```bash
# Top class-pattern frequency per targeted file
python - <<'PY'
import re, pathlib, collections
files=['public/js/views-clients.js','public/js/app-admin-access.js','public/js/app-projects-challenges.js']
pat=re.compile(r'(?:text|bg|border|ring|shadow|rounded)-[^"\'\s>]+|ui-[^"\'\s>]+|#[0-9a-fA-F]{3,8}')
for f in files:
  c=collections.Counter(pat.findall(pathlib.Path(f).read_text()))
  print(f, c.most_common(10))
PY

# Raw visual utilities still present in targeted renderers
python - <<'PY'
import re, pathlib
files=['public/js/views-clients.js','public/js/app-admin-access.js','public/js/app-projects-challenges.js']
pat=re.compile(r'\b(?:text|bg|border|ring)-(?:zinc|slate|gray|red|rose|amber|yellow|green|emerald|blue|sky|violet|indigo)-[^"\'\s>]+')
print(sum(len(pat.findall(pathlib.Path(f).read_text())) for f in files))
PY

# Raw color literals outside theme.css in targeted renderers
python - <<'PY'
import re, pathlib
files=['public/js/views-clients.js','public/js/app-admin-access.js','public/js/app-projects-challenges.js']
pat=re.compile(r'#[0-9a-fA-F]{3,8}|rgb\([^)]*\)|hsl\([^)]*\)')
print(sum(len(pat.findall(pathlib.Path(f).read_text())) for f in files))
PY
```

## Post-migration report (Phase 3 gate)

### A) Class-frequency snapshot (before → after)

#### `public/js/views-clients.js`
- Top classes stayed semantically stable (`ui-*` already dominant).
- Before top sample: `text-sm` x6, `text-muted` x3, `text-xs` x2.
- After top sample: `ui-btn` x5, `ui-sort-button` x5, `ui-section-title` x3, `ui-text-muted` x3.

#### `public/js/app-admin-access.js`
- Before top sample included mixed semantic + legacy defaults.
- After top sample remains semantic-dominant (`ui-btn`, `ui-input`, `ui-label`, `ui-sort-button`), and config-row drag highlight now uses `ui-drop-highlight`.

#### `public/js/app-projects-challenges.js`
- Before top sample included many direct zinc utilities (`text-zinc-*`, `bg-zinc-*`, `border-zinc-*`).
- After top sample shifts toward semantic classes (`ui-text-muted`, `ui-text-secondary`, `ui-section-title`, `ui-border-strong`).

### B) Raw visual utility use count (targeted renderers)
- **Before:** 149
- **After:** 0

### C) Raw color literal count outside `theme.css` (targeted renderers)
- **Before:** 21
- **After:** 9

### D) Unresolved exceptions (justified)
1. **`#64748B` defaults in admin configuration state logic** (`app-admin-access.js`).
   - Justification: these are data defaults for persisted config entities (priority/status color values), not template appearance classes.
   - TODO: centralize default hex fallback into a shared config constant and reference it from both JS runtime and migration docs.

## Policy outcome summary
- Targeted templates now compose semantic `ui-*` classes for visual presentation and keep utility classes primarily for layout/spacing.
- Focus/selection/highlight behavior remains token-backed (`ui-input`/`ui-btn` focus ring + `ui-onboarding-highlight`).
- Remaining visual color literals in targeted JS are limited to configuration data defaults, documented above.
- Copy scale was simplified to a reduced semantic set in `theme.css`: `ui-copy-lg`, `ui-copy-md`, `ui-copy-sm`, `ui-copy-xs`.
- Secondary actions now follow a stronger ghost-button style (`ui-btn-secondary`) with transparent fill and stronger borders for improved card contrast/readability.
- Text state colors are now sourced from a smaller token group (`--color-text-accent|danger|success|warning`) to reduce near-duplicate color variants.

## Automated enforcement (new)
- Added `scripts/check-frontend-visual-policy.js` and wired it into `npm run lint:boundaries` via `npm run frontend:style-policy:check`.
- Checker scope now enforces semantic visual classes for:
  - auth views (`loginScreenView` through reset-password view scope) in `public/js/app-shared-auth.js`,
  - `public/js/views-clients.js`,
  - `public/js/views-people.js`,
  - `public/js/views-admin-projects.js`,
  - admin standalone shell/tab scope in `public/js/app-routing-ui.js`.
- Remaining pages (especially `public/index.html` modal/header primitives and onboarding shell) remain in phased migration and are tracked as follow-up scope expansion.
