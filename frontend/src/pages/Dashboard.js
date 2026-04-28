import React, { useEffect, useState } from "react";
import axios from "axios";
import { motion } from "framer-motion";
import "./Dashboard.css";

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.1 },
  },
};

const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
};

export default function Dashboard() {
  const [apiStatus, setApiStatus] = useState("loading");
  const [error, setError] = useState(null);

  useEffect(() => {
    const baseURL = process.env.REACT_APP_API_URL || "";
    axios
      .get(`${baseURL}/api/health`)
      .then(({ data }) => setApiStatus(data.status))
      .catch((err) => {
        setApiStatus("error");
        setError(err.message || "Connection failed");
      });
  }, []);

  const cards = [
    {
      title: "Connection status",
      value: apiStatus === "ok" ? "Connected" : apiStatus === "loading" ? "Checking..." : "Offline",
      subtitle: error || (apiStatus === "ok" ? "API is reachable" : null),
      status: apiStatus,
      delay: 0,
    },
    {
      title: "Your network",
      value: "-",
      subtitle: "Connections will appear here",
      delay: 1,
    },
    {
      title: "Recent activity",
      value: "-",
      subtitle: "Activity feed coming soon",
      delay: 2,
    },
  ];

  return (
    <motion.div
      className="page dashboard"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      <motion.div
        className="dashboard__welcome"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      >
        <h1 className="dashboard__title">Welcome back</h1>
        <p className="dashboard__subtitle">Here's what's happening in your trust network.</p>
      </motion.div>

      <motion.ul
        className="dashboard__cards"
        variants={container}
        initial="hidden"
        animate="show"
      >
        {cards.map((card, i) => (
          <motion.li key={i} variants={item}>
            <motion.div
              className="dashboard-card"
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              transition={{ type: "spring", stiffness: 400, damping: 25 }}
            >
              <div className="dashboard-card__header">
                <span className="dashboard-card__title">{card.title}</span>
                {card.status === "ok" && (
                  <span className="dashboard-card__badge dashboard-card__badge--ok">Live</span>
                )}
                {card.status === "error" && (
                  <span className="dashboard-card__badge dashboard-card__badge--error">Error</span>
                )}
              </div>
              <div className="dashboard-card__value">{card.value}</div>
              {card.subtitle && (
                <div className="dashboard-card__subtitle">{card.subtitle}</div>
              )}
            </motion.div>
          </motion.li>
        ))}
      </motion.ul>
    </motion.div>
  );
}
