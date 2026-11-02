import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { motion } from "framer-motion";
import { useApp } from "../context/AppContext";
import { useTranslations } from "../i18n";
import { buildActivityEvents } from "./activityEvents";
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
  const { user, baseURL } = useApp();
  const t = useTranslations(user?.locale ? user.locale : "en");
  const [inbox, setInbox] = useState([]);
  const [sent, setSent] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      axios.get(`${baseURL}/api/connection-requests?scope=all`),
      axios.get(`${baseURL}/api/me/dashboard`),
    ])
      .then(([requestsRes, dashboardRes]) => {
        if (cancelled) return;
        setInbox(requestsRes.data?.inbox || []);
        setSent(requestsRes.data?.sent || []);
        setDashboard(dashboardRes.data || null);
      })
      .catch((err) => {
        if (cancelled) return;
        setInbox([]);
        setSent([]);
        setDashboard(null);
        // Empty string = failed with no server message; the copy is translated at render time.
        setError(err.response?.data?.error || "");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [baseURL, user?.id]);

  const events = useMemo(
    () => buildActivityEvents({ inbox, sent, dashboard, currentUserId: user?.id, t }),
    [dashboard, inbox, sent, t, user?.id]
  );

  // While loading, show a placeholder rather than zeros that read as real counts.
  const pending = loading ? "—" : null;
  const summary = [
    { key: "inbox", value: pending ?? inbox.length, label: t("activity.summaryInbox"), href: "/connections" },
    { key: "sent", value: pending ?? sent.length, label: t("activity.summarySent"), href: "/connections" },
    {
      key: "network",
      value: dashboard?.kpis?.inner?.total ?? "—",
      label: t("activity.summaryInner"),
      href: "/connections",
    },
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
        <h1 className="activity__title">{t("activity.title")}</h1>
        <p className="activity__subtitle">{t("activity.subtitle")}</p>
      </motion.header>

      <motion.ul className="activity__summary" variants={container} initial="hidden" animate="show">
        {summary.map((card) => (
          <motion.li key={card.key} variants={item}>
            <Link to={card.href} className="activity-summary-card">
              <span className="activity-summary-card__value">{card.value}</span>
              <span className="activity-summary-card__label">{card.label}</span>
            </Link>
          </motion.li>
        ))}
      </motion.ul>

      {loading && <p className="activity__state">{t("activity.loading")}</p>}
      {error !== null && (
        <div className="activity__state activity__state--error" role="alert">
          {error || t("activity.loadError")}
        </div>
      )}

      {!loading && error === null && events.length === 0 && (
        <section className="activity__empty">
          <h2>{t("activity.emptyTitle")}</h2>
          <p>{t("activity.emptyBody")}</p>
          <div className="activity__empty-actions">
            <Link to="/contacts" className="activity__action-link">
              {t("activity.actionImportContacts")}
            </Link>
            <Link to="/connections" className="activity__action-link activity__action-link--secondary">
              {t("activity.actionExploreConnections")}
            </Link>
          </div>
        </section>
      )}

      <motion.ul
        className="activity__timeline"
        variants={container}
        initial="hidden"
        animate="show"
      >
        {events.map((e) => (
          <motion.li key={e.id} variants={item} className="activity__item">
            <motion.div
              className={`activity-card activity-card--${e.type}`}
              whileHover={{ x: 4 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
            >
              <div className="activity-card__dot" aria-hidden />
              <div className="activity-card__content">
                <span className="activity-card__text">{e.text}</span>
                <span className="activity-card__time">{e.time}</span>
              </div>
              {e.href && (
                <Link to={e.href} className="activity-card__link">
                  {t("activity.view")}
                </Link>
              )}
            </motion.div>
          </motion.li>
        ))}
      </motion.ul>
    </motion.div>
  );
}
