import React from "react";
import { motion } from "framer-motion";

export default function RadialContactDetail({ item, onAddToSecondary, onClose, theme }) {
  if (!item) return null;

  const name = item.peer_name || item.contact_name || item.user_name || "Contact";
  const role = item.peer_job_role || item.job_role;
  const phone = item.peer_phone || item.phone;
  const isProspective = !!item.user_id && !item.peer_id;

  return (
    <motion.div
      className="radial-detail"
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.92 }}
      transition={{ type: "spring", damping: 25, stiffness: 300 }}
    >
      <div className="radial-detail__inner">
        <motion.div
          className="radial-detail__avatar"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.05, type: "spring", stiffness: 200 }}
          style={{ background: theme?.config?.accent ? `${theme.config.accent}33` : "rgba(74,85,104,0.2)" }}
        >
          {name.charAt(0).toUpperCase()}
        </motion.div>
        <h3 className="radial-detail__name">{name}</h3>
        {role && <p className="radial-detail__role">{role}</p>}
        {phone && <p className="radial-detail__phone">{phone}</p>}
        <div className="radial-detail__actions">
          {isProspective && onAddToSecondary && (
            <motion.button
              type="button"
              className="radial-detail__btn radial-detail__btn--primary"
              onClick={() => onAddToSecondary(item)}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              Add to secondary circle
            </motion.button>
          )}
          {onClose && (
            <motion.button
              type="button"
              className="radial-detail__btn radial-detail__btn--ghost"
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
}
