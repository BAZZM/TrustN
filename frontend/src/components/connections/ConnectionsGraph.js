import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { usePinchPanZoom } from "../../hooks/usePinchPanZoom";
import useModalOverlay from "../../hooks/useModalOverlay";
import useForceLayout from "../../hooks/useForceLayout";
import useMediaQuery from "../../hooks/useMediaQuery";
import {
  GRAPH_CENTER,
  GRAPH_VIEWBOX,
  MAX_VISIBLE_SECONDARY,
  NODE_HIT_PADDING,
  getCurrentUserFocusHubLayout,
  getInnerRingLayout,
  getNodeInitials,
  getSecondaryRingLayout,
  pickFocusPresentationAngle,
  truncateLabel,
} from "./graphLayout";

/** Selectors for hits that must not bubble up as “background tap” (would clear branch focus). */
const GRAPH_INTERACTIVE_HIT =
  ".connections__inner-node, .connections__secondary-node, .connections__secondary-quickadd, .connections__overflow-chip";

function graphClickWasOnInteractiveSurface(nativeEvent) {
  if (typeof nativeEvent?.composedPath === "function") {
    const path = nativeEvent.composedPath();
    return path.some((n) => n instanceof Element && n.closest?.(GRAPH_INTERACTIVE_HIT));
  }
  const t = nativeEvent?.target;
  return t instanceof Element && Boolean(t.closest(GRAPH_INTERACTIVE_HIT));
}

const LAYOUT_STORAGE_KEY = "intro_graph_layout";

/** `?layout=free|fixed` wins and is remembered; otherwise the stored choice; default is the fixed layout. */
function readFreeLayoutPreference() {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get("layout");
    if (fromUrl === "free" || fromUrl === "fixed") {
      window.localStorage.setItem(LAYOUT_STORAGE_KEY, fromUrl);
      return fromUrl === "free";
    }
    return window.localStorage.getItem(LAYOUT_STORAGE_KEY) === "free";
  } catch (_) {
    return false;
  }
}

function writeFreeLayoutPreference(free) {
  try {
    window.localStorage.setItem(LAYOUT_STORAGE_KEY, free ? "free" : "fixed");
  } catch (_) {
    /* storage unavailable: the choice just won't persist */
  }
}

/**
 * The node moved to its live physics position when there is one. Returns the *same object* while
 * neither the rest node nor its position changed, so memoized children skip re-rendering.
 */
function withLivePosition(positions, key, node, cache) {
  const live = positions && positions.get(key);
  if (!live) return node;
  const prev = cache.get(key);
  if (prev && prev.base === node && prev.x === live.x && prev.y === live.y) return prev.value;
  const value = { ...node, x: live.x, y: live.y };
  cache.set(key, { base: node, x: live.x, y: live.y, value });
  return value;
}

/** SVG user-space point under a pointer event (accounts for CSS transforms such as pinch-zoom). */
function pointerToViewBox(event) {
  const svg = event.currentTarget.ownerSVGElement;
  const matrix = svg && svg.getScreenCTM && svg.getScreenCTM();
  if (!matrix) return null;
  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  const local = point.matrixTransform(matrix.inverse());
  return { x: local.x, y: local.y };
}

/** Arrow keys move focus between sibling nodes: right/down = next, left/up = previous. */
const ARROW_STEP = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

