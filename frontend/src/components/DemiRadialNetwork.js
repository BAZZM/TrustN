import React, { useState, useMemo, useRef, useEffect, memo } from "react";
import { motion, useMotionValue, useSpring, AnimatePresence } from "framer-motion";

const DEG = Math.PI / 180;
const APEX_DEG = 90; // bottom of circle in SVG (y-down); diameter at y=0
const RIGHT_DEG = 0; // right side of circle in SVG (3 o'clock)
const MOBILE_BREAKPOINT = 768;
const VIEW_SIZE = 2000; // Increased significantly for much larger segments
const VIEW_HALF = VIEW_SIZE / 2;

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < MOBILE_BREAKPOINT : false
  );
  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
    const update = () => setIsMobile(mql.matches);
    mql.addEventListener("change", update);
    update();
    return () => mql.removeEventListener("change", update);
  }, []);
  return isMobile;
}

// Neutral white/grey for dark background (labels, strokes)
const GLASS = {
  label: "rgba(248,250,252,0.92)",
  labelMuted: "rgba(248,250,252,0.7)",
  stroke: "rgba(248,250,252,0.16)",
  strokeSelected: "rgba(248,250,252,0.28)",
};
// Segment fill: dark grey with bevel (filter applied in SVG)
const SEGMENT_FILL = {
  base: "#25282e",
  hover: "#2d3138",
  selected: "#32363e",
};

/**
 * Compute strength score from connection data (frequency, recency, diversity proxy).
 * Not manually set by user.
 */
function computeStrengthScore(contact) {
  const circleWeight = (contact.relationship || contact.circle_type) === "inner" ? 1 : 0.65;
  const strength = Number(contact.strength) || 1;
  const created = contact.created_at ? new Date(contact.created_at).getTime() : 0;
  const recency = created ? Math.max(0, 1 - (Date.now() - created) / (365 * 24 * 3600 * 1000)) : 0.5;
  return Math.min(1, circleWeight * (0.6 * strength / 2 + 0.4 * recency));
}

/**
 * Normalize API connection/contact to Contact shape for DemiRadialNetwork.
 */
function toContact(item, secondary = []) {
  const id = item.peer_id ?? item.user_id ?? item.id;
  const name = item.peer_name ?? item.contact_name ?? item.user_name ?? "?";
  return {
    id: String(id),
    name,
    avatar: item.avatar,
    occupation: item.peer_job_role ?? item.job_role ?? "",
    relationship: item.circle_type === "inner" ? "inner" : "secondary",
    strengthScore: computeStrengthScore(item),
    lastInteraction: item.created_at ? new Date(item.created_at).getTime() : 0,
    secondaryConnections: secondary,
    _raw: item,
  };
}

/**
 * SVG path for one ring segment (wedge) from angle a1 to a2, inner radius rIn, outer rOut.
 * Angles in degrees; SVG y-down.
 */
