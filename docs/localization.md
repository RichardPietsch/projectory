# Localization guide

This project now includes a localization foundation suitable for multi-language UI rollout.

## Architecture

- **Message catalogs** are centralized per locale:
  - `public/js/locales/en.js`
  - `public/js/locales/de.js`
- **i18n runtime** is in `public/js/i18n.js` and provides:
  - `t(key, params?)` for translated lookup + interpolation
  - `setLocale(locale)` and `getLocale()`
  - `applyToDom(root)` to resolve `data-i18n*` attributes
  - locale persistence in `localStorage` (`projectory.locale`)

## Binding strategies

Use one of two patterns:

1. **Static markup** (recommended for plain HTML):

```html
<h3 data-i18n="modal.export.title">Export data</h3>
<button data-i18n-title="header.openAdministration">...</button>
```

2. **Dynamic templates** (for JS-rendered strings):

```js
const label = window.ProjectoryI18n.t('admin.tabs.people');
```

## Key naming convention

Use hierarchical keys by domain:

- `common.*`
- `header.*`
- `home.*`
- `admin.*`
- `modal.*`
- `entity.*`
- `projectStatus.*`

## Rollout plan for full localization

To fully localize the interface:

1. Move every remaining hardcoded UI literal into locale files.
2. Replace inline literals in `public/index.html` and JS view modules with translation keys.
3. Keep translation completeness checks green (`npm run locale:check`).
4. Add pseudo-locale support in development to catch hardcoded text and layout overflow.
5. Optionally migrate catalogs to JSON + extraction tooling if key volume grows.

## Notes

- Fallback locale is `en`.
- Unknown keys intentionally render as the key itself to make missing translations visible during development.


## Locale parity checks (CI-gated)

Use the locale parity script to prevent key drift:

```bash
npm run locale:check
```

What it does:

- compares key sets between `public/js/locales/en.js` and `public/js/locales/de.js`
- fails on unexpected missing/extra keys
- fails on stale exception entries once both locales contain the key
- prints mismatches grouped by namespace and locale direction

Allowed temporary exceptions live in:

- `scripts/locale-key-exceptions.json`

Remediation workflow:

1. Run `npm run locale:check`.
2. Add missing keys to the opposite locale file.
3. Only if unavoidable, add a temporary exception in `scripts/locale-key-exceptions.json` and document the reason in the PR.
4. Remove exception entries as soon as both locales have the key (stale exceptions fail CI).
5. Re-run `npm run locale:check` and `npm test`.

CI enforcement:

- `.github/workflows/ci.yml` runs `npm run locale:check` in the quality/security job and blocks merges on mismatch.


## Pseudo-locale mode for QA (untranslated + layout stress)

Use pseudo-locale to exaggerate text length and character shapes so visual regressions are obvious.

Quick enable paths:

- Header language switcher: choose **Pseudo (accented)**.
- URL override (recommended for reproducible bug reports): append `?qaLocale=pseudo`.

Examples:

```bash
# local dev
http://localhost:3000/?qaLocale=pseudo

# staging
https://<staging-host>/?qaLocale=pseudo
```

Behavior notes:

- Pseudo strings are generated from the English catalog at runtime and wrapped with markers (`⟪¡¡ ... !!!⟫`) to make untranslated literals easy to spot.
- Interpolation tokens like `{{count}}` are intentionally preserved so dynamic substitutions still work.
- Selecting pseudo locale persists in `localStorage` and also updates the URL query for shareable repro links.

## QA checklist (pseudo-locale pass)

Run this checklist before release candidates:

1. Switch to pseudo locale (`?qaLocale=pseudo`).
2. Navigate every major surface (home tabs, modals, admin tabs, onboarding, auth flows).
3. Flag any **plain/non-wrapped text** as potentially untranslated hardcoded strings.
4. Check for layout regressions: clipped buttons, truncated table headers, overlapping badges, modal overflow, and horizontal scrollbars.
5. Verify interactions still work with long labels (sorting, filtering, form submit/cancel, onboarding next/finish).
6. Capture each issue with:
   - URL (including query string)
   - role used (admin/planner/viewer/teammate)
   - viewport size
   - screenshot
   - impacted translation key/component

## Known caveats and expected false positives

- Proper nouns, IDs, numbers, emails, and user-entered content are expected to remain unaccented.
- Server-sourced values (e.g., names from DB) are not translation keys and may appear without wrappers.
- Some icon-only buttons/tooltips can be difficult to evaluate visually; rely on hover/ARIA text checks.
- Dynamic third-party/browser-native UI text (e.g., file picker controls) is outside application catalog control.
- Minor line wrapping is expected in pseudo mode; only report clipping/overlap/hidden-content as defects.
