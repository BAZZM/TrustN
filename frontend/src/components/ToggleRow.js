import React, { useId } from "react";

/**
 * A labelled on/off row. The switch takes its accessible name from the visible label, so screen
 * readers announce "Large text, switch, off" instead of an unnamed button.
 */
export default function ToggleRow({ label, checked, onChange, disabled = false }) {
  const labelId = useId();
  return (
    <div className="settings-row settings-row--toggle">
      <span id={labelId}>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        className={"toggle" + (checked ? " toggle--on" : "")}
        onClick={() => onChange(!checked)}
        disabled={disabled}
      />
    </div>
  );
}