function wedgePath(rInner, rOuter, startDeg, endDeg) {
  const a1 = startDeg * DEG;
  const a2 = endDeg * DEG;
  const x1i = Math.cos(a1) * rInner;
  const y1i = Math.sin(a1) * rInner;
  const x1o = Math.cos(a1) * rOuter;
  const y1o = Math.sin(a1) * rOuter;
  const x2o = Math.cos(a2) * rOuter;
  const y2o = Math.sin(a2) * rOuter;
  const x2i = Math.cos(a2) * rInner;
  const y2i = Math.sin(a2) * rInner;
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${x1i} ${y1i} L ${x1o} ${y1o} A ${rOuter} ${rOuter} 0 ${large} 1 ${x2o} ${y2o} L ${x2i} ${y2i} A ${rInner} ${rInner} 0 ${large} 0 ${x1i} ${y1i} Z`;
}

function segmentCenter(rInner, rOuter, startDeg, endDeg) {
  const mid = (startDeg + endDeg) / 2;
  const r = (rInner + rOuter) / 2;
  const rad = mid * DEG;
  return { x: Math.cos(rad) * r, y: Math.sin(rad) * r };
}

function truncateName(name, maxLen) {
  const n = (name || "?").trim();
  if (n.length <= maxLen) return n || "?";
  return n.slice(0, maxLen - 1) + "…";
}

/** Rotation so segment at selectedIndex is centered at right side (0°). */
function rotationForRight(segmentCount, selectedIndex) {
  if (segmentCount <= 0 || selectedIndex == null || selectedIndex < 0) return 0;
  const step = 180 / segmentCount;
  const segmentCenterAngle = 180 - (selectedIndex + 0.5) * step;
  return RIGHT_DEG - segmentCenterAngle;
}

const VISIBLE_ARC_DEG = 110;

const PRIMARY_R_INNER = 200; // Increased inner radius
const PRIMARY_R_OUTER = 700; // Much larger outer radius to contain names inside segments
const SECONDARY_RING_WIDTH = 200; // Much wider secondary ring to contain names

/** Configurable limits (override via props); defaults to 100 for each ring */
const DEFAULT_MAX_PRIMARY = 100;
const DEFAULT_MAX_SECONDARY = 100;

const PrimaryRingSegments = memo(function PrimaryRingSegments({
  contacts,
  visiblePrimary,
  selectedId,
  onSelect,
  performanceMode,
  groupRotation = 0, // Current rotation of parent group (for text positioning)
  renderPathsOnly = false, // If true, render only paths
  renderTextOnly = false, // If true, render only text labels
}) {
  const rInner = PRIMARY_R_INNER;
  const rOuter = PRIMARY_R_OUTER;
  const visible = contacts.slice(0, Math.max(1, visiblePrimary));
  const count = Math.max(1, visible.length);
  const step = 180 / count;
  const isLowPerf = performanceMode === "low";

  // Calculate text positions (used by both path and text rendering)
  const textPositions = visible.map((contact, i) => {
    const startDeg = 180 - (i + 1) * step;
    const endDeg = 180 - i * step;
    const midAngle = (startDeg + endDeg) / 2;
    // Position text well within segment boundaries - use 50% from inner to outer edge
    const textRadius = rInner + (rOuter - rInner) * 0.5;
    const currentAngle = midAngle + groupRotation;
    const textX = Math.cos(currentAngle * DEG) * textRadius;
    const textY = Math.sin(currentAngle * DEG) * textRadius;
    const textRotation = -groupRotation;
    return { contact, textX, textY, textRotation };
  });

  if (renderTextOnly) {
    // Render only text labels on top layer
    return (
      <g className="demi-radial__primary-labels">
        {textPositions.map(({ contact, textX, textY, textRotation }) => (
          <text
            key={`label-${contact.id}`}
            x={textX}
            y={textY}
            textAnchor="middle"
            dominantBaseline="middle"
            transform={`rotate(${textRotation} ${textX} ${textY})`}
            className="demi-radial__segment-label demi-radial__segment-label--primary"
            fill={GLASS.label}
            fontSize={18}
            fontWeight="500"
            style={{ 
              pointerEvents: "none",
              textRendering: "optimizeLegibility",
            }}
          >
            {truncateName(contact.name, 20)}
          </text>
        ))}
      </g>
    );
  }

  // Render segments (paths only)
  return (
    <g className="demi-radial__primary-ring" data-ring="primary">
      {visible.map((contact, i) => {
        const startDeg = 180 - (i + 1) * step;
        const endDeg = 180 - i * step;
        const d = wedgePath(rInner, rOuter, startDeg, endDeg);
        const isSelected = selectedId === contact.id;

        return (
          <g key={contact.id} className="demi-radial__segment-wrap">
            <motion.path
              className="demi-radial__segment demi-radial__segment--primary"
              d={d}
              fill={isSelected ? SEGMENT_FILL.selected : SEGMENT_FILL.base}
              stroke={isSelected ? GLASS.strokeSelected : GLASS.stroke}
              strokeWidth={isSelected ? 1.5 : 1}
              strokeLinejoin="round"
              strokeLinecap="round"
              style={{
                filter: !isLowPerf ? (isSelected ? "url(#demi-segment-bevel) drop-shadow(0 0 16px rgba(248,250,252,0.12))" : "url(#demi-segment-bevel)") : "none",
                shapeRendering: "geometricPrecision",
              }}
              onClick={() => onSelect(contact)}
              transition={{ type: "spring", stiffness: 300, damping: 28 }}
              whileHover={{ fill: SEGMENT_FILL.hover }}
              whileTap={{ fill: SEGMENT_FILL.selected }}
            />
          </g>
        );
      })}
    </g>
  );
});

/** Secondary ring: outside primary, only visible on hover, radial fade to transparent inward. */
const SecondaryRingSegments = memo(function SecondaryRingSegments({
  contacts,
  scrollOffset,
  selectedId,
  onSelect,
  expanded,
  visible,
  performanceMode,
  groupRotation = 0, // Current rotation of parent group
  renderPathsOnly = false, // If true, render only paths
  renderTextOnly = false, // If true, render only text labels
}) {
  const rInner = PRIMARY_R_OUTER;
  const rOuter = PRIMARY_R_OUTER + SECONDARY_RING_WIDTH;
  const count = Math.max(1, contacts.length);
  const step = 360 / count;

  // Only render if expanded and visible (applies to both paths and text)
  // For text-only rendering, we still need to check expanded/visible
  if (renderTextOnly) {
    if (!expanded || !visible || contacts.length === 0) return null;
  } else {
    if (!expanded || contacts.length === 0) return null;
    // For paths, we use opacity animation controlled by visible prop
  }

  // Calculate text positions (used by both path and text rendering)
  // Apply scrollOffset to angle calculation so text follows scrolling segments
  const textPositions = contacts.map((contact, i) => {
    const startDeg = i * step + scrollOffset;
    const endDeg = (i + 1) * step + scrollOffset;
    const midAngle = (startDeg + endDeg) / 2;
    // Position text well within segment boundaries - use 50% from inner to outer edge
    const textRadius = rInner + (rOuter - rInner) * 0.5;
    // Text position accounts for groupRotation (main wheel rotation) so it follows the wheel
    const currentAngle = midAngle + groupRotation;
    const textX = Math.cos(currentAngle * DEG) * textRadius;
    const textY = Math.sin(currentAngle * DEG) * textRadius;
    // Counter-rotate text to keep it horizontal (account for main wheel rotation)
    const textRotation = -groupRotation;
    return { contact, textX, textY, textRotation };
  });

  if (renderTextOnly) {
    // Render only text labels on top layer
    return (
      <g className="demi-radial__secondary-labels">
        {textPositions.map(({ contact, textX, textY, textRotation }) => (
          <text
            key={`label-${contact.id}`}
            x={textX}
            y={textY}
            textAnchor="middle"
            dominantBaseline="middle"
            transform={`rotate(${textRotation} ${textX} ${textY})`}
            className="demi-radial__segment-label demi-radial__segment-label--secondary"
            fill={GLASS.labelMuted}
            fontSize={16}
            fontWeight="500"
            style={{ 
              pointerEvents: "none",
              textRendering: "optimizeLegibility",
            }}
          >
            {truncateName(contact.name, 18)}
          </text>
        ))}
      </g>
    );
  }

  // Render segments (paths only)
  // Note: This group should NOT have its own transform - it's inside the rotating motion.g
  // The scrollOffset is applied to the angle calculation, not as a transform
  return (
    <motion.g
      className="demi-radial__secondary-ring"
      data-ring="secondary"
      initial={false}
      animate={{ opacity: visible ? 1 : 0 }}
      transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
      style={{ pointerEvents: visible ? "auto" : "none" }}
    >
      {contacts.map((contact, i) => {
        // Apply scrollOffset to the angle calculation so segments scroll through secondary connections
        const startDeg = i * step + scrollOffset;
        const endDeg = (i + 1) * step + scrollOffset;
        const d = wedgePath(rInner, rOuter, startDeg, endDeg);
        const isSelected = selectedId === contact.id;

        return (
          <g key={contact.id} className="demi-radial__segment-wrap demi-radial__segment-wrap--secondary">
            <motion.path
              className="demi-radial__segment demi-radial__segment--secondary"
              d={d}
              fill="url(#demi-secondary-fade)"
              stroke={isSelected ? GLASS.strokeSelected : GLASS.stroke}
              strokeWidth={isSelected ? 2 : 1.2}
              strokeOpacity={isSelected ? 1 : 0.8}
              strokeLinejoin="round"
              strokeLinecap="round"
              style={{
                shapeRendering: "geometricPrecision",
              }}
              onClick={() => onSelect(contact)}
              whileHover={{ strokeOpacity: 1, strokeWidth: 1.5 }}
              whileTap={{ strokeOpacity: 1, strokeWidth: 2 }}
            />
          </g>
        );
      })}
    </motion.g>
  );
});

const InnerInfoRing = memo(function InnerInfoRing({
  contact,
  onClose,
  onAddToSecondary,
  onRequestConnection,
  enableBlur,
  performanceMode,
}) {
  if (!contact) return null;

  const isProspective = contact._raw?.user_id && !contact._raw?.peer_id;
  const isSecondary = contact.relationship === "secondary";
  const occupation = contact.occupation || contact._raw?.peer_job_role || contact._raw?.job_role || "";
  const isLowPerf = performanceMode === "low";
  const useBlur = enableBlur && !isLowPerf;
  const requestHandler = onRequestConnection || onAddToSecondary;

  return (
    <motion.div
      className="demi-radial__info-ring"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 4 }}
      transition={{ delay: 0.18, duration: 0.2 }}
      style={{
        backdropFilter: useBlur ? "blur(12px)" : "none",
        background: useBlur ? "rgba(45, 55, 72, 0.75)" : "rgba(45, 55, 72, 0.95)",
      }}
    >
      <div className="demi-radial__info-inner">
        <div
          className="demi-radial__info-avatar"
          style={{ background: "rgba(248,250,252,0.12)", color: GLASS.label }}
        >
          {(contact.name || "?").charAt(0).toUpperCase()}
        </div>
        <h3 className="demi-radial__info-name">{contact.name}</h3>
        {/* Show phone number for inner circle contacts */}
        {contact.phone && contact.relationship === "inner" && (
          <p className="demi-radial__info-phone" style={{ fontSize: "0.8rem", color: "var(--color-text-muted)", marginBottom: "var(--space-xs)" }}>
            {contact.phone}
          </p>
        )}
        {/* Show job role and industry */}
        {(contact.jobRole || occupation) && (
          <p className="demi-radial__info-occupation">
            {contact.jobRole || occupation}
            {contact.industry && ` • ${contact.industry}`}
          </p>
        )}
        {/* Show experience if available */}
        {contact.experience && (
          <p className="demi-radial__info-experience" style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginTop: "var(--space-xs)" }}>
            {contact.experience}
          </p>
        )}
        <span className="demi-radial__info-relationship">{contact.relationship === "inner" ? "Inner circle" : "Secondary"}</span>
        <div className="demi-radial__info-pulse-wrap">
          <motion.span
            className="demi-radial__info-pulse"
            animate={performanceMode !== "low" ? { opacity: [0.4, 0.9, 0.4] } : {}}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            style={{ background: contact.lastInteraction ? "rgba(248,250,252,0.6)" : "rgba(248,250,252,0.25)" }}
          />
          <span className="demi-radial__info-pulse-label">
            {contact.lastInteraction ? "Recent" : "—"}
          </span>
        </div>
        <div className="demi-radial__info-actions">
          {isProspective && onAddToSecondary && (
            <motion.button
              type="button"
              className="demi-radial__btn demi-radial__btn--primary"
              onClick={() => onAddToSecondary(contact._raw)}
              whileTap={{ scale: 0.98 }}
            >
              Add to circle
            </motion.button>
          )}
          {isSecondary && requestHandler && (
            <motion.button
              type="button"
              className="demi-radial__btn demi-radial__btn--primary"
              onClick={() => requestHandler(contact._raw)}
              whileTap={{ scale: 0.98 }}
            >
              Request
            </motion.button>
          )}
          {onClose && (
            <motion.button
              type="button"
              className="demi-radial__btn demi-radial__btn--ghost"
              onClick={onClose}
              whileTap={{ scale: 0.98 }}
            >
              Close
            </motion.button>
          )}
        </div>
      </div>
    </motion.div>
  );
});

function DemiRadialNetwork({
  contacts = [],
  maxPrimaryContacts = DEFAULT_MAX_PRIMARY,
  maxSecondaryContacts = DEFAULT_MAX_SECONDARY,
  visiblePrimary,
  maxSecondaryVisible,
  accentColor = "coolBlue",
  onSelectContact,
  onAddToSecondary,
  onRequestConnection,
  enableBlur = true,
  performanceMode = "auto",
  innerConnections = [],
  secondaryConnections = [],
  prospectiveContacts = [],
  theme,
}) {
  const maxPrimary = maxPrimaryContacts ?? visiblePrimary ?? DEFAULT_MAX_PRIMARY;
  const maxSecondary = maxSecondaryContacts ?? maxSecondaryVisible ?? DEFAULT_MAX_SECONDARY;
  const [selected, setSelected] = useState(null);
  const [selectedPrimary, setSelectedPrimary] = useState(null);
  const [rotation, setRotation] = useState(0);
  const [secondaryScroll, setSecondaryScroll] = useState(0);
  const [dragStart, setDragStart] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isHoveringWheel, setIsHoveringWheel] = useState(false);
  const svgRef = useRef(null);
  const rotationMv = useMotionValue(0);
  const rotationSpring = useSpring(rotationMv, { stiffness: 120, damping: 28 });
  // Thumb position: normalize rotation to 0-1, map to track height
  const thumbY = useMotionValue(0);

  const visiblePrimaryClamped = Math.min(100, Math.max(4, maxPrimary));

  const primaryContacts = useMemo(() => {
    const list = innerConnections.length ? innerConnections.map((c) => toContact(c, [])) : [];
    return list;
  }, [innerConnections]);

  const selectedIndex = useMemo(() => {
    if (!selectedPrimary) return 0;
    const i = primaryContacts.findIndex((c) => c.id === selectedPrimary.id);
    return i >= 0 ? i : 0;
  }, [selectedPrimary, primaryContacts]);

  const rightRotation = useMemo(
    () => {
      if (selectedPrimary && selectedIndex >= 0) {
        return rotationForRight(primaryContacts.length, selectedIndex);
      }
      // When no selection, don't rotate - show segments in their natural position
      // This keeps the wheel visible on first load
      return 0;
    },
    [primaryContacts.length, selectedIndex, selectedPrimary]
  );
  const totalRotation = rotation + rightRotation;
  
  // Initialize rotation to 0 on mount - don't auto-rotate on first load
  useEffect(() => {
    if (primaryContacts.length > 0) {
      const currentRot = rotationMv.get();
      // Only initialize if rotation is near 0 (hasn't been set yet)
      if (Math.abs(currentRot) < 0.1 && Math.abs(rotation) < 0.1) {
        rotationMv.set(0);
        setRotation(0);
      }
    }
  }, [primaryContacts.length, rotationMv, rotation]);

  const secondaryForSelected = useMemo(() => {
    if (!selectedPrimary) return [];
    // Use relationship-based secondary connections if available, otherwise fall back to all secondary
    const connectionsToUse = secondaryConnections.length > 0 ? secondaryConnections : [];
    return connectionsToUse
      .slice(0, maxSecondary)
      .map((c) => toContact(c, []));
  }, [selectedPrimary, secondaryConnections, maxSecondary]);

  useEffect(() => {
    if (!isDragging) {
      rotationMv.set(totalRotation);
    }
  }, [totalRotation, isDragging, rotationMv]);

  // Update thumb position based on rotation
  useEffect(() => {
    const normalized = ((rotation % 360 + 360) % 360) / 360;
    thumbY.set(normalized * (120 - 24));
  }, [rotation, thumbY]);

  const handleSelect = (contact) => {
    setSelected(contact);
    const isPrimary = primaryContacts.some((c) => c.id === contact.id);
    if (isPrimary) {
      setSelectedPrimary(contact);
      // Notify parent component to fetch relationship-based secondary connections
      if (contact.id && onSelectContact) {
        onSelectContact(contact?.id ? contact._raw ?? contact : null);
      }
    } else {
      // If selecting a secondary connection, clear primary selection
      setSelectedPrimary(null);
      onSelectContact?.(contact?.id ? contact._raw ?? contact : null);
    }
  };

  const handleDrag = (_, info) => {
    const sensitivity = 0.35;
    const delta = info.offset?.x != null ? -info.offset.x : -info.delta?.x ?? 0;
    const newRot = dragStart + delta * sensitivity;
    rotationMv.set(newRot);
    setRotation(newRot);
  };

  const handleDragEnd = (_, info) => {
    setIsDragging(false);
    const v = info.velocity?.x ?? 0;
    if (Math.abs(v) > 80) {
      const momentum = -v * 0.12;
      const target = rotationMv.get() + momentum;
      rotationMv.set(target);
      setRotation(target);
    } else {
      setRotation(rotationMv.get());
    }
  };

  const handleWheel = (e) => {
    if (!selectedPrimary || secondaryForSelected.length === 0) return;
    e.preventDefault();
    setSecondaryScroll((s) => s + e.deltaY * 0.5);
  };

  const isMobile = useIsMobile();
  const isLowPerf = performanceMode === "low";
  // Mobile: show left half of circle (x from -700 to 0, y full height)
  // Desktop: full circle, ensure it's visible on load
  const viewBox = isMobile
    ? `${-VIEW_HALF} ${-VIEW_HALF} ${VIEW_HALF} ${VIEW_SIZE}` // left half: width 700, height 1400
    : `${-VIEW_HALF} ${-VIEW_HALF} ${VIEW_SIZE} ${VIEW_SIZE}`; // full circle: 1400x1400
  const svgWidth = VIEW_SIZE;
  const svgHeight = VIEW_SIZE;
  
  // Text labels update when rotation changes (handled via groupRotation prop)

  // Scale when a segment is selected: bring to center and scale by count in focused ring(s)
  const focusCount = selectedPrimary
    ? primaryContacts.length + (secondaryForSelected.length > 0 ? secondaryForSelected.length : 0)
    : 0;
  const focusScale = selectedPrimary
    ? 1 / (1 + Math.min(40, focusCount) * 0.018)
    : 1;
  const scaleSpring = useSpring(focusScale, { stiffness: 200, damping: 26 });

  useEffect(() => {
    scaleSpring.set(focusScale);
  }, [focusScale, scaleSpring]);

  const handleSwiperDrag = (_, info) => {
    const sensitivity = 0.4;
    const delta = info.offset?.y != null ? -info.offset.y : -info.delta?.y ?? 0;
    const newRot = dragStart + delta * sensitivity;
    rotationMv.set(newRot);
    setRotation(newRot);
  };

  return (
    <div
      className={`demi-radial ${isMobile ? "demi-radial--mobile" : "demi-radial--desktop"}`}
      role="application"
      aria-label="Contact network"
      style={{
        ["--demi-swiper-inset"]: "12px",
        ["--demi-swiper-width"]: "6px",
        ["--demi-swiper-height"]: "120px",
        ["--demi-swiper-track"]: "rgba(0,0,0,0.45)",
        ["--demi-swiper-border"]: "rgba(255,255,255,0.08)",
        ["--demi-swiper-thumb"]: "rgba(255,255,255,0.22)",
        ["--demi-swiper-thumb-hover"]: "rgba(255,255,255,0.35)",
      }}
    >
      <div className="demi-radial__wheel-wrap">
        {!isMobile && (
          <motion.div
            className="demi-radial__swiper-wrap"
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0}
            onDragStart={() => setDragStart(rotationMv.get())}
            onDrag={handleSwiperDrag}
            onDragEnd={(_, info) => {
              const v = info.velocity?.y ?? 0;
              if (Math.abs(v) > 50) {
                const momentum = -v * 0.15;
                const target = rotationMv.get() + momentum;
                rotationMv.set(target);
                setRotation(target);
              } else {
                setRotation(rotationMv.get());
              }
            }}
            aria-label="Rotate wheel"
          >
            <motion.div
              className="demi-radial__swiper-thumb"
              style={{
                height: 24,
                y: thumbY,
              }}
            />
          </motion.div>
        )}
        <motion.div
          className="demi-radial__arc-mask-container"
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.05}
          dragMomentum={false}
          onDragStart={() => { setDragStart(rotationMv.get()); setIsDragging(true); }}
          onDrag={handleDrag}
          onDragEnd={handleDragEnd}
          onWheel={handleWheel}
          onMouseEnter={() => setIsHoveringWheel(true)}
          onMouseLeave={() => setIsHoveringWheel(false)}
          style={{ cursor: "grab", touchAction: "pan-y pinch-zoom" }}
          whileTap={{ cursor: "grabbing" }}
        >
        <svg
          ref={svgRef}
          className={`demi-radial__svg ${isMobile ? "demi-radial__svg--mobile" : "demi-radial__svg--desktop"}`}
          viewBox={viewBox}
          preserveAspectRatio={isMobile ? "xMinYMid meet" : "xMidYMid meet"}
          width={isMobile ? "100%" : svgWidth}
          height={isMobile ? undefined : svgHeight}
        >
          <defs>
            {/* High-fidelity bevel: diffuse + specular lighting for 3D raised effect */}
            <filter id="demi-segment-bevel" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur in="SourceAlpha" stdDeviation="0.5" result="blur" />
              <feSpecularLighting in="blur" result="spec" specularConstant="1.4" specularExponent="25" surfaceScale="2">
                <fePointLight x="-200" y="-200" z="120" />
              </feSpecularLighting>
              <feComposite in="spec" in2="SourceAlpha" operator="in" result="specMask" />
              <feDiffuseLighting in="blur" result="diff" diffuseConstant="0.9" surfaceScale="1.5">
                <fePointLight x="-200" y="-200" z="80" />
              </feDiffuseLighting>
              <feComposite in="diff" in2="SourceAlpha" operator="in" result="diffMask" />
              <feBlend in="SourceGraphic" in2="specMask" mode="screen" result="withSpec" />
              <feBlend in="withSpec" in2="diffMask" mode="multiply" result="withBevel" />
              <feComposite in="withBevel" in2="SourceAlpha" operator="in" />
            </filter>
            {/* ClipPath removed - showing full circle */}
            {/* Secondary ring: radial fade in-to-out (transparent at outer edge, visible toward inner) */}
            <radialGradient id="demi-secondary-fade" gradientUnits="userSpaceOnUse" cx={0} cy={0} r={PRIMARY_R_OUTER + SECONDARY_RING_WIDTH}>
              <stop offset={PRIMARY_R_OUTER / (PRIMARY_R_OUTER + SECONDARY_RING_WIDTH)} stopColor="rgba(248,250,252,0.1)" />
              <stop offset={1} stopColor="rgba(248,250,252,0)" />
            </radialGradient>
          </defs>
          <g transform={isMobile ? "scale(1,-1)" : undefined}>
            {/* Rotating segments - paths only */}
            <motion.g
              style={{
                rotate: rotationSpring,
                scale: scaleSpring,
                transformOrigin: "0px 0px", // Rotate around center (0,0) of SVG
              }}
            >
              <PrimaryRingSegments
                contacts={primaryContacts}
                visiblePrimary={visiblePrimaryClamped}
                selectedId={selectedPrimary?.id}
                onSelect={handleSelect}
                performanceMode={performanceMode}
                groupRotation={totalRotation}
                renderPathsOnly={true} // Render only paths, not text
              />
              <SecondaryRingSegments
                contacts={secondaryForSelected}
                scrollOffset={secondaryScroll}
                selectedId={selected?.id}
                onSelect={handleSelect}
                expanded={!!selectedPrimary}
                visible={(isHoveringWheel || isMobile) && !!selectedPrimary}
                performanceMode={performanceMode}
                groupRotation={totalRotation}
                renderPathsOnly={true} // Render only paths, not text
              />
            </motion.g>
            {/* Text labels rendered on top layer - separate from rotating group */}
            <g style={{ pointerEvents: "none" }}>
              <PrimaryRingSegments
                contacts={primaryContacts}
                visiblePrimary={visiblePrimaryClamped}
                selectedId={selectedPrimary?.id}
                onSelect={() => {}}
                performanceMode={performanceMode}
                groupRotation={totalRotation}
                renderTextOnly={true} // Render only text labels
              />
              {selectedPrimary && secondaryForSelected.length > 0 && (isHoveringWheel || isMobile) && (
                <SecondaryRingSegments
                  contacts={secondaryForSelected}
                  scrollOffset={secondaryScroll}
                  selectedId={selected?.id}
                  onSelect={() => {}}
                  expanded={!!selectedPrimary}
                  visible={true}
                  performanceMode={performanceMode}
                  groupRotation={totalRotation}
                  renderTextOnly={true} // Render only text labels
                />
              )}
            </g>
          </g>
        </svg>
        </motion.div>
      </div>

      {/* Inner info ring: near apex (top center in layout) */}
      <div className="demi-radial__info-ring-slot">
        <AnimatePresence mode="wait">
          {selected && (
            <InnerInfoRing
              key={selected.id}
              contact={selected}
              onClose={() => { setSelected(null); setSelectedPrimary(null); onSelectContact?.(null); }}
              onAddToSecondary={onAddToSecondary}
              onRequestConnection={onAddToSecondary}
              enableBlur={enableBlur}
              performanceMode={performanceMode}
            />
          )}
        </AnimatePresence>
      </div>

      {/* Prospective strip */}
      {prospectiveContacts.length > 0 && (
        <div className="demi-radial__prospective">
          <span className="demi-radial__prospective-label">Prospective</span>
          <div className="demi-radial__prospective-chips">
            {prospectiveContacts.slice(0, 8).map((c) => (
              <motion.button
                key={c.user_id ?? c.id}
                type="button"
                className="demi-radial__chip"
                onClick={() => handleSelect(toContact(c, []))}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.98 }}
              >
                {(c.contact_name || c.user_name || "?").charAt(0).toUpperCase()}
                <span className="demi-radial__chip-name">{c.contact_name || c.user_name || c.phone}</span>
              </motion.button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default DemiRadialNetwork;
export { toContact, computeStrengthScore, GLASS };