function NodeBase({
  node,
  label,
  className,
  labelClassName,
  onSelect,
  disabled = false,
  selected = false,
  searchHighlight = false,
  motionTransition,
  hitPadding = 10,
  tapSlop = 0,
  hideLabel = false,
  onArrow,
  onDrag,
  onDragEnd,
  instant = false,
}) {
  // className may carry modifiers ("base base--acquired"); element suffixes hang off the base token only.
  const baseClass = className.split(" ")[0];
  const rootClass = [
    className,
    selected ? `${baseClass}--selected` : "",
    searchHighlight ? `${baseClass}--search-hit` : "",
  ]
    .filter(Boolean)
    .join(" ");
  const downRef = useRef(null);
  const draggingRef = useRef(false);
  /** After pointer-up activation (desktop), ignore the synthetic click so secondary pick doesn’t toggle twice. */
  const suppressClickRef = useRef(false);

  function pointerDown(e) {
    if (disabled || tapSlop <= 0) return;
    downRef.current = { x: e.clientX, y: e.clientY };
  }

  function pointerMove(e) {
    if (!onDrag || !downRef.current) return;
    const moved = Math.hypot(e.clientX - downRef.current.x, e.clientY - downRef.current.y);
    if (!draggingRef.current && moved > tapSlop) {
      draggingRef.current = true;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch (_) {
        /* pointer already released: the drag still follows move events on the node */
      }
    }
    if (draggingRef.current) {
      const point = pointerToViewBox(e);
      if (point) onDrag(node, point);
    }
  }

  function endDrag() {
    if (!draggingRef.current) return false;
    draggingRef.current = false;
    downRef.current = null;
    if (onDragEnd) onDragEnd(node);
    return true;
  }

  function pointerUp(e) {
    if (endDrag()) {
      e.stopPropagation();
      return;
    }
    if (disabled) {
      downRef.current = null;
      e.stopPropagation();
      return;
    }
    if (tapSlop > 0 && downRef.current) {
      const d = Math.hypot(e.clientX - downRef.current.x, e.clientY - downRef.current.y);
      downRef.current = null;
      if (d > tapSlop) return;
      e.preventDefault();
      e.stopPropagation();
      onSelect?.(node);
      return;
    }
    if (tapSlop <= 0) {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      e.stopPropagation();
      suppressClickRef.current = true;
      onSelect?.(node);
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    }
  }

  const target = {
    x: node.x,
    y: node.y,
    opacity: searchHighlight ? Math.min(1, (node.opacity ?? 1) * 1.08) : node.opacity ?? 1,
    scale: searchHighlight ? (node.scale ?? 1) * 1.04 : node.scale ?? 1,
  };
  // `instant`: another system (the physics step) owns the position every frame, so it is applied as
  // plain style instead of being animated. (A zero-duration animation from `initial={false}` is
  // never rendered by framer-motion, which left nodes without any transform.)
  const motionProps = instant
    ? { style: target }
    : { initial: false, animate: target, transition: motionTransition };

  return (
    <motion.g
      className={rootClass}
      {...motionProps}
      tabIndex={disabled ? -1 : 0}
      role={disabled ? undefined : "button"}
      aria-label={disabled ? undefined : label}
      onPointerDown={disabled ? undefined : pointerDown}
      onPointerUp={disabled ? undefined : pointerUp}
      onPointerMove={onDrag ? pointerMove : undefined}
      onPointerCancel={
        tapSlop
          ? () => {
              if (!endDrag()) downRef.current = null;
            }
          : undefined
      }
      onClick={(event) => {
        event.stopPropagation();
        if (tapSlop > 0) return;
        if (suppressClickRef.current) return;
        if (!disabled) {
          onSelect?.(node);
        }
      }}
      onKeyDown={(event) => {
        if (disabled) return;
        if (onArrow && ARROW_STEP[event.key]) {
          event.preventDefault();
          event.stopPropagation();
          onArrow(event.currentTarget, ARROW_STEP[event.key]);
          return;
        }
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          event.stopPropagation();
          onSelect?.(node);
        }
      }}
    >
      <circle r={node.radius + hitPadding} className={`${baseClass}__hit`} />
      <circle r={node.radius + 4} className={`${baseClass}__halo`} />
      <circle r={node.radius} className={`${baseClass}__core`} />
      <text textAnchor="middle" dominantBaseline="central" className={`${baseClass}__glyph`}>
        {getNodeInitials(node.name)}
      </text>
      {!hideLabel && (
        <text y={node.radius + 24} textAnchor="middle" className={labelClassName}>
          {truncateLabel(label, 14)}
        </text>
      )}
    </motion.g>
  );
}

/**
 * Memoized so a physics frame only re-renders the nodes whose position actually changed; the parent
 * keeps every other prop stable (cached live nodes, shared transition object, stable callbacks).
 */
const Node = React.memo(NodeBase);

