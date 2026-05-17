import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { motion } from "framer-motion";
import { useApp } from "../context/AppContext";
import { useTranslations } from "../i18n";
import "./Dashboard.css";

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.08 },
  },
};

const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
};

function replaceTpl(str, map) {
  let out = str;
  Object.entries(map).forEach(([k, v]) => {
    out = out.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
  });
  return out;
}

function deltaLabel(kpi, t) {
  const c = kpi.comparison;
  if (c.window_previous === 0 && c.window_current === 0) return t("dashboard.deltaNeutral");
  if (c.window_previous === 0 && c.window_current > 0) return t("dashboard.deltaNew");
  if (c.delta_pct === null || Number.isNaN(c.delta_pct)) return t("dashboard.deltaNeutral");
  if (c.delta_pct === 0) return t("dashboard.deltaNeutral");
  const pct = Math.abs(c.delta_pct);
  if (c.delta_pct > 0) return replaceTpl(t("dashboard.deltaUp"), { pct });
  return replaceTpl(t("dashboard.deltaDown"), { pct });
}

export default function Dashboard() {
  const { user, baseURL } = useApp();
  const t = useTranslations(user?.locale ? user.locale : "en");
  const [dash, setDash] = useState(null);
  const [dashErr, setDashErr] = useState(null);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    axios
      .get(`${baseURL}/api/me/dashboard`)
      .then(({ data }) => {
        if (!cancelled) {
          setDash(data);
          setDashErr(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setDash(null);
          setDashErr(err.response?.data?.error || "Could not load dashboard.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [user, baseURL]);

  const kpiCards =
    dash &&
    [
      { key: "inner", title: t("dashboard.innerRing"), kpi: dash.kpis.inner },
      { key: "secondary", title: t("dashboard.secondaryRing"), kpi: dash.kpis.secondary },
      { key: "acquired_inner", title: t("dashboard.acquiredInner"), kpi: dash.kpis.acquired_inner },
    ];

  const freshness =
    dash?.computed_at &&
    replaceTpl(t("dashboard.dataFreshness"), {
      time: new Date(dash.computed_at).toLocaleString(),
    });

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
        <h1 className="dashboard__title">{t("dashboard.title")}</h1>
        <p className="dashboard__subtitle">{t("dashboard.subtitle")}</p>
        {freshness && <p className="dashboard__freshness">{freshness}</p>}
      </motion.div>

      {dashErr && (
        <div className="dashboard__banner dashboard__banner--error" role="alert">
          {dashErr}
        </div>
      )}

      {!dash && !dashErr && <p className="dashboard__loading">{t("dashboard.loading")}</p>}

      {dash && (
        <>
          {dash.actions && dash.actions.length > 0 && (
            <motion.div
              className="dashboard__actions"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <h2 className="dashboard__actions-title">{t("dashboard.needsAttention")}</h2>
              <ul className="dashboard__actions-list">
                {dash.actions.map((a) => (
                  <li key={a.id}>
                    <Link to={a.href} className="dashboard__action-link">
                      <span>{t(a.labelKey)}</span>
                      {a.badge != null ? (
                        <span className="dashboard__action-badge">{a.badge}</span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </motion.div>
          )}

          <motion.ul
            className="dashboard__cards"
            variants={container}
            initial="hidden"
            animate="show"
          >
            {kpiCards.map((card) => (
              <motion.li key={card.key} variants={item}>
                <div className="dashboard-card">
                  <div className="dashboard-card__header">
                    <span className="dashboard-card__title">{card.title}</span>
                  </div>
                  <div className="dashboard-card__value">{card.kpi.total}</div>
                  <div className="dashboard-card__metric">
                    {replaceTpl(t("dashboard.newInWindow"), { n: card.kpi.comparison.window_current })}
                  </div>
                  <div className="dashboard-card__delta">{deltaLabel(card.kpi, t)}</div>
                  <div className="dashboard-card__hint">{t("dashboard.windowCompare")}</div>
                </div>
              </motion.li>
            ))}
          </motion.ul>
        </>
      )}
    </motion.div>
  );
}
