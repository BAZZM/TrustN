import { useCallback, useEffect, useMemo, useRef, useState } from "react";

function distance(a, b) {
  return Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
}

/**
 * Pinch-to-zoom and pan on a viewport element (Capacitor / mobile WebView friendly).
 * Uses non-passive touchmove where needed so preventDefault stops scroll stealing.
 */
export function usePinchPanZoom(options = {}) {
  const { minScale = 0.65, maxScale = 3.25, disabled = false } = options;

  const viewportRef = useRef(null);
  const [{ scale, tx, ty }, setTransform] = useState({ scale: 1, tx: 0, ty: 0 });

  const transformRef = useRef({ scale: 1, tx: 0, ty: 0 });
  transformRef.current = { scale, tx, ty };

  const pinchRef = useRef(null);
  const panRef = useRef(null);
  const ignoreTapRef = useRef(false);

  const clampScale = useCallback(
    (s) => Math.min(maxScale, Math.max(minScale, s)),
    [minScale, maxScale]
  );

  const clampTranslate = useCallback((s, x, y) => {
    const limit = 320 * s;
    return {
      tx: Math.min(limit, Math.max(-limit, x)),
      ty: Math.min(limit, Math.max(-limit, y)),
    };
  }, []);

  const applyTransform = useCallback(
    (next) => {
      const s = clampScale(next.scale);
      const { tx: ntx, ty: nty } = clampTranslate(s, next.tx, next.ty);
      transformRef.current = { scale: s, tx: ntx, ty: nty };
      setTransform({ scale: s, tx: ntx, ty: nty });
    },
    [clampScale, clampTranslate]
  );

  useEffect(() => {
    const el = viewportRef.current;
    if (!el || disabled) return undefined;

    const touches = new Map();

    const clearPinchPan = () => {
      pinchRef.current = null;
      panRef.current = null;
    };

    const onTouchStart = (e) => {
      for (let i = 0; i < e.changedTouches.length; i += 1) {
        const t = e.changedTouches[i];
        touches.set(t.identifier, { x: t.clientX, y: t.clientY });
      }

      if (e.touches.length >= 2) {
        const a = e.touches[0];
        const b = e.touches[1];
        pinchRef.current = {
          dist: distance(a, b),
        };
        panRef.current = null;
      } else if (e.touches.length === 1 && transformRef.current.scale > 1.02) {
        const t0 = e.touches[0];
        panRef.current = {
          x0: t0.clientX,
          y0: t0.clientY,
          tx0: transformRef.current.tx,
          ty0: transformRef.current.ty,
        };
        pinchRef.current = null;
      }
    };

    const onTouchMove = (e) => {
      if (e.touches.length >= 2 && pinchRef.current) {
        e.preventDefault();
        ignoreTapRef.current = true;
        const a = e.touches[0];
        const b = e.touches[1];
        const d = distance(a, b);
        const ratio = d / pinchRef.current.dist;
        const nextScale = clampScale(transformRef.current.scale * ratio);
        applyTransform({
          scale: nextScale,
          tx: transformRef.current.tx,
          ty: transformRef.current.ty,
        });
        pinchRef.current = { dist: d };
      } else if (e.touches.length === 1 && panRef.current && transformRef.current.scale > 1.02) {
        e.preventDefault();
        ignoreTapRef.current = true;
        const t0 = e.touches[0];
        const dx = t0.clientX - panRef.current.x0;
        const dy = t0.clientY - panRef.current.y0;
        applyTransform({
          scale: transformRef.current.scale,
          tx: panRef.current.tx0 + dx,
          ty: panRef.current.ty0 + dy,
        });
      }

      for (let i = 0; i < e.changedTouches.length; i += 1) {
        const t = e.changedTouches[i];
        if (touches.has(t.identifier)) {
          touches.set(t.identifier, { x: t.clientX, y: t.clientY });
        }
      }
    };

    const onTouchEnd = (e) => {
      for (let i = 0; i < e.changedTouches.length; i += 1) {
        touches.delete(e.changedTouches[i].identifier);
      }
      if (e.touches.length < 2) {
        pinchRef.current = null;
      }
      if (e.touches.length === 0) {
        panRef.current = null;
      }
      if (ignoreTapRef.current) {
        window.setTimeout(() => {
          ignoreTapRef.current = false;
        }, 150);
      }
    };

    const onWheel = (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      ignoreTapRef.current = true;
      const delta = -e.deltaY * 0.008;
      applyTransform({
        scale: transformRef.current.scale + delta,
        tx: transformRef.current.tx,
        ty: transformRef.current.ty,
      });
      window.setTimeout(() => {
        ignoreTapRef.current = false;
      }, 120);
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchEnd);
    el.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
      el.removeEventListener("wheel", onWheel);
      clearPinchPan();
      touches.clear();
    };
  }, [disabled, applyTransform, clampScale]);

  const transformStyle = useMemo(
    () => ({
      transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
      transformOrigin: "center center",
    }),
    [scale, tx, ty]
  );

  const consumeShouldIgnoreTap = useCallback(() => {
    if (ignoreTapRef.current) {
      ignoreTapRef.current = false;
      return true;
    }
    return false;
  }, []);

  const resetTransform = useCallback(() => {
    applyTransform({ scale: 1, tx: 0, ty: 0 });
  }, [applyTransform]);

  return {
    viewportRef,
    transformStyle,
    consumeShouldIgnoreTap,
    resetTransform,
    scale,
  };
}
