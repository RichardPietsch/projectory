# UX checklist (shell loading + accessibility)

Use this lightweight checklist for SPA shell updates:

- [ ] Script tags for local app bundles use `defer` to avoid parser blocking.
- [ ] Route transitions keep keyboard orientation (focus moved to the primary heading/first control).
- [ ] Home tab navigation works with keyboard (`ArrowLeft`, `ArrowRight`, `Home`, `End`).
- [ ] Modal open/close restores focus to a sensible trigger or fallback target.
- [ ] Escape key closes user-facing detail modals where applicable.
- [ ] Auth flow screens still function end-to-end (invite activation, password reset, login).
