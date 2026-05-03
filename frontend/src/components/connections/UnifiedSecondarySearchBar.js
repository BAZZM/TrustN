import React from "react";
import "./UnifiedSecondarySearchBar.css";

/**
 * Debounced FTS query is owned by parent; this is a thin styled input used on Connections + Contacts.
 */
export default function UnifiedSecondarySearchBar({
  id = "trust-unified-secondary-search",
  value,
  onChange,
  placeholder,
  ariaLabel,
  disabled = false,
  className = "",
}) {
  return (
    <div className={["trust-unified-secondary-search", className].filter(Boolean).join(" ")}>
      <input
        id={id}
        name="unifiedSecondarySearch"
        type="search"
        className="trust-unified-secondary-search__input"
        autoComplete="off"
        spellCheck="false"
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel || placeholder || "Search"}
        disabled={disabled}
      />
    </div>
  );
}
