import React, { act } from "react";
import { createRoot } from "react-dom/client";
import ConnectionsGraph from "./ConnectionsGraph";

global.IS_REACT_ACT_ENVIRONMENT = true;

const translations = {
  "connections.graphTitle": "Graph",
  "connections.you": "You",
  "connections.defaultFocusTitle": "Default focus",
  "connections.defaultFocusBody": "Default body",
  "connections.graphEyebrow": "Graph",
  "connections.focusActive": "Focused",
  "connections.graphIntro": "Intro",
  "connections.resetZoom": "Reset zoom",
  "connections.sheetPullHint": "Details",
  "connections.inner": "Inner",
  "connections.reset": "Reset",
  "connections.loadingBranch": "Loading",
  "connections.focusSummary": "{count} people",
  "connections.moreSecondary": "more",
  "connections.graphQuickAddAria": "Select",
  "connections.noSecondary": "No secondary",
  "connections.moreConnections": "More",
  "connections.networkSummary": "Summary",
};

function t(key) {
  return translations[key] || key;
}

describe("ConnectionsGraph", () => {
  let container;

  beforeEach(() => {
    window.matchMedia = jest.fn().mockImplementation((query) => ({
      matches: query.includes("767px"),
      media: query,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    }));

    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
    container = null;
  });

  it("renders the immersive details sheet as an overlay so it does not reflow the graph", () => {
    const root = createRoot(container);

    act(() => {
      root.render(
        <ConnectionsGraph
          currentUserName="Alice"
          innerConnections={[{ id: "1", name: "Bob Brown", strength: 5 }]}
          overflowInnerConnections={[]}
          focusUserId="1"
          focusedConnection={{ id: "1", name: "Bob Brown", jobRole: "Product Manager", industry: "Technology" }}
          secondaryConnections={[]}
          secondaryLoading={false}
          onFocusConnection={jest.fn()}
          onResetFocus={jest.fn()}
          t={t}
          immersive
        />
      );
    });

    const shell = container.querySelector(".connections__graph-shell--immersive");
    const stage = container.querySelector(".connections__graph-stage--immersive");
    const sheet = container.querySelector(".connections__sheet");

    expect(shell).toBeTruthy();
    expect(stage).toBeTruthy();
    expect(sheet).toBeTruthy();
    expect(sheet.classList.contains("connections__sheet--overlay")).toBe(true);
    expect(sheet.parentElement).toBe(shell);
  });
});
