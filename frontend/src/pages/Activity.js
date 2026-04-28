import React from "react";
import { motion } from "framer-motion";
import "./Activity.css";

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.04, delayChildren: 0.06 },
  },
};

const item = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0 },
};

export default function Activity() {
  const events = [
    { id: 1, type: "connection", text: "Trust link updated", time: "Soon" },
    { id: 2, type: "system", text: "Network synced", time: "Soon" },
    { id: 3, type: "info", text: "Activity feed will show recent events", time: "-" },
  ];

  return (
    <motion.div
      className="page activity"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      <motion.header
        className="activity__header"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <h1 className="activity__title">Activity</h1>
        <p className="activity__subtitle">Recent events in your network.</p>
      </motion.header>

      <motion.ul
        className="activity__timeline"
        variants={container}
        initial="hidden"
        animate="show"
      >
        {events.map((e) => (
          <motion.li key={e.id} variants={item} className="activity__item">
            <motion.div
              className="activity-card"
              whileHover={{ x: 4 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
            >
              <div className="activity-card__dot" />
              <div className="activity-card__content">
                <span className="activity-card__text">{e.text}</span>
                <span className="activity-card__time">{e.time}</span>
              </div>
            </motion.div>
          </motion.li>
        ))}
      </motion.ul>
    </motion.div>
  );
}
