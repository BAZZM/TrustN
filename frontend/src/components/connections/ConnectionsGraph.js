import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { usePinchPanZoom } from "../../hooks/usePinchPanZoom";
import useModalOverlay from "../../hooks/useModalOverlay";
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

function Node({
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
  /** After pointer-up activation (desktop), ignore the synthetic click so secondary pick doesn’t toggle twice. */
  const suppressClickRef = useRef(false);

  function pointerDown(e) {
    if (disabled || tapSlop <= 0) return;
    downRef.current = { x: e.clientX, y: e.clientY };
  }

  function pointerUp(e) {
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

  return (
    <motion.g
      className={rootClass}
      initial={false}
      animate={{
        x: node.x,
        y: node.y,
        opacity: searchHighlight ? Math.min(1, (node.opacity ?? 1) * 1.08) : node.opacity ?? 1,
        scale: searchHighlight ? (node.scale ?? 1) * 1.04 : node.scale ?? 1,
      }}
      transition={motionTransition}
      tabIndex={disabled ? -1 : 0}
      role={disabled ? undefined : "button"}
      aria-label={disabled ? undefined : label}
      onPointerDown={disabled ? undefined : pointerDown}
      onPointerUp={disabled ? undefined : pointerUp}
      onPointerCancel={tapSlop ? () => { downRef.current = null; } : undefined}
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
}) {
  const prefersReducedMotion = useReducedMotion();
  const [narrowViewport, setNarrowViewport] = useState(false);
  // One modal at a time: null | "sheet" | "search"
  const [overlay, setOverlay] = useState(null);
  const sheetOpen = overlay === "sheet";
  const branchSearchOpen = overlay === "search";
  const closeOverlay = useCallback(() => setOverlay(null), []);
  const sheetRef = useRef(null);
  const searchOverlayRef = useRef(null);
  const detailsFabRef = useRef(null);
  const searchFabRef = useRef(null);
  const [heroStatGlitch, setHeroStatGlitch] = useState(false);
  const prevImmersiveStatsKeyRef = useRef(null);

  const pinchDisabled = !immersive || prefersReducedMotion || Boolean(overlay);
  const { viewportRef, transformStyle, consumeShouldIgnoreTap, resetTransform, scale } = usePinchPanZoom({
    disabled: pinchDisabled,
  });

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const apply = () => setNarrowViewport(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

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

  const nodeMotionTransition = prefersReducedMotion
    ? { duration: 0.12, ease: "linear" }
    : { type: "spring", stiffness: 280, damping: 26 };

  const edgeMotionTransition = (duration) =>
    prefersReducedMotion ? { duration: 0.1, ease: "linear" } : { duration };

  const innerHitPadding = narrowViewport ? NODE_HIT_PADDING : 10;

  const innerLayoutOptions = useMemo(
    () => (immersive && focusUserId ? { layoutMode: "focus_hub" } : undefined),
    [immersive, focusUserId]
  );
  const innerLayout = useMemo(
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
  const youHubLayout = useMemo(() => {
    if (!focusHubActive) return null;
    return getCurrentUserFocusHubLayout(innerConnections, focusUserId);
  }, [focusHubActive, innerConnections, focusUserId]);
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
  const focusPresentationAngle = useMemo(
    () => (focusUserId ? pickFocusPresentationAngle(innerConnections, focusUserId) : null),
    [innerConnections, focusUserId]
  );
  const visibleSecondary = secondaryConnections.slice(0, MAX_VISIBLE_SECONDARY);
  const secondaryLayout = useMemo(
    () => getSecondaryRingLayout(visibleSecondary, focusPresentationAngle),
    [visibleSecondary, focusPresentationAngle]
  );
  const hiddenSecondaryCount = Math.max(0, secondaryConnections.length - visibleSecondary.length);
  const focusedLayoutNode = innerLayout.find((item) => item.isFocused) || null;
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
          className="connections__edge connections__edge--inner"
          initial={false}
          animate={{ opacity: 0.45 }}
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
            className="connections__edge connections__edge--secondary"
            initial={prefersReducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: secondarySearchHighlight ? 0.58 : 0.46 }}
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
            hitPadding={narrowViewport ? Math.max(12, NODE_HIT_PADDING - 2) : 10}
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
              (node.peerIntroduced ? " connections__inner-node--acquired" : "")
            }
            labelClassName="connections__inner-label"
            onSelect={onFocusConnection}
            motionTransition={nodeMotionTransition}
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
          motionTransition={nodeMotionTransition}
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
