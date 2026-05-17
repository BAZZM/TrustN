import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { motion } from "framer-motion";
import { useApp } from "../context/AppContext";
import { useTranslations } from "../i18n";
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

function formatTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildRequestText(request, currentUserId, t) {
  const isOutbound = String(request.requester_id) === String(currentUserId);
  const isSecondary = request.circle_type === "secondary" && request.intermediary_id;

  if (isOutbound) {
    return isSecondary
      ? t("activity.sentSecondary")
          .replace("{target}", request.target_name || "—")
          .replace("{intermediary}", request.intermediary_name || "—")
      : t("activity.sentInner").replace("{target}", request.target_name || "—");
  }

  if (isSecondary && String(request.intermediary_id) === String(currentUserId)) {
    return t("activity.needsVouch")
      .replace("{requester}", request.requester_name || "—")
      .replace("{target}", request.target_name || "—");
  }

  return t("activity.needsResponse").replace("{requester}", request.requester_name || "—");
}

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
        setError(err.response?.data?.error || "Could not load activity.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [baseURL, user?.id]);

  const events = useMemo(() => {
    const requestEvents = [...inbox, ...sent]
      .sort((left, right) => new Date(right.created_at || 0) - new Date(left.created_at || 0))
      .slice(0, 8)
      .map((request) => ({
        id: `request-${request.id}`,
        type: inbox.some((item) => item.id === request.id) ? "attention" : "sent",
        text: buildRequestText(request, user?.id, t),
        time: formatTime(request.created_at),
        href: "/connections",
      }));

    if (dashboard) {
      requestEvents.push({
        id: "snapshot",
        type: "system",
        text: t("activity.snapshot")
          .replace("{inner}", String(dashboard.kpis?.inner?.total ?? 0))
          .replace("{secondary}", String(dashboard.kpis?.secondary?.total ?? 0)),
        time: formatTime(dashboard.computed_at),
        href: "/",
      });
    }

    return requestEvents;
  }, [dashboard, inbox, sent, t, user?.id]);

  const summary = [
    { key: "inbox", value: inbox.length, label: t("activity.summaryInbox"), href: "/connections" },
    { key: "sent", value: sent.length, label: t("activity.summarySent"), href: "/connections" },
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
        <h1 className="activity__title">Activity</h1>
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
      {error && (
        <div className="activity__state activity__state--error" role="alert">
          {error}
        </div>
      )}

      {!loading && !error && events.length === 0 && (
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
