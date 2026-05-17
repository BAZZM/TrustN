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

  it("paints secondary labels above the inner ring when a branch is focused", () => {
    const root = createRoot(container);

    act(() => {
      root.render(
        <ConnectionsGraph
          currentUserName="Alice"
          innerConnections={[
            { id: "1", name: "Diana Davis", strength: 5 },
            { id: "2", name: "Bob Brown", strength: 4 },
            { id: "3", name: "Carol Chen", strength: 3 },
          ]}
          overflowInnerConnections={[]}
          focusUserId="1"
          focusedConnection={{ id: "1", name: "Diana Davis", jobRole: "Data Scientist", industry: "Technology" }}
          secondaryConnections={[{ id: "p1", peer_id: "p1", name: "Paul Parker", strength: 2 }]}
          secondaryLoading={false}
          onFocusConnection={jest.fn()}
          onResetFocus={jest.fn()}
          onSelectSecondary={jest.fn()}
          t={t}
          immersive
        />
      );
    });

    const svg = container.querySelector(".connections__graph-svg");
    expect(svg).toBeTruthy();

    const innerNodes = Array.from(svg.querySelectorAll(".connections__inner-node"));
    const floatingLabels = Array.from(svg.querySelectorAll("[data-testid='secondary-floating-label']"));
    expect(innerNodes.length).toBeGreaterThan(0);
    expect(floatingLabels.length).toBe(1);

    const allChildren = Array.from(svg.querySelectorAll("*"));
    const lastInnerIndex = Math.max(...innerNodes.map((node) => allChildren.indexOf(node)));
    const firstFloatingLabelIndex = Math.min(
      ...floatingLabels.map((label) => allChildren.indexOf(label))
    );

    expect(firstFloatingLabelIndex).toBeGreaterThan(lastInnerIndex);
    expect(floatingLabels[0].textContent).toBe("Paul Parker");
  });
});