export default function ConnectionsGraph({
  currentUserName,
  innerConnections,
  overflowInnerConnections,
  focusUserId,
  focusedConnection,
  secondaryConnections,
  secondaryLoading,
  onFocusConnection,
  onResetFocus,
  onFocusOverflow,
  onSelectSecondary,
  onSecondaryQuickAdd,
  pendingIntroTargetIds = null,
  selectedSecondaryId,
  focusExtras = null,
  focusSearchSlot = null,
  t,
  immersive = false,
  statsSummary = null,
  immersiveStatsKey = null,
  requestsSlot = null,
  secondarySearchActive = false,
  renderAsk = null,
}) {
  const prefersReducedMotion = useReducedMotion();
  const narrowViewport = useMediaQuery("(max-width: 767px)");
  // Touch targets stay generous on phones and on any coarse pointer (tablets, touch laptops).
  const coarsePointer = useMediaQuery("(pointer: coarse)");
  const touchTargets = narrowViewport || coarsePointer;
  // One modal at a time: null | "sheet" | "search" | "ask"
  const [overlay, setOverlay] = useState(null);
  const sheetOpen = overlay === "sheet";
  const branchSearchOpen = overlay === "search";
  const askOpen = overlay === "ask" && Boolean(renderAsk);
  const closeOverlay = useCallback(() => setOverlay(null), []);
  const sheetRef = useRef(null);
  const searchOverlayRef = useRef(null);
  const askOverlayRef = useRef(null);
  const detailsFabRef = useRef(null);
  const searchFabRef = useRef(null);
  const askFabRef = useRef(null);
  const [freeLayout, setFreeLayout] = useState(readFreeLayoutPreference);
  const toggleFreeLayout = useCallback(() => {
    setFreeLayout((current) => {
      writeFreeLayoutPreference(!current);
      return !current;
    });
  }, []);
  const [heroStatGlitch, setHeroStatGlitch] = useState(false);
  const prevImmersiveStatsKeyRef = useRef(null);

  const pinchDisabled = !immersive || prefersReducedMotion || Boolean(overlay);
  const { viewportRef, transformStyle, consumeShouldIgnoreTap, resetTransform, scale } = usePinchPanZoom({
    disabled: pinchDisabled,
  });

  useEffect(() => {
    if (!immersive || immersiveStatsKey == null) return undefined;
    const changed = prevImmersiveStatsKeyRef.current !== immersiveStatsKey;
    prevImmersiveStatsKeyRef.current = immersiveStatsKey;
    if (!changed) return undefined;
    setHeroStatGlitch(true);
    const id = window.setTimeout(() => setHeroStatGlitch(false), 680);
    return () => window.clearTimeout(id);
  }, [immersive, immersiveStatsKey]);

  useEffect(() => {
    if (!focusUserId) setOverlay((current) => (current === "search" ? null : current));
  }, [focusUserId]);

  // Escape with no modal open clears the focused branch (an open modal handles Escape itself first).
  useEffect(() => {
    if (!immersive || !focusUserId || overlay) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") onResetFocus?.();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [immersive, focusUserId, overlay, onResetFocus]);

  const moveInnerFocus = useCallback((from, delta) => {
    const svg = from.closest("svg");
    if (!svg) return;
    const nodes = Array.from(svg.querySelectorAll(".connections__inner-node[tabindex]"));
    const index = nodes.indexOf(from);
    if (index < 0 || nodes.length < 2) return;
    nodes[(index + delta + nodes.length) % nodes.length].focus();
  }, []);

  useModalOverlay({
    open: sheetOpen,
    onClose: closeOverlay,
    panelRef: sheetRef,
    returnFocusRef: detailsFabRef,
    getInitialFocus: () => sheetRef.current?.querySelector(".connections__sheet-handle"),
  });
  useModalOverlay({
    open: branchSearchOpen,
    onClose: closeOverlay,
    panelRef: searchOverlayRef,
    returnFocusRef: searchFabRef,
    getInitialFocus: () => document.getElementById("connections-unified-secondary-search"),
  });
  useModalOverlay({
    open: askOpen,
    onClose: closeOverlay,
    panelRef: askOverlayRef,
    returnFocusRef: askFabRef,
    getInitialFocus: () => document.getElementById("connections-ask-input"),
  });

  const nodeMotionTransition = useMemo(
    () =>
      prefersReducedMotion
        ? { duration: 0.12, ease: "linear" }
        : { type: "spring", stiffness: 280, damping: 26 },
    [prefersReducedMotion]
  );

  const edgeMotionTransition = (duration) =>
    prefersReducedMotion ? { duration: 0.1, ease: "linear" } : { duration };

  const innerHitPadding = touchTargets ? NODE_HIT_PADDING : 10;

  const innerLayoutOptions = useMemo(
    () => (immersive && focusUserId ? { layoutMode: "focus_hub" } : undefined),
    [immersive, focusUserId]
  );
  const innerRestLayout = useMemo(
    () => getInnerRingLayout(innerConnections, focusUserId, innerLayoutOptions),
    [innerConnections, focusUserId, innerLayoutOptions]
  );
  const focusHubActive = useMemo(
    () =>
      immersive &&
      Boolean(focusUserId) &&
      innerConnections.some((n) => String(n.id) === String(focusUserId)),
    [immersive, focusUserId, innerConnections]
  );
  const youRestLayout = useMemo(() => {
    if (!focusHubActive) return null;
    return getCurrentUserFocusHubLayout(innerConnections, focusUserId);
  }, [focusHubActive, innerConnections, focusUserId]);
  const focusPresentationAngle = useMemo(
    () => (focusUserId ? pickFocusPresentationAngle(innerConnections, focusUserId) : null),
    [innerConnections, focusUserId]
  );
  const visibleSecondary = useMemo(
    () => secondaryConnections.slice(0, MAX_VISIBLE_SECONDARY),
    [secondaryConnections]
  );
  const secondaryRestLayout = useMemo(
    () => getSecondaryRingLayout(visibleSecondary, focusPresentationAngle),
    [visibleSecondary, focusPresentationAngle]
  );

  // Free-form layout: physics moves nodes around the rest layout above; the centre glyph (You, or
  // the focused peer in hub mode) is a fixed obstacle. Off by default.
  const freeLayoutOn = immersive && freeLayout;
  const physicsNodes = useMemo(() => {
    const list = [{ id: "__hub__", x: GRAPH_CENTER, y: GRAPH_CENTER, radius: 38, fixed: true }];
    innerRestLayout.forEach((n) => {
      if (focusHubActive && n.isFocused) return;
      list.push({ id: `i:${n.id}`, x: n.x, y: n.y, radius: n.radius * (n.scale ?? 1) });
    });
    secondaryRestLayout.forEach((n) =>
      list.push({ id: `s:${n.id}`, x: n.x, y: n.y, radius: n.radius * (n.scale ?? 1) })
    );
    if (youRestLayout) list.push({ id: "you", x: youRestLayout.x, y: youRestLayout.y, radius: 18 });
    return list;
  }, [innerRestLayout, secondaryRestLayout, youRestLayout, focusHubActive]);
  const { positions, pin, release } = useForceLayout({
    enabled: freeLayoutOn,
    nodes: physicsNodes,
    reducedMotion: Boolean(prefersReducedMotion),
  });

  const liveCache = useRef(new Map());
  const innerLayout = useMemo(
    () => innerRestLayout.map((n) => withLivePosition(positions, `i:${n.id}`, n, liveCache.current)),
    [innerRestLayout, positions]
  );
  const secondaryLayout = useMemo(
    () => secondaryRestLayout.map((n) => withLivePosition(positions, `s:${n.id}`, n, liveCache.current)),
    [secondaryRestLayout, positions]
  );
  const youHubLayout = useMemo(
    () => (youRestLayout ? withLivePosition(positions, "you", youRestLayout, liveCache.current) : null),
    [youRestLayout, positions]
  );
  const youNodeForHub = useMemo(() => {
    if (!youHubLayout) return null;
    return {
      ...youHubLayout,
      id: "__you__",
      name: currentUserName || t("connections.you"),
      peerIntroduced: false,
      strength: 0,
    };
  }, [youHubLayout, currentUserName, t]);

  // Stable per node kind (the node argument carries the id) so memoized nodes are not re-rendered.
  const dragInner = useCallback((node, point) => pin(`i:${node.id}`, point.x, point.y), [pin]);
  const dragInnerEnd = useCallback((node) => release(`i:${node.id}`), [release]);
  const dragSecondary = useCallback((node, point) => pin(`s:${node.id}`, point.x, point.y), [pin]);
  const dragSecondaryEnd = useCallback((node) => release(`s:${node.id}`), [release]);
  const dragYou = useCallback((_node, point) => pin("you", point.x, point.y), [pin]);
  const dragYouEnd = useCallback(() => release("you"), [release]);
  const hiddenSecondaryCount = Math.max(0, secondaryConnections.length - visibleSecondary.length);
  const focusedLayoutNode = innerLayout.find((item) => item.isFocused) || null;
  // The selected person's path is You → focused inner peer → them; only drawn when they are on screen.
  const pathSecondaryId =
    selectedSecondaryId && secondaryLayout.some((n) => n.id === selectedSecondaryId)
      ? selectedSecondaryId
      : null;
  const centerHubName = focusHubActive
    ? focusedConnection?.name || focusedLayoutNode?.name || currentUserName || t("connections.you")
    : currentUserName || t("connections.you");
  const centerHubCaption = focusHubActive ? t("connections.inner") : t("connections.you");

  const secondarySearchHighlight =
    Boolean(secondarySearchActive) && secondaryConnections.length > 0 && !secondaryLoading;

  const tapSlop = immersive ? 14 : 0;

  const graphSvg = (
    <svg
      className="connections__graph-svg"
      viewBox={`0 0 ${GRAPH_VIEWBOX} ${GRAPH_VIEWBOX}`}
      aria-label={t("connections.graphTitle")}
    >
      <rect
        className="connections__graph-svg-bg"
        width={GRAPH_VIEWBOX}
        height={GRAPH_VIEWBOX}
        fill="transparent"
      />
      <defs>
        <linearGradient id="connections-quickadd-bevel" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(255,255,255,0.38)" />
          <stop offset="42%" stopColor="rgba(188,162,248,0.32)" />
          <stop offset="100%" stopColor="rgba(120,90,190,0.26)" />
        </linearGradient>
      </defs>
      <circle cx={GRAPH_CENTER} cy={GRAPH_CENTER} r="144" className="connections__guide-ring" />
      <circle
        cx={GRAPH_CENTER}
        cy={GRAPH_CENTER}
        r="86"
        className="connections__guide-ring connections__guide-ring--inner"
      />

      {innerLayout.map((node) => {
        if (focusHubActive && node.isFocused) return null;
        return (
          <motion.line
            key={`edge-${node.id}`}
            x1={GRAPH_CENTER}
            y1={GRAPH_CENTER}
            x2={node.x}
            y2={node.y}
            className="connections__edge connections__edge--inner"
            initial={false}
            animate={{ opacity: focusUserId && !node.isFocused ? 0.1 : 0.45 }}
            transition={edgeMotionTransition(0.2)}
          />
        );
      })}
      {focusHubActive && youHubLayout && (
        <motion.line
          key="edge-current-user"
          x1={GRAPH_CENTER}
          y1={GRAPH_CENTER}
          x2={youHubLayout.x}
          y2={youHubLayout.y}
          className={
            "connections__edge connections__edge--inner" + (pathSecondaryId ? " connections__edge--path" : "")
          }
          initial={false}
          animate={{ opacity: pathSecondaryId ? 0.95 : 0.45 }}
          transition={edgeMotionTransition(0.2)}
        />
      )}

      {focusUserId &&
        secondaryLayout.map((node) => (
          <motion.line
            key={`secondary-edge-${node.id}`}
            x1={focusedLayoutNode?.x ?? GRAPH_CENTER}
            y1={focusedLayoutNode?.y ?? GRAPH_CENTER}
            x2={node.x}
            y2={node.y}
            className={
              "connections__edge connections__edge--secondary" +
              (node.id === pathSecondaryId ? " connections__edge--path" : "")
            }
            initial={prefersReducedMotion ? false : { opacity: 0 }}
            animate={{
              opacity: pathSecondaryId
                ? node.id === pathSecondaryId
                  ? 0.95
                  : 0.18
                : secondarySearchHighlight
                  ? 0.58
                  : 0.46,
            }}
            transition={edgeMotionTransition(0.22)}
          />
        ))}

      {focusUserId && secondaryLoading && (
        <text x={GRAPH_CENTER} y={52} textAnchor="middle" className="connections__status-label">
          {t("connections.loadingBranch")}
        </text>
      )}

      {focusUserId &&
        !secondaryLoading &&
        secondaryLayout.length === 0 &&
        focusedConnection && (
          <text x={GRAPH_CENTER} y={52} textAnchor="middle" className="connections__status-label">
            {t("connections.noSecondary")}
          </text>
        )}

      <g className="connections__center-node">
        <circle cx={GRAPH_CENTER} cy={GRAPH_CENTER} r="48" className="connections__center-glow" />
        <circle cx={GRAPH_CENTER} cy={GRAPH_CENTER} r="34" className="connections__center-core" />
        <text x={GRAPH_CENTER} y={GRAPH_CENTER - 4} textAnchor="middle" className="connections__center-name">
          {truncateLabel(centerHubName, 18)}
        </text>
        <text x={GRAPH_CENTER} y={GRAPH_CENTER + 18} textAnchor="middle" className="connections__center-caption">
          {centerHubCaption}
        </text>
      </g>

      {/* Secondary bodies first; quick-add next; inner ring last so mouse/touch hits faded inners over overlapping branch UI. */}
      {secondaryLayout.map((node) => (
        <g key={`secondary-wrap-${node.id}`} className="connections__secondary-branch">
          <Node
            node={node}
            label={node.name}
            className="connections__secondary-node"
            labelClassName="connections__secondary-label"
            onSelect={onSelectSecondary}
            disabled={!onSelectSecondary}
            selected={Boolean(selectedSecondaryId && selectedSecondaryId === node.id)}
            searchHighlight={secondarySearchHighlight}
            motionTransition={nodeMotionTransition}
            instant={freeLayoutOn}
            onDrag={freeLayoutOn ? dragSecondary : undefined}
            onDragEnd={freeLayoutOn ? dragSecondaryEnd : undefined}
            hitPadding={touchTargets ? Math.max(12, NODE_HIT_PADDING - 2) : 10}
            tapSlop={immersive ? tapSlop : 0}
            hideLabel
          />
        </g>
      ))}

      {secondaryLayout.map((node) => {
        const targetKey = node.rawId != null ? String(node.rawId) : "";
        const hasPendingLookup =
          pendingIntroTargetIds &&
          typeof pendingIntroTargetIds.has === "function" &&
          targetKey;
        const tripletPending = hasPendingLookup ? pendingIntroTargetIds.has(targetKey) : false;
        const showChip = Boolean(onSecondaryQuickAdd && !tripletPending);
        if (!showChip) return null;
        return (
          <g
            key={`secondary-quickadd-${node.id}`}
            role="button"
            tabIndex={0}
            aria-label={t("connections.graphQuickAddAria")}
            className="connections__secondary-quickadd"
            transform={`translate(${node.x + node.radius * 0.92}, ${node.y - node.radius * 0.92})`}
            onClick={(e) => {
              e.stopPropagation();
              onSecondaryQuickAdd(node);
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                onSecondaryQuickAdd(node);
              }
            }}
          >
            <circle r={14} className="connections__secondary-quickadd-hit" />
            <circle r={8} className="connections__secondary-quickadd-face" fill="url(#connections-quickadd-bevel)" />
            <text textAnchor="middle" dominantBaseline="central" className="connections__secondary-quickadd-plus">
              +
            </text>
          </g>
        );
      })}

      {innerLayout
        .filter((node) => !(focusHubActive && node.isFocused))
        .map((node) => (
          <Node
            key={`inner-node-${node.id}`}
            node={node}
            label={node.name}
            className={
              "connections__inner-node" +
              (node.peerIntroduced ? " connections__inner-node--acquired" : "") +
              (focusHubActive && !node.isFocused ? " connections__inner-node--dimmed" : "")
            }
            labelClassName="connections__inner-label"
            onSelect={onFocusConnection}
            onArrow={moveInnerFocus}
            motionTransition={nodeMotionTransition}
            instant={freeLayoutOn}
            onDrag={freeLayoutOn ? dragInner : undefined}
            onDragEnd={freeLayoutOn ? dragInnerEnd : undefined}
            hitPadding={innerHitPadding}
            tapSlop={tapSlop}
          />
        ))}
      {focusHubActive && youNodeForHub && (
        <Node
          key="inner-node-you"
          node={youNodeForHub}
          label={youNodeForHub.name}
          className="connections__inner-node connections__inner-node--you"
          labelClassName="connections__inner-label"
          onSelect={() => onResetFocus?.()}
          onArrow={moveInnerFocus}
          motionTransition={nodeMotionTransition}
          instant={freeLayoutOn}
          onDrag={freeLayoutOn ? dragYou : undefined}
          onDragEnd={freeLayoutOn ? dragYouEnd : undefined}
          hitPadding={innerHitPadding}
          tapSlop={tapSlop}
        />
      )}

      {secondaryLayout.map((node) => (
        <text
          key={`secondary-label-${node.id}`}
          x={node.x}
          y={node.y + node.radius + 24}
          textAnchor="middle"
          className={
            "connections__secondary-label connections__secondary-label--floating" +
            (secondarySearchHighlight ? " connections__secondary-label--search-hit" : "")
          }
          data-testid="secondary-floating-label"
        >
          {truncateLabel(node.name, 14)}
        </text>
      ))}

      {focusUserId && hiddenSecondaryCount > 0 && (
        <g className="connections__overflow-chip" transform={`translate(${GRAPH_CENTER} 30)`}>
          <rect x="-46" y="-14" width="92" height="28" rx="14" />
          <text textAnchor="middle" dominantBaseline="middle">
            +{hiddenSecondaryCount} {t("connections.moreSecondary")}
          </text>
        </g>
      )}
    </svg>
  );

  const focusCard = (
    <div className="connections__focus-card">
      {!focusedConnection && (
        <>
          <h3 className="connections__focus-title">{t("connections.defaultFocusTitle")}</h3>
          <p className="connections__focus-body">{t("connections.defaultFocusBody")}</p>
        </>
      )}

      {focusedConnection && (
        <>
          <div className="connections__focus-header">
            <div>
              <h3 className="connections__focus-title">{focusedConnection.name}</h3>
              <p className="connections__focus-meta">
                {[focusedConnection.jobRole, focusedConnection.industry].filter(Boolean).join(" / ") ||
                  t("connections.inner")}
              </p>
            </div>
            <button type="button" className="connections__reset-btn" onClick={onResetFocus}>
              {t("connections.reset")}
            </button>
          </div>
          <p className="connections__focus-body">
            {secondaryLoading
              ? t("connections.loadingBranch")
              : t("connections.focusSummary").replace("{count}", String(secondaryConnections.length))}
          </p>
          {focusSearchSlot && !immersive ? (
            <div className="connections__focus-search" onClick={(e) => e.stopPropagation()}>
              {focusSearchSlot}
            </div>
          ) : null}
          {focusExtras}
        </>
      )}
    </div>
  );

  const overflowPanel =
    overflowInnerConnections.length > 0 ? (
      <div className="connections__overflow-panel">
        <div className="connections__overflow-header">
          <h3 className="connections__overflow-title">{t("connections.moreConnections")}</h3>
          <span className="connections__overflow-count">{overflowInnerConnections.length}</span>
        </div>
        <div className="connections__overflow-list">
          {overflowInnerConnections.map((node) => (
            <button
              type="button"
              key={`overflow-${node.id}`}
              className="connections__overflow-button"
              onClick={() => onFocusOverflow(node)}
            >
              <span className="connections__overflow-button-name">{truncateLabel(node.name, 18)}</span>
              {node.jobRole && (
                <span className="connections__overflow-button-meta">{truncateLabel(node.jobRole, 18)}</span>
              )}
            </button>
          ))}
        </div>
      </div>
    ) : null;

  if (immersive) {
    const heroContextLine = focusUserId ? t("connections.heroLineFocus") : t("connections.heroLineOverview");
    const dockStatsClass =
      "connections__immersive-dock-stats" +
      (heroStatGlitch ? " connections__immersive-hero-stats--glitch" : "");

    return (
      <section className="connections__graph-shell connections__graph-shell--immersive">
        <div
          className="connections__graph-stage connections__graph-stage--immersive"
          role="presentation"
          onClick={(e) => {
            if (consumeShouldIgnoreTap()) return;
            if (graphClickWasOnInteractiveSurface(e.nativeEvent)) return;
            onResetFocus();
          }}
        >
          <div className="connections__immersive-hero-wrap">
            <div
              className="connections__immersive-hero-capsule connections__immersive-hero-capsule--minimal"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div className="connections__immersive-hero-head">
                <p className="connections__immersive-hero-line">{heroContextLine}</p>
                <button
                  type="button"
                  className="connections__layout-toggle"
                  aria-pressed={freeLayout}
                  onClick={toggleFreeLayout}
                >
                  {t("connections.layoutFree")}
                </button>
                {!pinchDisabled && scale > 1.06 && (
                  <button
                    type="button"
                    className="connections__zoom-reset connections__zoom-reset--hero"
                    onClick={() => resetTransform()}
                  >
                    {t("connections.resetZoom")}
                  </button>
                )}
              </div>
            </div>
          </div>
          <div ref={viewportRef} className="connections__pinch-inner" style={transformStyle}>
            <div className="connections__svg-fit">{graphSvg}</div>
          </div>
        </div>

        {statsSummary ? (
          <div
            className="connections__immersive-bottom-dock"
            aria-label={t("connections.networkSummary")}
          >
            <div className={dockStatsClass}>{statsSummary}</div>
          </div>
        ) : null}

        {/* Stays mounted while an overlay is open so focus has a real element to return to. */}
        <div
          className={
            "connections__immersive-fab-dock" + (overlay ? " connections__immersive-fab-dock--hidden" : "")
          }
        >
          {renderAsk ? (
            <button
              ref={askFabRef}
              type="button"
              className="connections__fab connections__fab--ask"
              aria-label={t("connections.askFabAria")}
              onClick={() => setOverlay("ask")}
            >
              {t("connections.askFabLabel")}
            </button>
          ) : null}
          <button
            ref={searchFabRef}
            type="button"
            className="connections__fab connections__fab--branch-search"
            aria-label={t("connections.branchSearchFabAria")}
            onClick={() => setOverlay("search")}
          >
            {t("connections.branchSearchFabLabel")}
          </button>
          <button
            ref={detailsFabRef}
            type="button"
            className="connections__fab"
            aria-label={t("connections.heroFabAria")}
            onClick={() => setOverlay("sheet")}
          >
            {t("connections.expandDetails")}
          </button>
        </div>

        {immersive && askOpen ? (
          <div ref={askOverlayRef} className="connections__branch-search-overlay" role="presentation">
            <button
              type="button"
              className="connections__branch-search-dismiss"
              aria-label={t("connections.askCloseAria")}
              onClick={closeOverlay}
            />
            <div
              className="connections__branch-search-modal connections__ask-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="connections-ask-title"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div className="connections__branch-search-beam" aria-hidden />
              <div className="connections__branch-search-head">
                <span id="connections-ask-title" className="connections__branch-search-title">
                  {t("connections.askTitle")}
                </span>
                <button
                  type="button"
                  className="connections__branch-search-close"
                  aria-label={t("connections.askCloseAria")}
                  onClick={closeOverlay}
                >
                  ×
                </button>
              </div>
              {renderAsk({ close: closeOverlay })}
            </div>
          </div>
        ) : null}

        {immersive && branchSearchOpen ? (
          <div ref={searchOverlayRef} className="connections__branch-search-overlay" role="presentation">
            <button
              type="button"
              className="connections__branch-search-dismiss"
              aria-label={t("connections.branchSearchDismissAria")}
              onClick={closeOverlay}
            />
            <div
              className="connections__branch-search-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="connections-branch-search-title"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div className="connections__branch-search-beam" aria-hidden />
              <div className="connections__branch-search-head">
                <span id="connections-branch-search-title" className="connections__branch-search-title">
                  {t("connections.branchSearchTitle")}
                </span>
                <button
                  type="button"
                  className="connections__branch-search-close"
                  aria-label={t("connections.branchSearchCloseAria")}
                  onClick={closeOverlay}
                >
                  ×
                </button>
              </div>
              {focusSearchSlot ? (
                <>
                  <div className="connections__branch-search-field">{focusSearchSlot}</div>
                  <p className="connections__branch-search-hint">{t("connections.branchSearchHint")}</p>
                  <ul className="connections__branch-search-results" aria-label={t("connections.branchSearchResultsAria")}>
                    {!secondaryLoading && !secondarySearchActive ? (
                      <li className="connections__branch-search-results__meta">
                        {t("connections.branchSearchTypeHint")}
                      </li>
                    ) : null}
                    {secondaryLoading && secondarySearchActive ? (
                      <li className="connections__branch-search-results__meta">{t("connections.loadingBranch")}</li>
                    ) : null}
                    {!secondaryLoading &&
                    secondarySearchActive &&
                    focusUserId &&
                    secondaryConnections.length === 0 ? (
                      <li className="connections__branch-search-results__meta">
                        {t("connections.noSecondaryUnified")}
                      </li>
                    ) : null}
                    {!secondaryLoading && secondarySearchActive && focusUserId && secondaryConnections.length > 0
                      ? secondaryConnections.slice(0, 14).map((row) => (
                          <li key={`branch-search-hit-${row.id}`}>
                            <button
                              type="button"
                              className="connections__branch-search-result-btn"
                              onClick={() => {
                                onSelectSecondary?.(row);
                                closeOverlay();
                                resetTransform();
                              }}
                            >
                              <span className="connections__branch-search-result-name">
                                {truncateLabel(row.name, 28)}
                              </span>
                              <span className="connections__branch-search-result-meta">
                                {[row.jobRole, row.industry].filter(Boolean).join(" · ") || t("connections.secondary")}
                              </span>
                            </button>
                          </li>
                        ))
                      : null}
                  </ul>
                </>
              ) : (
                <p className="connections__branch-search-need-focus">{t("connections.branchSearchNeedFocus")}</p>
              )}
            </div>
          </div>
        ) : null}
        {sheetOpen ? <div className="connections__sheet-scrim" data-modal-keep onClick={closeOverlay} aria-hidden /> : null}
        <div
          ref={sheetRef}
          className={
            "connections__sheet" +
            " connections__sheet--overlay" +
            (sheetOpen ? " connections__sheet--open" : " connections__sheet--closed")
          }
          role={sheetOpen ? "dialog" : undefined}
          aria-modal={sheetOpen ? "true" : undefined}
          aria-label={sheetOpen ? t("connections.sheetDialogAria") : undefined}
          aria-hidden={!sheetOpen}
        >
          <div className="connections__sheet-static">{focusCard}</div>
          {sheetOpen ? (
            <button
              type="button"
              className="connections__sheet-handle"
              onClick={closeOverlay}
              aria-expanded={sheetOpen}
            >
              <span className="connections__sheet-handle-bar" aria-hidden />
              <span className="connections__sheet-handle-label">{t("connections.sheetPullHint")}</span>
            </button>
          ) : null}
          <div className="connections__sheet-scroll">
            {overflowPanel}
            {requestsSlot ? <div className="connections__sheet-requests">{requestsSlot}</div> : null}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="connections__graph-shell">
      <div className="connections__graph-copy">
        <div>
          <p className="connections__eyebrow">{t("connections.graphEyebrow")}</p>
          <h2 className="connections__graph-title">{t("connections.graphTitle")}</h2>
        </div>
        <p className="connections__graph-summary">
          {focusUserId ? t("connections.focusActive") : t("connections.graphIntro")}
        </p>
      </div>

      <div
        className="connections__graph-stage"
        onClick={(e) => {
          if (graphClickWasOnInteractiveSurface(e.nativeEvent)) return;
          onResetFocus();
        }}
        role="presentation"
      >
        {graphSvg}
      </div>

      {focusCard}

      {overflowPanel}
    </section>
  );
}
