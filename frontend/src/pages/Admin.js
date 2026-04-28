import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import axios from "axios";
import { useApp } from "../context/AppContext";
import "./Admin.css";

export default function Admin() {
  const { user, baseURL, token } = useApp();
  const [config, setConfig] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(null);

  useEffect(() => {
    if (!user?.id || !token) return;
    setLoading(true);
    setError(null);
    axios
      .get(baseURL + "/api/admin/config")
      .then((r) => setConfig(r.data.config || []))
      .catch((err) => {
        setError(err.response?.status === 403 ? "Admin access required" : err.response?.data?.error || "Failed to load");
        setConfig([]);
      })
      .finally(() => setLoading(false));
  }, [user, baseURL, token]);

  function handleToggle(item) {
    if (!user?.id || !token) return;
    setSaving(item.key);
    axios
      .patch(baseURL + "/api/admin/config/" + item.key, { value: !item.value })
      .then((r) => {
        setConfig((prev) =>
          prev.map((c) => (c.key === item.key ? { ...c, value: r.data.value } : c))
        );
      })
      .catch((err) => {
        setError(err.response?.data?.error || "Failed to update");
      })
      .finally(() => setSaving(null));
  }

  return (
    <motion.div
      className="page admin"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      <motion.header
        className="admin__header"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <h1 className="admin__title">Admin</h1>
        <p className="admin__subtitle">Testing toggles and feature flags</p>
      </motion.header>

      {error && (
        <div className="admin__error" role="alert">
          {error}
        </div>
      )}

      {loading && <p className="admin__loading">Loading…</p>}

      {!loading && config.length === 0 && !error && (
        <p className="admin__empty">No config items.</p>
      )}

      {!loading && config.length > 0 && (
        <motion.section
          className="admin__section"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <h2 className="admin__section-title">Testing toggles</h2>
          <p className="admin__section-hint">
            Toggle features for development and testing. Changes take effect immediately.
          </p>
          <ul className="admin__list">
            {config.map((item) => (
              <li key={item.key} className="admin__item">
                <div className="admin__item-main">
                  <span className="admin__item-key">{item.key}</span>
                  {item.description && (
                    <span className="admin__item-desc">{item.description}</span>
                  )}
                </div>
                <div className="admin__item-actions">
                  <button
                    type="button"
                    className={`admin__toggle ${item.value ? "admin__toggle--on" : ""}`}
                    onClick={() => handleToggle(item)}
                    disabled={saving === item.key}
                    aria-pressed={item.value}
                    aria-label={`${item.key}: ${item.value ? "on" : "off"}`}
                  >
                    <span className="admin__toggle-track">
                      <span className="admin__toggle-thumb" />
                    </span>
                  </button>
                  <span className="admin__item-value">{item.value ? "ON" : "OFF"}</span>
                </div>
              </li>
            ))}
          </ul>
        </motion.section>
      )}
    </motion.div>
  );
}
