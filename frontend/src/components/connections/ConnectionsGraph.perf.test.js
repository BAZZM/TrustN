import React, { act } from "react";
import { createRoot } from "react-dom/client";
import ConnectionsGraph from "./ConnectionsGraph";

// Replace framer-motion's SVG elements with plain ones that count how often they render, so the
// test can tell whether a physics frame re-renders every node or only the ones that moved.
jest.mock("framer-motion", () => {
  const React = require("react");
  const counts = { g: 0 };
  const cache = {};
  const make = (tag) =>
    React.forwardRef(function Counted(props, ref) {
      const { initial, animate, transition, style, whileHover, whileTap, ...rest } = props;
      if (tag === "g") counts.g += 1;
      return React.createElement(tag, { ...rest, ref });
    });
  return {
    __counts: counts,
    motion: new Proxy({}, { get: (_, tag) => (cache[tag] = cache[tag] || make(tag)) }),
    useReducedMotion: () => false,
  };
});

// eslint-disable-next-line import/first
import { __counts as counts } from "framer-motion";

global.IS_REACT_ACT_ENVIRONMENT = true;

const t = (key) => key;

describe("free layout render cost", () => {
  let container;
  let root;

  // One act() per frame so React flushes each physics frame separately (a single act would batch
  // them all into one render and hide the per-frame cost).
  const frames = async (count) => {
    for (let i = 0; i < count; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await act(async () => {
        await new Promise((resolve) => requestAnimationFrame(() => resolve()));
      });
    }
  };
  const pointer = (target, type, x, y) =>
    act(() => {
      target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y }));
    });

  beforeEach(() => {
    window.localStorage.setItem("intro_graph_layout", "free");
    window.matchMedia = jest.fn().mockImplementation((query) => ({
      matches: query.includes("767px"),
      media: query,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    }));
    // jsdom has no SVG geometry: map client coordinates 1:1 onto the viewBox.
    window.SVGSVGElement.prototype.getScreenCTM = () => ({ inverse: () => ({}) });
    window.SVGSVGElement.prototype.createSVGPoint = () => ({
      x: 0,
      y: 0,
      matrixTransform() {
        return { x: this.x, y: this.y };
      },
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.removeChild(container);
    window.localStorage.clear();
  });

  it("only re-renders the node being dragged, not the whole graph, on each physics frame", async () => {
    const inner = Array.from({ length: 8 }, (_, i) => ({ id: String(i + 1), name: `Person ${i + 1}`, strength: 8 - i }));
    act(() => {
      root.render(
        <ConnectionsGraph
          currentUserName="Alice"
          innerConnections={inner}
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
    await frames(20); // let the (already settled) simulation go to sleep

    const nodes = [...container.querySelectorAll(".connections__inner-node[tabindex]")];
    expect(nodes.length).toBe(8);
    const dragged = nodes[0]; // rests at the top of the ring, around (210, 92)

    pointer(dragged, "pointerdown", 210, 92);
    pointer(dragged, "pointermove", 210, 40); // 52px: past the tap slop, into empty space above the ring
    await frames(2);

    counts.g = 0;
    await frames(12); // ~12 physics frames while the node is held; nobody overlaps, nobody else moves

    // Without memoization all 8 nodes render on every one of the 12 frames (about 96 renders).
    expect(counts.g).toBeLessThanOrEqual(4);

    pointer(dragged, "pointerup", 210, 40);
  });
});
