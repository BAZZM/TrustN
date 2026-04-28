import React, { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
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
  motionTransition,
  hitPadding = 10,
}) {
  return (
    <motion.g
      className={className}
      initial={false}
      animate={{ x: node.x, y: node.y, opacity: node.opacity ?? 1, scale: node.scale ?? 1 }}
      transition={motionTransition}
      tabIndex={disabled ? -1 : 0}
      role={disabled ? undefined : "button"}
      aria-label={disabled ? undefined : label}
      onClick={(event) => {
        event.stopPropagation();
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
  t,
}) {
  const prefersReducedMotion = useReducedMotion();
  const [narrowViewport, setNarrowViewport] = useState(false);

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

  return (
    <section className="connections__graph-shell">
      <div className="connections__graph-copy">
        <div>
          <p className="connections__eyebrow">{t("connections.graphEyebrow")}</p>
          <h2 className="connections__graph-title">{t("connections.graphTitle")}</h2>
        </div>
        <p className="connections__graph-summary">
          {focusUserId
            ? t("connections.focusActive")
            : t("connections.graphIntro")}
        </p>
      </div>

      <div
        className="connections__graph-stage"
        onClick={onResetFocus}
        role="presentation"
      >
        <svg
          className="connections__graph-svg"
          viewBox={`0 0 ${GRAPH_VIEWBOX} ${GRAPH_VIEWBOX}`}
          aria-label={t("connections.graphTitle")}
        >
          <rect width={GRAPH_VIEWBOX} height={GRAPH_VIEWBOX} fill="transparent" />
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
              <text
                x={GRAPH_CENTER}
                y={52}
                textAnchor="middle"
                className="connections__status-label"
              >
                {t("connections.noSecondary")}
              </text>
            )}

          {secondaryLayout.map((node) => (
            <Node
              key={`secondary-node-${node.id}`}
              node={node}
              label={node.name}
              className="connections__secondary-node"
              labelClassName="connections__secondary-label"
              disabled
              motionTransition={nodeMotionTransition}
              hitPadding={narrowViewport ? Math.max(12, NODE_HIT_PADDING - 2) : 10}
            />
          ))}

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
              className="connections__inner-node"
              labelClassName="connections__inner-label"
              onSelect={onFocusConnection}
              motionTransition={nodeMotionTransition}
              hitPadding={innerHitPadding}
            />
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
      </div>

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
                : t("connections.focusSummary").replace(
                    "{count}",
                    String(secondaryConnections.length)
                  )}
            </p>
          </>
        )}
      </div>

      {overflowInnerConnections.length > 0 && (
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
                  <span className="connections__overflow-button-meta">
                    {truncateLabel(node.jobRole, 18)}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
