import React, { useState, useMemo, useEffect, useRef, memo } from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";

const DEG = Math.PI / 180;

function placeOnCircle(count, radius, startAngleDeg = 0) {
  if (count === 0) return [];
  const step = 360 / count;
  return Array.from({ length: count }, (_, i) => {
    const angleDeg = startAngleDeg + i * step;
    const angleRad = angleDeg * DEG;
    return {
      index: i,
      angleDeg,
      x: Math.cos(angleRad) * radius,
      y: Math.sin(angleRad) * radius,
    };
  });
}

const CircleRing = memo(function CircleRing({ items, radius, rotationDeg, circleLabel, circleType, onSelect, selectedId, theme }) {
  const positions = placeOnCircle(Math.max(items.length, 1), radius, rotationDeg);
  const isInner = circleType === "inner";
  const nodeRadius = isInner ? 22 : 28;

  return (
    <g className="radial-wheel__ring" data-ring={circleType}>
      {/* Subtle division lines between nodes */}
      {items.length > 1 && items.map((_, i) => {
        const pos = positions[i];
        const nextPos = positions[(i + 1) % items.length];
        const midAngle = (pos.angleDeg + nextPos.angleDeg) / 2;
        const midRad = midAngle * Math.PI / 180;
        const startR = radius - nodeRadius - 2;
        const endR = radius + nodeRadius + 2;
        return (
          <line
            key={`div-${i}`}
            x1={Math.cos(midRad) * startR}
            y1={Math.sin(midRad) * startR}
            x2={Math.cos(midRad) * endR}
            y2={Math.sin(midRad) * endR}
            stroke={theme?.config?.accent ? `${theme.config.accent}15` : "rgba(74, 85, 104, 0.1)"}
            strokeWidth={0.5}
            strokeDasharray="2,2"
            className="radial-wheel__division"
          />
        );
      })}
      {items.length === 0 ? (
        <motion.text
          x={0}
          y={0}
          textAnchor="middle"
          dominantBaseline="middle"
          className="radial-wheel__ring-empty"
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.6 }}
        >
          {circleLabel}
        </motion.text>
      ) : (
        items.map((item, i) => {
          const pos = positions[i] || positions[0];
          const isSelected = selectedId === item.peer_id || selectedId === item.user_id || selectedId === item.id;
          return (
            <motion.g
              key={item.peer_id || item.user_id || item.id || i}
              transform={`translate(${pos.x}, ${pos.y})`}
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.03, type: "spring", stiffness: 200, damping: 20 }}
              className="radial-wheel__node-wrap"
            >
              <motion.circle
                className={`radial-wheel__node radial-wheel__node--${circleType}`}
                r={nodeRadius}
                fill={theme?.config?.accent ? `${theme.config.accent}22` : "rgba(74, 85, 104, 0.2)"}
                stroke={isSelected ? (theme?.config?.accent || "#4a5568") : (theme?.config?.accent ? `${theme.config.accent}40` : "rgba(74, 85, 104, 0.3)")}
                strokeWidth={isSelected ? 2.5 : 1}
                onClick={() => onSelect(item)}
                whileHover={{ scale: 1.15, strokeWidth: 2.5 }}
                whileTap={{ scale: 0.95 }}
              />
              <text
                x={0}
                y={0}
                textAnchor="middle"
                dominantBaseline="middle"
                className="radial-wheel__node-initial"
                fill={theme?.config?.accent || "#4a5568"}
                fontSize={isInner ? 12 : 14}
                fontWeight="600"
              >
                {(item.peer_name || item.contact_name || item.user_name || "?").charAt(0).toUpperCase()}
              </text>
            </motion.g>
          );
        })
      )}
    </g>
  );
});

