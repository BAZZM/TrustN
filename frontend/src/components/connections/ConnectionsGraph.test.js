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
  "connections.heroLineOverview": "Overview hero",
  "connections.heroLineFocus": "Focus hero",
  "connections.heroFabAria": "Open details and requests",
  "connections.expandDetails": "Details",
  "connections.branchSearchFabAria": "Search people in this branch",
  "connections.branchSearchFabLabel": "Search",
  "connections.askFabAria": "Ask your network a question",
  "connections.askFabLabel": "Ask",
  "connections.askTitle": "Ask your network",
  "connections.askCloseAria": "Close ask your network",
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
    window.localStorage.clear();
    window.history.pushState({}, "", "/");
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

    const heroWrap = stage.querySelector(".connections__immersive-hero-wrap");
    expect(heroWrap).toBeTruthy();
    expect(stage.contains(heroWrap)).toBe(true);
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

  it("starts with the immersive sheet fully hidden (no peek) and always shows the FAB", () => {
    const root = createRoot(container);

    act(() => {
      root.render(
        <ConnectionsGraph
          currentUserName="Alice"
          innerConnections={[
            { id: "1", name: "Diana Davis", strength: 5 },
            { id: "2", name: "Bob Brown", strength: 4 },
          ]}
          overflowInnerConnections={[]}
          focusUserId="1"
          focusedConnection={{ id: "1", name: "Diana Davis", jobRole: "Data Scientist", industry: "Technology" }}
          secondaryConnections={[]}
          secondaryLoading={false}
          onFocusConnection={jest.fn()}
          onResetFocus={jest.fn()}
          onSelectSecondary={jest.fn()}
          t={t}
          immersive
        />
      );
    });

    const sheet = container.querySelector(".connections__sheet");
    expect(sheet).toBeTruthy();
    expect(sheet.classList.contains("connections__sheet--closed")).toBe(true);
    expect(sheet.classList.contains("connections__sheet--open")).toBe(false);
    expect(sheet.classList.contains("connections__sheet--peek")).toBe(false);

    const fabs = [...container.querySelectorAll(".connections__fab")];
    expect(fabs.length).toBe(2);
    const ariaLabels = fabs.map((el) => el.getAttribute("aria-label"));
    expect(ariaLabels).toContain("Open details and requests");
    expect(ariaLabels).toContain("Search people in this branch");
  });

  it("shows the FAB on immersive overview (no inner focus)", () => {
    const root = createRoot(container);

    act(() => {
      root.render(
        <ConnectionsGraph
          currentUserName="Alice"
          innerConnections={[
            { id: "1", name: "Diana Davis", strength: 5 },
            { id: "2", name: "Bob Brown", strength: 4 },
          ]}
          overflowInnerConnections={[]}
          focusUserId={null}
          focusedConnection={null}
          secondaryConnections={[]}
          secondaryLoading={false}
          onFocusConnection={jest.fn()}
          onResetFocus={jest.fn()}
          t={t}
          immersive
        />
      );
    });

    const fabs = [...container.querySelectorAll(".connections__fab")];
    expect(fabs.length).toBe(2);
  });

  it("styles the You hub node and acquired inners with the base node class suffixes", () => {
    const root = createRoot(container);

    act(() => {
      root.render(
        <ConnectionsGraph
          currentUserName="Alice"
          innerConnections={[
            { id: "1", name: "Diana Davis", strength: 5, peerIntroduced: true },
            { id: "2", name: "Bob Brown", strength: 4 },
          ]}
          overflowInnerConnections={[]}
          focusUserId="2"
          focusedConnection={{ id: "2", name: "Bob Brown" }}
          secondaryConnections={[]}
          secondaryLoading={false}
          onFocusConnection={jest.fn()}
          onResetFocus={jest.fn()}
          t={t}
          immersive
        />
      );
    });

    // Suffixes must hang off the base class; "...--you__core" has no CSS and renders as a black disc.
    expect(container.querySelectorAll(".connections__inner-node--you__core").length).toBe(0);
    expect(container.querySelectorAll(".connections__inner-node--acquired__core").length).toBe(0);
    const youCores = container.querySelectorAll(
      ".connections__inner-node--you .connections__inner-node__core"
    );
    expect(youCores.length).toBe(1);
    expect(
      container.querySelectorAll(".connections__inner-node--acquired .connections__inner-node__hit").length
    ).toBe(1);
  });

  describe("free layout", () => {
    const flushFrames = (count = 3) =>
      act(async () => {
        for (let i = 0; i < count; i += 1) {
          // eslint-disable-next-line no-await-in-loop
          await new Promise((resolve) => requestAnimationFrame(() => resolve()));
        }
      });

    function renderGraph() {
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
            focusUserId={null}
            focusedConnection={null}
            secondaryConnections={[]}
            secondaryLoading={false}
            onFocusConnection={jest.fn()}
            onResetFocus={jest.fn()}
            statsSummary={<span>stats</span>}
            t={t}
            immersive
          />
        );
      });
      return root;
    }

    const toggle = () => container.querySelector(".connections__layout-toggle");
    const transforms = () =>
      [...container.querySelectorAll(".connections__inner-node[tabindex]")].map((el) => el.style.transform);

    it("is off by default", () => {
      renderGraph();
      expect(toggle().getAttribute("aria-pressed")).toBe("false");
    });

    it("toggles on and off and remembers the choice", () => {
      renderGraph();
      act(() => toggle().click());
      expect(toggle().getAttribute("aria-pressed")).toBe("true");
      expect(window.localStorage.getItem("intro_graph_layout")).toBe("free");
      act(() => toggle().click());
      expect(toggle().getAttribute("aria-pressed")).toBe("false");
      expect(window.localStorage.getItem("intro_graph_layout")).toBe("fixed");
    });

    it("starts on from a stored choice", () => {
      window.localStorage.setItem("intro_graph_layout", "free");
      renderGraph();
      expect(toggle().getAttribute("aria-pressed")).toBe("true");
    });

    it("?layout=free turns it on and is remembered; ?layout=fixed turns it off", () => {
      window.history.pushState({}, "", "/?layout=free");
      renderGraph();
      expect(toggle().getAttribute("aria-pressed")).toBe("true");
      expect(window.localStorage.getItem("intro_graph_layout")).toBe("free");

      document.body.removeChild(container);
      container = document.createElement("div");
      document.body.appendChild(container);
      window.history.pushState({}, "", "/?layout=fixed");
      renderGraph();
      expect(toggle().getAttribute("aria-pressed")).toBe("false");
    });

    it("leaves a layout with no overlaps exactly on its rest positions", async () => {
      const root = renderGraph();
      await flushFrames(4);
      const fixed = transforms();
      expect(fixed.length).toBe(3);
      fixed.forEach((value) => expect(value).toMatch(/translate/));
      act(() => root.unmount());
      document.body.removeChild(container);
      container = document.createElement("div");
      document.body.appendChild(container);

      window.localStorage.setItem("intro_graph_layout", "free");
      renderGraph();
      await flushFrames(12);
      transforms().forEach((value, index) => {
        const nums = (str) => (str.match(/-?\d+(\.\d+)?/g) || []).map(Number);
        const live = nums(value);
        const rest = nums(fixed[index]);
        expect(live.length).toBe(rest.length);
        live.forEach((n, i) => expect(Math.abs(n - rest[i])).toBeLessThan(0.6));
      });
    });
  });

  describe("keyboard navigation", () => {
    const press = (target, key) =>
      act(() => {
        target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
      });

    function renderGraph(overrides = {}) {
      const onResetFocus = jest.fn();
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
            focusUserId={null}
            focusedConnection={null}
            secondaryConnections={[]}
            secondaryLoading={false}
            onFocusConnection={jest.fn()}
            onResetFocus={onResetFocus}
            statsSummary={<span>stats</span>}
            t={t}
            immersive
            {...overrides}
          />
        );
      });
      return { onResetFocus };
    }

    const innerNodes = () => [...container.querySelectorAll(".connections__inner-node[tabindex]")];

    it("moves focus between inner nodes with the arrow keys and wraps", () => {
      renderGraph();
      const nodes = innerNodes();
      expect(nodes.length).toBe(3);

      nodes[0].focus();
      press(nodes[0], "ArrowRight");
      expect(document.activeElement).toBe(nodes[1]);
      press(nodes[1], "ArrowDown");
      expect(document.activeElement).toBe(nodes[2]);
      press(nodes[2], "ArrowRight");
      expect(document.activeElement).toBe(nodes[0]);
      press(nodes[0], "ArrowLeft");
      expect(document.activeElement).toBe(nodes[2]);
      press(nodes[2], "ArrowUp");
      expect(document.activeElement).toBe(nodes[1]);
    });

    it("Escape clears the focused branch when no overlay is open", () => {
      const { onResetFocus } = renderGraph({
        focusUserId: "1",
        focusedConnection: { id: "1", name: "Diana Davis" },
      });
      press(document, "Escape");
      expect(onResetFocus).toHaveBeenCalledTimes(1);
    });

    it("Escape does nothing when there is no focused branch", () => {
      const { onResetFocus } = renderGraph();
      press(document, "Escape");
      expect(onResetFocus).not.toHaveBeenCalled();
    });

    it("Escape closes an open overlay first and leaves the branch focused", async () => {
      const { onResetFocus } = renderGraph({
        focusUserId: "1",
        focusedConnection: { id: "1", name: "Diana Davis" },
      });
      const details = [...container.querySelectorAll(".connections__fab")].find(
        (el) => el.getAttribute("aria-label") === "Open details and requests"
      );
      act(() => details.click());
      press(document, "Escape");
      expect(container.querySelector(".connections__sheet").classList.contains("connections__sheet--closed")).toBe(
        true
      );
      expect(onResetFocus).not.toHaveBeenCalled();
    });
  });

  describe("modal overlays", () => {
    const flushFrame = () =>
      act(async () => {
        await new Promise((resolve) => requestAnimationFrame(() => resolve()));
      });
    const pressEscape = () =>
      act(() => {
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      });
    const fab = (label) =>
      [...container.querySelectorAll(".connections__fab")].find((el) => el.getAttribute("aria-label") === label);

    function renderGraph(overrides = {}) {
      const onResetFocus = jest.fn();
      const root = createRoot(container);
      act(() => {
        root.render(
          <ConnectionsGraph
            currentUserName="Alice"
            innerConnections={[
              { id: "1", name: "Diana Davis", strength: 5 },
              { id: "2", name: "Bob Brown", strength: 4 },
            ]}
            overflowInnerConnections={[]}
            focusUserId="1"
            focusedConnection={{ id: "1", name: "Diana Davis" }}
            secondaryConnections={[]}
            secondaryLoading={false}
            onFocusConnection={jest.fn()}
            onResetFocus={onResetFocus}
            statsSummary={<span>stats</span>}
            focusSearchSlot={<input id="connections-unified-secondary-search" />}
            t={t}
            immersive
            {...overrides}
          />
        );
      });
      return { onResetFocus };
    }

    it("opens the sheet as a modal: inert background, focus on the handle, FABs stay mounted", async () => {
      renderGraph();
      const details = fab("Open details and requests");

      act(() => details.click());
      await flushFrame();

      const sheet = container.querySelector(".connections__sheet");
      expect(sheet.getAttribute("role")).toBe("dialog");
      expect(sheet.getAttribute("aria-modal")).toBe("true");
      expect(sheet.getAttribute("aria-hidden")).toBe("false");
      expect(container.querySelector(".connections__graph-stage--immersive").hasAttribute("inert")).toBe(true);
      expect(container.querySelector(".connections__immersive-bottom-dock").hasAttribute("inert")).toBe(true);
      expect(container.querySelector(".connections__immersive-fab-dock").hasAttribute("inert")).toBe(true);
      expect(document.activeElement.classList.contains("connections__sheet-handle")).toBe(true);
      expect(container.querySelectorAll(".connections__fab").length).toBe(2);
      expect(container.contains(details)).toBe(true);
    });

    it("makes content outside the graph inert too (global nav), but not the scrim, and restores it on close", async () => {
      const nav = document.createElement("nav");
      document.body.appendChild(nav);
      try {
        renderGraph();

        act(() => fab("Open details and requests").click());
        await flushFrame();
        expect(nav.hasAttribute("inert")).toBe(true);
        expect(container.querySelector(".connections__sheet-scrim").hasAttribute("inert")).toBe(false);
        expect(container.querySelector(".connections__sheet").hasAttribute("inert")).toBe(false);

        pressEscape();
        expect(nav.hasAttribute("inert")).toBe(false);
      } finally {
        document.body.removeChild(nav);
      }
    });

    it("closes on Escape and returns focus to the Details FAB", async () => {
      renderGraph();
      const details = fab("Open details and requests");

      act(() => details.click());
      await flushFrame();
      pressEscape();

      const sheet = container.querySelector(".connections__sheet");
      expect(sheet.classList.contains("connections__sheet--closed")).toBe(true);
      expect(sheet.hasAttribute("role")).toBe(false);
      expect(container.querySelector(".connections__graph-stage--immersive").hasAttribute("inert")).toBe(false);
      expect(document.activeElement).toBe(details);
    });

    it("closes on scrim tap without clearing the focused branch", async () => {
      const { onResetFocus } = renderGraph();

      act(() => fab("Open details and requests").click());
      await flushFrame();
      act(() => container.querySelector(".connections__sheet-scrim").click());

      expect(container.querySelector(".connections__sheet").classList.contains("connections__sheet--closed")).toBe(
        true
      );
      expect(onResetFocus).not.toHaveBeenCalled();
    });

    it("has no Ask button unless the page supplies renderAsk", () => {
      renderGraph();
      expect(fab("Ask your network a question")).toBeUndefined();
    });

    it("opens ask-your-network as a modal, focuses its input, and returns focus to the Ask FAB on Escape", async () => {
      const close = jest.fn();
      renderGraph({
        renderAsk: (api) => {
          close.mockImplementation(api.close);
          return <input id="connections-ask-input" />;
        },
      });
      const askFab = fab("Ask your network a question");
      expect(askFab).toBeTruthy();

      act(() => askFab.click());
      await flushFrame();

      const dialog = container.querySelector(".connections__ask-modal");
      expect(dialog.getAttribute("role")).toBe("dialog");
      expect(dialog.getAttribute("aria-modal")).toBe("true");
      expect(document.activeElement.id).toBe("connections-ask-input");
      expect(container.querySelector(".connections__graph-stage--immersive").hasAttribute("inert")).toBe(true);
      expect(container.querySelector(".connections__sheet").classList.contains("connections__sheet--closed")).toBe(true);

      pressEscape();
      expect(container.querySelector(".connections__ask-modal")).toBeNull();
      expect(document.activeElement).toBe(askFab);
    });

    it("lets the ask panel close the dialog through the close callback", async () => {
      renderGraph({
        renderAsk: ({ close }) => (
          <button type="button" id="ask-done" onClick={close}>
            done
          </button>
        ),
      });
      act(() => fab("Ask your network a question").click());
      await flushFrame();
      act(() => container.querySelector("#ask-done").click());
      expect(container.querySelector(".connections__ask-modal")).toBeNull();
    });

    it("opens branch search with focus in the field and returns focus to the Search FAB on Escape", async () => {
      renderGraph();
      const search = fab("Search people in this branch");

      act(() => search.click());
      await flushFrame();

      expect(container.querySelector(".connections__branch-search-modal")).toBeTruthy();
      expect(document.activeElement.id).toBe("connections-unified-secondary-search");
      expect(container.querySelector(".connections__sheet").classList.contains("connections__sheet--closed")).toBe(
        true
      );

      pressEscape();
      expect(container.querySelector(".connections__branch-search-modal")).toBeNull();
      expect(document.activeElement).toBe(search);
    });
  });
});
