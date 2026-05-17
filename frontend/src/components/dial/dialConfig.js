/**
 * Central config for the dial contact screen (`DialContactScreen`).
 * Edit ring limits, labels, placeholders, and section behaviour here.
 *
 * Sections (current implementation):
 * - Toolbar: search (`DialToolbar.js`)
 * - Rings: inner / secondary / prospective lists rendered in `DialContactScreen.js`
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
