import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { usePinchPanZoom } from "../../hooks/usePinchPanZoom";
import {
  GRAPH_CENTER,
  GRAPH_VIEWBOX,
  MAX_VISIBLE_SECONDARY,
  NODE_HIT_PADDING,
  getInnerRingLayout,
  getNodeInitials,
  getSecondaryRingLayout,
  truncateLabel,
} from "./graphLayout";

function Node({
  node,
  label,
  className,
  labelClassName,
  onSelect,
  disabled = false,
  selected = false,
  motionTransition,
  hitPadding = 10,
  tapSlop = 0,
}) {
  const rootClass = [className, selected ? `${className}--selected` : ""].filter(Boolean).join(" ");
  const downRef = useRef(null);

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
      e.stopPropagation();
      onSelect?.(node);
    }
  }

  return (
    <motion.g
      className={rootClass}
      initial={false}
      animate={{ x: node.x, y: node.y, opacity: node.opacity ?? 1, scale: node.scale ?? 1 }}
      transition={motionTransition}
      tabIndex={disabled ? -1 : 0}
      role={disabled ? undefined : "button"}
      aria-label={disabled ? undefined : label}
      onPointerDown={tapSlop ? pointerDown : undefined}
      onPointerUp={tapSlop ? pointerUp : undefined}
      onPointerCancel={tapSlop ? () => { downRef.current = null; } : undefined}
      onClick={(event) => {
        event.stopPropagation();
        if (tapSlop) return;
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
      <circle r={node.radius + hitPadding} className={`${className}__hit`} />
      <circle r={node.radius + 4} className={`${className}__halo`} />
      <circle r={node.radius} className={`${className}__core`} />
      <text textAnchor="middle" dominantBaseline="central" className={`${className}__glyph`}>
        {getNodeInitials(node.name)}
      </text>
      <text y={node.radius + 24} textAnchor="middle" className={labelClassName}>
        {truncateLabel(label, 14)}
      </text>
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
  requestsSlot = null,
}) {
  const prefersReducedMotion = useReducedMotion();
  const [narrowViewport, setNarrowViewport] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  const pinchDisabled = !immersive || prefersReducedMotion;
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

  const nodeMotionTransition = prefersReducedMotion
    ? { duration: 0.12, ease: "linear" }
    : { type: "spring", stiffness: 280, damping: 26 };

  const edgeMotionTransition = (duration) =>
    prefersReducedMotion ? { duration: 0.1, ease: "linear" } : { duration };

  const innerHitPadding = narrowViewport ? NODE_HIT_PADDING : 10;

  const innerLayout = useMemo(
    () => getInnerRingLayout(innerConnections, focusUserId),
    [innerConnections, focusUserId]
  );
  const visibleSecondary = secondaryConnections.slice(0, MAX_VISIBLE_SECONDARY);
  const secondaryLayout = useMemo(
    () => getSecondaryRingLayout(visibleSecondary),
    [visibleSecondary]
  );
  const hiddenSecondaryCount = Math.max(0, secondaryConnections.length - visibleSecondary.length);
  const focusedLayoutNode = innerLayout.find((item) => item.isFocused) || null;

  const tapSlop = immersive ? 14 : 0;

  const graphSvg = (
    <svg
      className="connections__graph-svg"
      viewBox={`0 0 ${GRAPH_VIEWBOX} ${GRAPH_VIEWBOX}`}
      aria-label={t("connections.graphTitle")}
    >
      <rect width={GRAPH_VIEWBOX} height={GRAPH_VIEWBOX} fill="transparent" />
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

      {innerLayout.map((node) => (
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
      ))}

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
            animate={{ opacity: 0.46 }}
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
          {truncateLabel(currentUserName || t("connections.you"), 18)}
        </text>
        <text x={GRAPH_CENTER} y={GRAPH_CENTER + 18} textAnchor="middle" className="connections__center-caption">
          {t("connections.you")}
        </text>
      </g>

      {innerLayout.map((node) => (
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

      {secondaryLayout.map((node) => {
        const targetKey = node.rawId != null ? String(node.rawId) : "";
        const hasPendingLookup =
          pendingIntroTargetIds &&
          typeof pendingIntroTargetIds.has === "function" &&
          targetKey;
        const tripletPending = hasPendingLookup ? pendingIntroTargetIds.has(targetKey) : false;
        const showChip = Boolean(onSecondaryQuickAdd && !tripletPending);

        return (
          <g key={`secondary-wrap-${node.id}`} className="connections__secondary-branch">
            <Node
              node={node}
              label={node.name}
              className="connections__secondary-node"
              labelClassName="connections__secondary-label"
              onSelect={onSelectSecondary}
              disabled={!onSelectSecondary}
              selected={Boolean(selectedSecondaryId && selectedSecondaryId === node.id)}
              motionTransition={nodeMotionTransition}
              hitPadding={narrowViewport ? Math.max(12, NODE_HIT_PADDING - 2) : 10}
              tapSlop={immersive ? tapSlop : 0}
            />
            {showChip ? (
              <g
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
            ) : null}
          </g>
        );
      })}

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
          {focusSearchSlot ? (
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
    return (
      <section className="connections__graph-shell connections__graph-shell--immersive">
        <div
          ref={viewportRef}
          className="connections__graph-stage connections__graph-stage--immersive"
          role="presentation"
          onClick={() => {
            if (consumeShouldIgnoreTap()) return;
            onResetFocus();
          }}
        >
          <div className="connections__pinch-inner" style={transformStyle}>
            <div className="connections__svg-fit">{graphSvg}</div>
          </div>
        </div>

        <div className="connections__immersive-hud">
          <div className="connections__immersive-hud-top">
            <div className="connections__immersive-hud-copy">
              <p className="connections__eyebrow">{t("connections.graphEyebrow")}</p>
              <h2 className="connections__graph-title connections__graph-title--immersive">
                {t("connections.graphTitle")}
              </h2>
              <p className="connections__graph-summary connections__graph-summary--immersive">
                {focusUserId ? t("connections.focusActive") : t("connections.graphIntro")}
              </p>
            </div>
            {!pinchDisabled && scale > 1.06 && (
              <button type="button" className="connections__zoom-reset" onClick={() => resetTransform()}>
                {t("connections.resetZoom")}
              </button>
            )}
          </div>
          {statsSummary ? (
            <div className="connections__immersive-stats" aria-label={t("connections.networkSummary")}>
              {statsSummary}
            </div>
          ) : null}
        </div>

        <div
          className={
            "connections__sheet" +
            (sheetOpen ? " connections__sheet--open" : "")
          }
        >
          <div className="connections__sheet-static">{focusCard}</div>
          <button
            type="button"
            className="connections__sheet-handle"
            onClick={() => setSheetOpen((o) => !o)}
            aria-expanded={sheetOpen}
          >
            <span className="connections__sheet-handle-bar" aria-hidden />
            <span className="connections__sheet-handle-label">{t("connections.sheetPullHint")}</span>
          </button>
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

      <div className="connections__graph-stage" onClick={onResetFocus} role="presentation">
        {graphSvg}
      </div>

      {focusCard}

      {overflowPanel}
    </section>
  );
}
