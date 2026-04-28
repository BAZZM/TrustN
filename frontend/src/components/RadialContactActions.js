import React, { useState } from "react";
import { Menu, MenuItem } from "@spaceymonk/react-radial-menu";
import { motion, AnimatePresence } from "framer-motion";

export default function RadialContactActions({ item, position, onClose, onAddToSecondary, theme }) {
  const [showMenu, setShowMenu] = useState(true);

  if (!item || !position) return null;

  const handleItemClick = (action) => {
    if (action === "add-secondary" && onAddToSecondary) {
      onAddToSecondary(item);
    }
    setShowMenu(false);
    setTimeout(() => onClose && onClose(), 100);
  };

  const name = item.peer_name || item.contact_name || item.user_name || "Contact";
  const isProspective = !!item.user_id && !item.peer_id;

  return (
    <AnimatePresence>
      {showMenu && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          style={{
            position: "fixed",
            left: position.x,
            top: position.y,
            zIndex: 1000,
            pointerEvents: "auto",
          }}
        >
          <Menu
            show={showMenu}
            onClose={() => {
              setShowMenu(false);
              setTimeout(() => onClose && onClose(), 100);
            }}
            position={{ x: 0, y: 0 }}
            animation="scale"
            theme={{
              "--rm-background": theme?.config?.accent ? `${theme.config.accent}ee` : "rgba(74, 85, 104, 0.95)",
              "--rm-color": "#ffffff",
              "--rm-hover-background": theme?.config?.accent || "#4a5568",
            }}
          >
            <MenuItem data={name} onClick={() => handleItemClick("view")}>
              View {name}
            </MenuItem>
            {isProspective && (
              <MenuItem data="add-secondary" onClick={(e, _, data) => handleItemClick(data)}>
                Add to Secondary Circle
              </MenuItem>
            )}
            <MenuItem data="close" onClick={(e, _, data) => handleItemClick(data)}>
              Close
            </MenuItem>
          </Menu>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
