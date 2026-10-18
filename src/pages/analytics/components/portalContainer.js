// Keep MUI portals within the page's CSS-variable theme without changing global tokens.
export function analyticsPortalContainer() {
  return document.querySelector('[data-analytics-page]') || document.body;
}
