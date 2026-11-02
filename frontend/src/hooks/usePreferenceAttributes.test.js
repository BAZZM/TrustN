import React, { act } from "react";
import { createRoot } from "react-dom/client";
import usePreferenceAttributes from "./usePreferenceAttributes";

global.IS_REACT_ACT_ENVIRONMENT = true;

function Probe({ user }) {
  usePreferenceAttributes(user);
  return null;
}

describe("usePreferenceAttributes", () => {
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

  it("mirrors the saved preferences onto <html> and follows changes", () => {
    const html = document.documentElement;
    act(() => root.render(<Probe user={{ large_text: true, high_contrast: false }} />));
    expect(html.dataset.largeText).toBe("true");
    expect(html.dataset.highContrast).toBe("false");

    act(() => root.render(<Probe user={{ large_text: false, high_contrast: true }} />));
    expect(html.dataset.largeText).toBe("false");
    expect(html.dataset.highContrast).toBe("true");
  });

  it("resets to off when signed out and cleans up on unmount", () => {
    const html = document.documentElement;
    act(() => root.render(<Probe user={null} />));
    expect(html.dataset.largeText).toBe("false");
    act(() => root.unmount());
    expect(html.dataset.largeText).toBeUndefined();
    root = createRoot(container);
  });
});