const RadialContactWheel = memo(function RadialContactWheel({
  innerConnections = [],
  secondaryConnections = [],
  prospectiveContacts = [],
  rotationDeg = 0,
  onRotationChange,
  onSelectItem,
  selectedItem,
  searchQuery = "",
  showInner = true,
  showSecondary = true,
  theme = {},
  onKeyboardNavigate,
}) {
  const [dragStart, setDragStart] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const innerRadius = 75;
  const outerRadius = 140;
  const svgSize = 320;
  const wheelRef = useRef(null);
  const rotation = useMotionValue(rotationDeg);
  const rotationSpring = useSpring(rotation, { stiffness: 100, damping: 30 });

  const filteredInner = useMemo(() => {
    if (!searchQuery.trim()) return innerConnections;
    const q = searchQuery.toLowerCase();
    return innerConnections.filter(
      (c) =>
        (c.peer_name && c.peer_name.toLowerCase().includes(q)) ||
        (c.peer_phone && c.peer_phone.includes(searchQuery))
    );
  }, [innerConnections, searchQuery]);

  const filteredSecondary = useMemo(() => {
    if (!searchQuery.trim()) return secondaryConnections;
    const q = searchQuery.toLowerCase();
    return secondaryConnections.filter(
      (c) =>
        (c.peer_name && c.peer_name.toLowerCase().includes(q)) ||
        (c.peer_phone && c.peer_phone.includes(searchQuery))
    );
  }, [secondaryConnections, searchQuery]);

  const filteredProspective = useMemo(() => {
    if (!searchQuery.trim()) return prospectiveContacts;
    const q = searchQuery.toLowerCase();
    return prospectiveContacts.filter(
      (c) =>
        (c.contact_name && c.contact_name.toLowerCase().includes(q)) ||
        (c.user_name && c.user_name.toLowerCase().includes(q)) ||
        (c.phone && c.phone.includes(searchQuery))
    );
  }, [prospectiveContacts, searchQuery]);

  // Combine all items for keyboard navigation
  const allItems = useMemo(() => [
    ...filteredInner.map((item, i) => ({ ...item, ring: 'inner', index: i })),
    ...filteredSecondary.map((item, i) => ({ ...item, ring: 'secondary', index: i })),
    ...filteredProspective.map((item, i) => ({ ...item, ring: 'prospective', index: i })),
  ], [filteredInner, filteredSecondary, filteredProspective]);

  // Sync rotationDeg prop to motion value
  useEffect(() => {
    if (!isDragging) {
      rotation.set(rotationDeg);
    }
  }, [rotationDeg, isDragging, rotation]);

  // Sync spring to onRotationChange
  useEffect(() => {
    const unsubscribe = rotationSpring.on("change", (latest) => {
      if (typeof onRotationChange === "function" && !isDragging) {
        onRotationChange(latest);
      }
    });
    return unsubscribe;
  }, [rotationSpring, onRotationChange, isDragging]);

  function handleDragStart() {
    setDragStart(rotationDeg);
    setIsDragging(true);
  }

  function handleDrag(_, info) {
    const sensitivity = 0.4;
    const delta = info.offset.x !== undefined ? -info.offset.x : -info.delta.x;
    const newRot = dragStart + delta * sensitivity;
    rotation.set(newRot);
    if (typeof onRotationChange === "function") onRotationChange(newRot);
  }

  function handleDragEnd(_, info) {
    setIsDragging(false);
    // Apply momentum/inertia based on drag velocity
    const dragVelocity = info.velocity?.x || 0;
    if (Math.abs(dragVelocity) > 100) {
      const momentum = -dragVelocity * 0.15; // Convert velocity to rotation, with damping
      const targetRotation = rotation.get() + momentum;
      rotationSpring.set(targetRotation);
    }
  }

  // Keyboard navigation
  useEffect(() => {
    const wheelElement = wheelRef.current;
    if (!wheelElement) return;
    const handleKeyDown = (e) => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', 'Escape'].includes(e.key)) return;
      e.preventDefault();
      const step = 15; // degrees per arrow press
      let newRot = rotation.get();
      if (e.key === 'ArrowLeft') newRot -= step;
      else if (e.key === 'ArrowRight') newRot += step;
      else if (e.key === 'ArrowUp' && allItems.length > 0) {
        const currentIndex = selectedItem ? allItems.findIndex(item => 
          (item.peer_id || item.user_id || item.id) === (selectedItem.peer_id || selectedItem.user_id || selectedItem.id)
        ) : -1;
        const nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % allItems.length;
        if (onSelectItem) onSelectItem(allItems[nextIndex]);
        return;
      } else if (e.key === 'ArrowDown' && allItems.length > 0) {
        const currentIndex = selectedItem ? allItems.findIndex(item => 
          (item.peer_id || item.user_id || item.id) === (selectedItem.peer_id || selectedItem.user_id || selectedItem.id)
        ) : -1;
        const nextIndex = currentIndex <= 0 ? allItems.length - 1 : currentIndex - 1;
        if (onSelectItem) onSelectItem(allItems[nextIndex]);
        return;
      } else if (e.key === 'Escape' && selectedItem && onSelectItem) {
        onSelectItem(null);
        return;
      }
      rotationSpring.set(newRot);
    };
    wheelElement.addEventListener('keydown', handleKeyDown);
    return () => {
      wheelElement.removeEventListener('keydown', handleKeyDown);
    };
  }, [rotation, rotationSpring, allItems, selectedItem, onSelectItem]);

  return (
    <div className="radial-wheel" ref={wheelRef} tabIndex={0} role="application" aria-label="Radial contact wheel">
      <motion.div
        className="radial-wheel__disk-wrap"
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.05}
        dragMomentum={false}
        onDragStart={handleDragStart}
        onDrag={handleDrag}
        onDragEnd={handleDragEnd}
        style={{ cursor: "grab", touchAction: "pan-y pinch-zoom" }}
        whileTap={{ cursor: "grabbing" }}
      >
        <motion.svg
          className="radial-wheel__svg"
          viewBox={`${-svgSize / 2} ${-svgSize / 2} ${svgSize} ${svgSize}`}
          width={svgSize}
          height={svgSize}
          style={{ rotate: rotationSpring }}
          initial={false}
        >
          {/* Inner ring */}
          {showInner && (
            <CircleRing
              items={filteredInner}
              radius={innerRadius}
              rotationDeg={0}
              circleLabel="Inner"
              circleType="inner"
              onSelect={onSelectItem}
              selectedId={selectedItem?.peer_id || selectedItem?.user_id}
              theme={theme}
            />
          )}
          {/* Outer ring */}
          {showSecondary && (
            <CircleRing
              items={filteredSecondary}
              radius={outerRadius}
              rotationDeg={0}
              circleLabel="Secondary"
              circleType="secondary"
              onSelect={onSelectItem}
              selectedId={selectedItem?.peer_id || selectedItem?.user_id}
              theme={theme}
            />
          )}
        </motion.svg>
      </motion.div>

      {/* Prospective connections strip */}
      {filteredProspective.length > 0 && (
        <motion.div
          className="radial-wheel__prospective"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <span className="radial-wheel__prospective-label">Prospective</span>
          <div className="radial-wheel__prospective-chips">
            {filteredProspective.slice(0, 8).map((c) => (
              <motion.button
                key={c.user_id || c.id}
                type="button"
                className="radial-wheel__chip"
                onClick={() => onSelectItem && onSelectItem(c)}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.98 }}
              >
                {(c.contact_name || c.user_name || "?").charAt(0).toUpperCase()}
                <span className="radial-wheel__chip-name">{c.contact_name || c.user_name || c.phone}</span>
              </motion.button>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
});

export default RadialContactWheel;
