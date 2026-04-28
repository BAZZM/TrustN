/**
 * Central config for the dial contact screen.
 * Edit this file to change ring limits, labels, placeholders, and section behaviour
 * without touching DemiRadialNetwork or Contacts.js.
 *
 * Sections:
 * - Toolbar: search (DialToolbar.js)
 * - Ring controls: inner/secondary sliders + optional filters (DialRingControls.js)
 * - Wheel: DemiRadialNetwork (unchanged)
 * - Info panel: inside DemiRadialNetwork (InnerInfoRing)
 */
export const DIAL_CONFIG = {
  /** Inner ring (direct connections) */
  innerRing: {
    label: "Inner",
    minCount: 1,
    maxCount: 100,
    defaultPercent: 100,
    sliderMin: 0,
    sliderMax: 100,
  },
  /** Secondary ring (connections of selected inner contact) */
  secondaryRing: {
    label: "Secondary",
    minCount: 1,
    maxCount: 100,
    defaultPercent: 100,
    sliderMin: 0,
    sliderMax: 100,
  },
  /** Search */
  search: {
    placeholder: "Search by name or occupation",
    debounceMs: 200,
  },
  /** Secondary filters (job / industry) - only when an inner contact is selected */
  secondaryFilters: {
    jobPlaceholder: "Filter by job role…",
    industryPlaceholder: "Filter by industry…",
    debounceMs: 300,
  },
  /** Wheel / performance */
  wheel: {
    performanceMode: "auto",
    enableBlur: true,
    accentColor: "coolBlue",
  },
};
