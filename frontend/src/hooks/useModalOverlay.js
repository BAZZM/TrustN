import { useEffect, useRef } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const NON_RENDERED = new Set(["SCRIPT", "STYLE", "LINK", "NOSCRIPT"]);

/**
 * Everything outside the panel: the siblings of the panel and of each of its ancestors up to
 * <body>. Elements marked `data-modal-keep` (e.g. a scrim that must stay clickable) and elements
 * that are already inert are left alone.
 */
function collectBackground(panel) {
  const background = [];
  let node = panel;
  while (node && node.parentElement && node !== document.body) {
    for (const sibling of node.parentElement.children) {
      if (
        sibling !== node &&
        !NON_RENDERED.has(sibling.tagName) &&
        !sibling.hasAttribute("inert") &&
        !sibling.hasAttribute("data-modal-keep")
      ) {
        background.push(sibling);
      }
    }
    node = node.parentElement;
  }
  return background;
}

/**
 * Modal behavior for an overlay rendered inline (sheet, search): while `open`, everything outside
 * `panelRef` is made `inert` (unreachable by Tab, pointer and screen-reader swipe), focus moves
 * into the overlay, Escape calls `onClose`, and on close focus returns to `returnFocusRef` (the
 * control that opened it) or, failing that, the element focused at open time.
 *
 * `inert` is set through the DOM because React 18 has no boolean `inert` prop.
 */
export default function useModalOverlay({ open, onClose, panelRef, returnFocusRef, getInitialFocus }) {
  const latest = useRef({});
  latest.current = { onClose, panelRef, returnFocusRef, getInitialFocus };

  useEffect(() => {
    if (!open) return undefined;

    const opener = document.activeElement;
    const panel = latest.current.panelRef.current;
    const background = panel ? collectBackground(panel) : [];
    background.forEach((el) => el.setAttribute("inert", ""));

    // A CSS visibility transition can still report `hidden` on the first frame, which makes
    // focus() a silent no-op; retry once shortly after.
    let retry;
    const focusInitial = () => {
      const { getInitialFocus: pick, panelRef: ref } = latest.current;
      const target = (pick && pick()) || (ref.current && ref.current.querySelector(FOCUSABLE));
      if (target && typeof target.focus === "function") target.focus();
      return target;
    };
    const frame = window.requestAnimationFrame(() => {
      const target = focusInitial();
      if (target && document.activeElement !== target) retry = window.setTimeout(focusInitial, 80);
    });

    const onKeyDown = (event) => {
      if (event.key === "Escape") latest.current.onClose();
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(retry);
      document.removeEventListener("keydown", onKeyDown);
      background.forEach((el) => el.removeAttribute("inert"));
      const { returnFocusRef: back } = latest.current;
      const returnTo = (back && back.current) || opener;
      if (returnTo && returnTo.isConnected && typeof returnTo.focus === "function") returnTo.focus();
    };
  }, [open]);
}
