import React, { act } from "react";
import { createRoot } from "react-dom/client";
import useForceLayout from "./useForceLayout";

global.IS_REACT_ACT_ENVIRONMENT = true;

function Harness({ apiRef, ...options }) {
  apiRef.current = useForceLayout(options);
  return null;
}

const far = [
  { id: "a", x: 100, y: 100, radius: 20 },
  { id: "b", x: 300, y: 300, radius: 20 },
];
const overlapping = [
  { id: "a", x: 200, y: 210, radius: 20 },
  { id: "b", x: 210, y: 210, radius: 20 },
];

describe("useForceLayout", () => {
  let container;
  let root;
  let apiRef;

  const render = (options) =>
    act(() => {
      root.render(<Harness apiRef={apiRef} {...options} />);
    });
  const frames = async (count) => {
    for (let i = 0; i < count; i += 1) {
      // One act per frame so each physics frame is committed separately.
      // eslint-disable-next-line no-await-in-loop
      await act(async () => {
        await new Promise((resolve) => requestAnimationFrame(() => resolve()));
      });
    }
  };
  const at = (id) => apiRef.current.positions.get(id);
  const gap = (a, b) => Math.hypot(at(a).x - at(b).x, at(a).y - at(b).y);

  beforeEach(() => {
    apiRef = { current: null };
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.removeChild(container);
    jest.restoreAllMocks();
  });

  it("returns no positions while disabled", () => {
    render({ enabled: false, nodes: far });
    expect(apiRef.current.positions).toBeNull();
  });

  it("starts on the rest positions and stops scheduling frames once settled", async () => {
    render({ enabled: true, nodes: far });
    expect(at("a")).toEqual({ x: 100, y: 100 });
    expect(at("b")).toEqual({ x: 300, y: 300 });

    await frames(15); // calm for a few steps, then asleep
    const spy = jest.spyOn(window, "requestAnimationFrame");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 120));
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it("pushes overlapping nodes apart, then goes to sleep", async () => {
    render({ enabled: true, nodes: overlapping });
    await frames(40);
    expect(gap("a", "b")).toBeGreaterThanOrEqual(40 - 1);
  });

  it("follows a dragged node, and a dropped node stays where it was dropped", async () => {
    render({ enabled: true, nodes: far });
    act(() => apiRef.current.pin("a", 150, 60));
    await frames(5);
    expect(at("a")).toEqual({ x: 150, y: 60 });

    act(() => apiRef.current.release("a"));
    await frames(60);
    expect(at("a").x).toBeCloseTo(150, 0);
    expect(at("a").y).toBeCloseTo(60, 0);
  });

  it("re-seeds from the current positions when the layout changes, so nodes glide to the new rest", async () => {
    render({ enabled: true, nodes: far });
    await frames(2);
    const moved = far.map((n) => ({ ...n, x: n.x + 100, y: n.y }));
    render({ enabled: true, nodes: moved });
    // First frame after the change: still near where they were, not teleported.
    expect(at("a").x).toBeLessThan(150);
    await frames(120);
    expect(at("a").x).toBeCloseTo(200, 0);
  });

  it("with reduced motion never schedules a frame; nodes sit on rest and drag still works", async () => {
    const spy = jest.spyOn(window, "requestAnimationFrame");
    render({ enabled: true, nodes: overlapping, reducedMotion: true });
    expect(at("a")).toEqual({ x: 200, y: 210 });
    expect(at("b")).toEqual({ x: 210, y: 210 });

    act(() => apiRef.current.pin("a", 120, 120));
    expect(at("a")).toEqual({ x: 120, y: 120 });
    act(() => apiRef.current.release("a"));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 80));
    });
    expect(spy).not.toHaveBeenCalled();
    expect(at("a")).toEqual({ x: 120, y: 120 });
  });

  it("cancels its pending frame when unmounted while still moving", () => {
    render({ enabled: true, nodes: overlapping });
    const cancel = jest.spyOn(window, "cancelAnimationFrame");
    act(() => root.unmount());
    expect(cancel).toHaveBeenCalled();
    root = createRoot(container); // so afterEach can unmount cleanly
  });

  it("clears positions again when switched off", () => {
    render({ enabled: true, nodes: far });
    expect(apiRef.current.positions).not.toBeNull();
    render({ enabled: false, nodes: far });
    expect(apiRef.current.positions).toBeNull();
  });
});
