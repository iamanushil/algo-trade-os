/**
 * theme.js — Light/dark theme toggle
 * Persists preference in localStorage under the key "theme".
 * Light mode: sets data-theme="light" on <html>.
 * Dark mode (default): removes data-theme attribute from <html>.
 */

(function () {
  'use strict';

  const STORAGE_KEY = 'theme';
  const LIGHT = 'light';

  /** Apply the stored (or default dark) theme immediately, before paint. */
  function applyStoredTheme() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === LIGHT) {
      document.documentElement.setAttribute('data-theme', LIGHT);
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }

  /** Toggle between light and dark, persist the result. */
  function toggleTheme() {
    const isLight = document.documentElement.getAttribute('data-theme') === LIGHT;
    if (isLight) {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem(STORAGE_KEY, 'dark');
    } else {
      document.documentElement.setAttribute('data-theme', LIGHT);
      localStorage.setItem(STORAGE_KEY, LIGHT);
    }
    syncToggleButton();
  }

  /** Update the toggle button icon to reflect the current theme. */
  function syncToggleButton() {
    const btn = document.getElementById('theme-toggle');
    if (!btn) return;
    const isLight = document.documentElement.getAttribute('data-theme') === LIGHT;
    btn.setAttribute('aria-label', isLight ? 'Switch to dark theme' : 'Switch to light theme');
    btn.innerHTML = isLight ? SUN_ICON : MOON_ICON;
  }

  /* SVG icons ── moon for dark mode (click → go light), sun for light mode (click → go dark) */
  const MOON_ICON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </svg>`;

  const SUN_ICON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="5"/>
    <line x1="12" y1="1" x2="12" y2="3"/>
    <line x1="12" y1="21" x2="12" y2="23"/>
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
    <line x1="1" y1="12" x2="3" y2="12"/>
    <line x1="21" y1="12" x2="23" y2="12"/>
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
  </svg>`;

  /* Apply stored theme before first paint (called synchronously at parse time) */
  applyStoredTheme();

  /* Wire up the toggle button once the DOM is ready */
  document.addEventListener('DOMContentLoaded', function () {
    const btn = document.getElementById('theme-toggle');
    if (btn) {
      btn.addEventListener('click', toggleTheme);
      syncToggleButton();
    }
  });
})();
