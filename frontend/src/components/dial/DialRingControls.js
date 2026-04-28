import React from "react";
import "./DialContactScreen.css";

/**
 * Ring controls: inner + secondary sliders, optional secondary filters.
 * Each ring section is self-contained for easier styling and behaviour changes.
 */
export default function DialRingControls({
  // Inner ring
  innerLabel,
  innerCurrent,
  innerTotal,
  innerPercent,
  onInnerPercentChange,
  innerSliderId = "dial-slider-inner",
  // Secondary ring
  secondaryLabel,
  secondaryCurrent,
  secondaryTotal,
  secondaryPercent,
  onSecondaryPercentChange,
  secondarySliderId = "dial-slider-secondary",
  // Optional: show job/industry filters when an inner contact is selected
  showSecondaryFilters = false,
  jobFilterValue = "",
  onJobFilterChange,
  industryFilterValue = "",
  onIndustryFilterChange,
  jobPlaceholder,
  industryPlaceholder,
}) {
  return (
    <section className="dial-section dial-ring-controls" aria-label="Ring visibility controls">
      <div className="dial-ring-controls__sliders">
        <div className="dial-ring-controls__group">
          <label htmlFor={innerSliderId} className="dial-ring-controls__label">
            {innerLabel}: {innerCurrent} / {innerTotal}
          </label>
          <input
            type="range"
            id={innerSliderId}
            className="dial-ring-controls__slider"
            min={0}
            max={100}
            value={innerPercent}
            onChange={(e) => onInnerPercentChange(Number(e.target.value))}
            aria-label={`${innerLabel} ring: ${innerCurrent} of ${innerTotal} contacts`}
          />
        </div>
        <div className="dial-ring-controls__group">
          <label htmlFor={secondarySliderId} className="dial-ring-controls__label">
            {secondaryLabel}: {secondaryCurrent} / {secondaryTotal}
          </label>
          <input
            type="range"
            id={secondarySliderId}
            className="dial-ring-controls__slider"
            min={0}
            max={100}
            value={secondaryPercent}
            onChange={(e) => onSecondaryPercentChange(Number(e.target.value))}
            aria-label={`${secondaryLabel} ring: ${secondaryCurrent} of ${secondaryTotal} contacts`}
          />
        </div>
      </div>
      {showSecondaryFilters && (
        <div className="dial-ring-controls__filters">
          <input
            type="text"
            id="dial-filter-job"
            name="dialFilterJob"
            placeholder={jobPlaceholder}
            className="dial-ring-controls__filter-input"
            value={jobFilterValue}
            onChange={(e) => onJobFilterChange(e.target.value)}
            aria-label="Filter secondary by job role"
          />
          <input
            type="text"
            id="dial-filter-industry"
            name="dialFilterIndustry"
            placeholder={industryPlaceholder}
            className="dial-ring-controls__filter-input"
            value={industryFilterValue}
            onChange={(e) => onIndustryFilterChange(e.target.value)}
            aria-label="Filter secondary by industry"
          />
        </div>
      )}
    </section>
  );
}
