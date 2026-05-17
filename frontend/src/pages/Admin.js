import React, { useState, useEffect } from "react";
import axios from "axios";
import { motion } from "framer-motion";
import { useApp } from "../context/AppContext";
import { useTranslations } from "../i18n";
import "./Admin.css";

export default function Admin() {
  const { user, baseURL, token } = useApp();
  const t = useTranslations(user?.locale ? user.locale : "en");
  const [config, setConfig] = useState([]);
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(null);

  useEffect(() => {
    if (!user?.id || !token) return;
    setLoading(true);
    setError(null);
    Promise.all([
        axios.get(baseURL + "/api/admin/config"),
        axios.get(baseURL + "/api/admin/system-health"),
      ])
      .then(([cfgRes, healthRes]) => {
        setConfig(cfgRes.data.config || []);
        setHealth(healthRes.data);
      })
      .catch((err) => {
        setError(err.response?.status === 403 ? "Admin access required" : err.response?.data?.error || "Failed to load");
        setConfig([]);
        setHealth(null);
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

  const rollupTime =
    health?.rollup?.last_computed_at &&
    new Date(health.rollup.last_computed_at).toLocaleString();

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

      {!loading && health && !error && (
        <motion.section
          className="admin__section admin__section--health"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
        >
          <h2 className="admin__section-title">{t("admin.systemHealth")}</h2>
          <p className="admin__section-hint">{t("admin.systemHealthHint")}</p>
          <ul className="admin__health-list">
            <li className="admin__health-row">
              <span>{t("admin.apiOk")}</span>
              <span className="admin__health-ok">{health.api?.ok ? "✓" : "—"}</span>
            </li>
            <li className="admin__health-row">
              <span>{t("admin.dbReachable")}</span>
              <span className={health.database?.reachable ? "admin__health-ok" : "admin__health-bad"}>
                {health.database?.reachable ? "✓" : t("admin.dbUnreachable")}
              </span>
            </li>
            <li className="admin__health-row">
              <span>{t("admin.rollupUpdated")}</span>
              <span>{rollupTime || "—"}</span>
            </li>
            <li className="admin__health-row">
              <span>{t("admin.registeredUsers")}</span>
              <span>{health.platform?.registered_users ?? "—"}</span>
            </li>
          </ul>
        </motion.section>
      )}

      {!loading && config.length === 0 && !error && (
        <p className="admin__empty">No config items.</p>
      )}

      {!loading && config.length > 0 && !error && (
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
