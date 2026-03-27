# Frontend XSS hardening migration notes

Replaced high-risk string-based rendering paths with safe DOM APIs in this baseline hardening pass:

- `public/js/app-projects-challenges.js`
  - Assignment people list (`#assign-people-list`) now uses element creation + `textContent` instead of HTML interpolation.
  - Admin select renderers (`#admin-person-trade`, `#admin-person-level`, `#admin-client-priority`, `#admin-project-client`, `#admin-project-status`) now populate options via safe DOM utility.
- `public/js/app-routing-ui.js`
  - Home tab/header labels and counts now render via DOM nodes (`textContent`) instead of string interpolation.
- `public/js/app-admin-access.js`
  - Admin user person select renderer now populates options via safe DOM utility.

Added shared helper module:

- `public/js/safe-dom.js` (`setText`, `clearChildren`, `appendOption`, `escapeHtml`).
