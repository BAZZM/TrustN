import React, { act } from "react";
import { createRoot } from "react-dom/client";
import ToggleRow from "./ToggleRow";

global.IS_REACT_ACT_ENVIRONMENT = true;

describe("ToggleRow", () => {
  let container;
  let root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("is a switch named by its visible label", () => {
    act(() => root.render(<ToggleRow label="Large text" checked={false} onChange={() => {}} />));
    const toggle = container.querySelector("button");
    expect(toggle.getAttribute("role")).toBe("switch");
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    const label = document.getElementById(toggle.getAttribute("aria-labelledby"));
    expect(label.textContent).toBe("Large text");
  });

  it("reports the flipped value on click", () => {
    const onChange = jest.fn();
    act(() => root.render(<ToggleRow label="High contrast" checked onChange={onChange} />));
    const toggle = container.querySelector("button");
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    act(() => toggle.click());
    expect(onChange).toHaveBeenCalledWith(false);
  });
});
