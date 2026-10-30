import { useCallback, useEffect, useRef, useState } from "react";
import {
  createPhysicsState,
  pinNode,
  releaseNode,
  stepPhysics,
} from "../components/connections/graphPhysics";

const toMap = (state) => new Map(state.nodes.map((n) => [n.id, { x: n.x, y: n.y }]));

/**
 * Runs the free-form physics (see graphPhysics.js) for `nodes` ([{ id, x, y, radius, fixed? }] rest
 * layout) and returns live positions as a Map<id, {x, y}> (null while disabled).
 *
 * - The animation loop only runs while something is moving: when the state goes to sleep the
 *   requestAnimationFrame loop stops, so a settled graph costs nothing.
 * - Changing the rest layout (e.g. focusing another branch) re-seeds from the current positions,
 *   so nodes glide to their new places.
 * - With reduced motion there is no loop: nodes sit on their rest positions and a dragged node just
 *   follows the pointer.
 */
export default function useForceLayout({ enabled, nodes, reducedMotion = false }) {
  const [positions, setPositions] = useState(null);
  const stateRef = useRef(null);
  const frameRef = useRef(0);
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const reducedRef = useRef(reducedMotion);
  reducedRef.current = reducedMotion;

  const seedKey = nodes
    .map((n) => `${n.id}:${Math.round(n.x)}:${Math.round(n.y)}:${Math.round(n.radius)}:${n.fixed ? 1 : 0}`)
    .join("|");

  const stop = useCallback(() => {
    if (frameRef.current) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
    }
  }, []);

  const run = useCallback(() => {
    if (frameRef.current || reducedRef.current) return;
    const frame = () => {
      frameRef.current = 0;
      const current = stateRef.current;
      if (!current || !current.awake) return;
      const next = stepPhysics(current);
      stateRef.current = next;
      setPositions(toMap(next));
      if (next.awake) frameRef.current = window.requestAnimationFrame(frame);
    };
    frameRef.current = window.requestAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!enabled) {
      stop();
      stateRef.current = null;
      setPositions(null);
      return undefined;
    }
    const previous = stateRef.current && !reducedMotion ? toMap(stateRef.current) : null;
    const seeded = createPhysicsState(nodesRef.current, previous);
    stateRef.current = seeded;
    setPositions(toMap(seeded));
    run();
    return stop;
  }, [enabled, seedKey, reducedMotion, run, stop]);

  const pin = useCallback(
    (id, x, y) => {
      if (!stateRef.current) return;
      stateRef.current = pinNode(stateRef.current, id, x, y);
      setPositions(toMap(stateRef.current));
      run();
    },
    [run]
  );

  const release = useCallback(
    (id) => {
      if (!stateRef.current) return;
      stateRef.current = releaseNode(stateRef.current, id);
      setPositions(toMap(stateRef.current));
      run();
    },
    [run]
  );

  return { positions, pin, release };
}
