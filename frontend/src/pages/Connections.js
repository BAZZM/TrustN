import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useLocation } from "react-router-dom";
import axios from "axios";
import { useApp } from "../context/AppContext";
import { useTranslations } from "../i18n";
import ConnectionRequestsPanel from "../components/connections/ConnectionRequestsPanel";
import ConnectionsGraph from "../components/connections/ConnectionsGraph";
import {
  MAX_VISIBLE_INNER,
  normalizeGraphNode,
  sortConnectionsByPriority,
} from "../components/connections/graphLayout";
import "./Connections.css";

export default function Connections() {
  const location = useLocation();
  const { user, baseURL } = useApp();
  const t = useTranslations(user?.locale ? user.locale : "en");
  const [narrowViewport, setNarrowViewport] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 767px)").matches : true
  );

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const apply = () => setNarrowViewport(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  const [connections, setConnections] = useState([]);
  const [requestInbox, setRequestInbox] = useState([]);
  const [requestSent, setRequestSent] = useState([]);
  const [loading, setLoading] = useState(true);
  const [requestsOpen, setRequestsOpen] = useState(false);
  const [respondingId, setRespondingId] = useState(null);
  const [focusUserId, setFocusUserId] = useState(null);
  const [secondaryByInnerId, setSecondaryByInnerId] = useState({});
  const [secondaryLoadingFor, setSecondaryLoadingFor] = useState(null);
  const [pickedSecondaryId, setPickedSecondaryId] = useState(null);
  const [introRequestSending, setIntroRequestSending] = useState(false);
  const [introRequestError, setIntroRequestError] = useState(null);
  const discoveryRef = useRef(null);

  const loadConnectionsPage = useCallback(() => {
    if (!user?.id) {
      return Promise.resolve();
    }

    setLoading(true);

    return Promise.all([
      axios.get(baseURL + "/api/connections"),
      axios.get(baseURL + "/api/connection-requests?scope=all"),
    ])
      .then(([connRes, reqRes]) => {
        setConnections(connRes.data.connections || []);
        setRequestInbox(reqRes.data.inbox || []);
        setRequestSent(reqRes.data.sent || []);
      })
      .catch(() => {
        setConnections([]);
        setRequestInbox([]);
        setRequestSent([]);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [baseURL, user]);

  useEffect(() => {
    loadConnectionsPage();
  }, [loadConnectionsPage]);

  const normalizedConnections = useMemo(
    () =>
      (connections || [])
        .map((item) => normalizeGraphNode(item, item?.circle_type))
        .filter(Boolean),
    [connections]
  );

  const innerConnections = useMemo(
    () => sortConnectionsByPriority(normalizedConnections.filter((item) => item.circleType === "inner")),
    [normalizedConnections]
  );

  const visibleInnerConnections = useMemo(() => {
    const base = innerConnections.slice(0, MAX_VISIBLE_INNER);

    if (!focusUserId) {
      return base;
    }

    if (base.some((item) => item.id === focusUserId)) {
      return base;
    }

    const focused = innerConnections.find((item) => item.id === focusUserId);

    if (!focused) {
      return base;
    }

    return [...base.slice(0, Math.max(0, MAX_VISIBLE_INNER - 1)), focused];
  }, [focusUserId, innerConnections]);

  const overflowInnerConnections = useMemo(() => {
    const visibleIds = new Set(visibleInnerConnections.map((item) => item.id));
    return innerConnections.filter((item) => !visibleIds.has(item.id));
  }, [innerConnections, visibleInnerConnections]);

  const focusedConnection = useMemo(
    () => innerConnections.find((item) => item.id === focusUserId) || null,
    [focusUserId, innerConnections]
  );

  const secondaryConnections = useMemo(() => {
    if (!focusUserId) {
      return [];
    }

    const items = secondaryByInnerId[focusUserId] || [];

    return sortConnectionsByPriority(
      items.map((item) => normalizeGraphNode(item, "secondary")).filter(Boolean)
    );
  }, [focusUserId, secondaryByInnerId]);

  const pickedSecondary = useMemo(
    () => secondaryConnections.find((s) => s.id === pickedSecondaryId) || null,
    [pickedSecondaryId, secondaryConnections]
  );

  /** Targets (peer ids) with a pending secondary intro you sent via the currently focused inner peer. */
  const pendingIntroTargetIds = useMemo(() => {
    const set = new Set();
    if (!user?.id || !focusedConnection?.rawId) return set;
    const viewerId = Number(user.id);
    const intermediaryId = Number(focusedConnection.rawId);
    for (const r of requestSent) {
      if (r.circle_type !== "secondary" || r.intermediary_id == null) continue;
      if (Number(r.requester_id) !== viewerId) continue;
      if (Number(r.intermediary_id) !== intermediaryId) continue;
      set.add(String(r.target_user_id));
    }
    return set;
  }, [focusedConnection?.rawId, requestSent, user?.id]);

  const isTripletIntroPending =
    Boolean(pickedSecondary?.rawId != null) &&
    pendingIntroTargetIds.has(String(pickedSecondary.rawId));

  useEffect(() => {
    if (!focusUserId) {
      return;
    }

    if (!innerConnections.some((item) => item.id === focusUserId)) {
      setFocusUserId(null);
      setPickedSecondaryId(null);
      setIntroRequestError(null);
    }
  }, [focusUserId, innerConnections]);

  const fetchSecondaryConnections = useCallback(
    async (innerNode) => {
      if (!innerNode?.rawId) {
        return;
      }

      const cacheKey = String(innerNode.id);
      setSecondaryLoadingFor(cacheKey);

      try {
        const response = await axios.get(
          `${baseURL}/api/connections/secondary-for/${innerNode.rawId}`
        );

        setSecondaryByInnerId((current) => ({
          ...current,
          [cacheKey]: response.data.secondaryConnections || [],
        }));
      } catch {
        setSecondaryByInnerId((current) => ({
          ...current,
          [cacheKey]: [],
        }));
      } finally {
        setSecondaryLoadingFor((current) => (current === cacheKey ? null : current));
      }
    },
    [baseURL]
  );

  const handleFocusConnection = useCallback(
    (innerNode) => {
      setPickedSecondaryId(null);
      setIntroRequestError(null);
      if (!innerNode) {
        setFocusUserId(null);
        return;
      }

      const cacheKey = String(innerNode.id);
      setFocusUserId(cacheKey);

      if (!secondaryByInnerId[cacheKey]) {
        fetchSecondaryConnections(innerNode);
      }
    },
    [fetchSecondaryConnections, secondaryByInnerId]
  );

  const handleResetFocus = useCallback(() => {
    setFocusUserId(null);
    setPickedSecondaryId(null);
    setIntroRequestError(null);
  }, []);

  const handleSecondarySelect = useCallback((node) => {
    if (!node?.id) return;
    setIntroRequestError(null);
    const id = String(node.id);
    setPickedSecondaryId((prev) => (prev === id ? null : id));
  }, []);

  const handleSecondaryQuickAdd = useCallback((node) => {
    if (!node?.id) return;
    setIntroRequestError(null);
    setPickedSecondaryId(String(node.id));
    requestAnimationFrame(() => {
      discoveryRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }, []);

  const sendIntroductionRequest = useCallback(() => {
    if (!user?.id || !focusedConnection?.rawId || !pickedSecondary?.rawId) return;
    if (pendingIntroTargetIds.has(String(pickedSecondary.rawId))) return;
    setIntroRequestSending(true);
    setIntroRequestError(null);
    axios
      .post(baseURL + "/api/connection-requests", {
        target_user_id: pickedSecondary.rawId,
        intermediary_id: focusedConnection.rawId,
        circle_type: "secondary",
      })
      .then(() => {
        setPickedSecondaryId(null);
        return loadConnectionsPage();
      })
      .catch((err) => {
        const msg = err.response?.data?.error || err.message || "Request failed";
        setIntroRequestError(msg);
      })
      .finally(() => setIntroRequestSending(false));
  }, [
    baseURL,
    focusedConnection,
    loadConnectionsPage,
    pendingIntroTargetIds,
    pickedSecondary,
    user?.id,
  ]);

  function respondToRequest(requestId, action) {
    setRespondingId(requestId);

    axios
      .post(baseURL + "/api/connection-requests/" + requestId + "/respond", { action })
      .then(() => loadConnectionsPage())
      .catch(() => {})
      .finally(() => {
        setRespondingId(null);
      });
  }

  const stats = useMemo(() => {
    const inViewTotal = t("connections.inViewOfTotal")
      .replace("{visible}", String(visibleInnerConnections.length))
      .replace("{total}", String(innerConnections.length));
    return [
      {
        label: t("connections.totalInner"),
        value: innerConnections.length,
      },
      {
        label: t("connections.inViewOfTotalLabel"),
        value: inViewTotal,
      },
      {
        label: t("connections.introQueue"),
        value:
          requestInbox.length + requestSent.length === 0
            ? "—"
            : `${requestInbox.length}/${requestSent.length}`,
      },
    ];
  }, [innerConnections.length, requestInbox.length, requestSent.length, t, visibleInnerConnections.length]);

  const isSecondaryLoading = Boolean(focusUserId && secondaryLoadingFor === focusUserId);
  const showTrustGraph = !loading && innerConnections.length > 0;
  const immersiveGraph = showTrustGraph && narrowViewport;
  const needsDockClearance =
    location.pathname === "/connections" && narrowViewport && !immersiveGraph;

  const pageHeader = (
    <motion.header
      className={`connections__header${showTrustGraph ? " connections__header--graph-context" : ""}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
    >
      <div>
        <h1 className="connections__title">{t("connections.title")}</h1>
        <p className="connections__subtitle">{t("connections.subtitle")}</p>
      </div>

      {!showTrustGraph && (
        <div className="connections__stats" aria-label={t("connections.networkSummary")}>
          {stats.map((stat) => (
            <div key={stat.label} className="connections__stat">
              <span className="connections__stat-value">{stat.value}</span>
              <span className="connections__stat-label">{stat.label}</span>
            </div>
          ))}
        </div>
      )}
    </motion.header>
  );

  const focusExtras = useMemo(() => {
    if (!focusedConnection || isSecondaryLoading) return null;
    if (secondaryConnections.length === 0) return null;

    return (
      <div ref={discoveryRef} className="connections__discovery">
        {!pickedSecondary && (
          <p className="connections__discovery-hint">{t("connections.pickSecondaryHint")}</p>
        )}
        {pickedSecondary && (
          <div className="connections__discovery-card">
            <div className="connections__discovery-card-head">
              <span className="connections__discovery-name">{pickedSecondary.name}</span>
              <span className="connections__discovery-meta">
                {[pickedSecondary.jobRole, pickedSecondary.industry].filter(Boolean).join(" · ") || "—"}
              </span>
            </div>
            <p className="connections__discovery-copy">
              {t("connections.discoveryBody")
                .replace("{intermediary}", focusedConnection.name)
                .replace("{target}", pickedSecondary.name)}
            </p>
            {introRequestError ? (
              <p className="connections__discovery-error" role="alert">
                {introRequestError}
              </p>
            ) : null}
            {isTripletIntroPending || introRequestSending ? (
              <div
                className="connections__discovery-actions connections__discovery-actions--wireframe"
                tabIndex={-1}
                aria-live="polite"
              >
                <div className="connections__discovery-wire-slot">
                  <span>
                    {introRequestSending
                      ? t("connections.requestIntroSending")
                      : t("connections.introPendingWireframe")}
                  </span>
                </div>
                <div className="connections__discovery-wire-slot" aria-hidden />
              </div>
            ) : (
              <div className="connections__discovery-actions">
                <button
                  type="button"
                  className="connections__discovery-actions-btn connections__discovery-actions-btn--primary"
                  onClick={(e) => {
                    e.stopPropagation();
                    sendIntroductionRequest();
                  }}
                >
                  {t("connections.requestIntro")}
                </button>
                <button
                  type="button"
                  className="connections__discovery-actions-btn connections__discovery-actions-btn--placeholder"
                  disabled
                  aria-disabled="true"
                  title={t("connections.requestDiscussionSoon")}
                  onClick={(e) => e.stopPropagation()}
                >
                  {t("connections.requestDiscussion")}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }, [
    focusedConnection,
    introRequestError,
    introRequestSending,
    isSecondaryLoading,
    isTripletIntroPending,
    pickedSecondary,
    secondaryConnections.length,
    sendIntroductionRequest,
    t,
  ]);

  const graphSharedProps = {
    currentUserName: user?.name || user?.phone,
    innerConnections: visibleInnerConnections,
    overflowInnerConnections,
    focusUserId,
    focusedConnection,
    secondaryConnections,
    secondaryLoading: isSecondaryLoading,
    onFocusConnection: handleFocusConnection,
    onResetFocus: handleResetFocus,
    onFocusOverflow: handleFocusConnection,
    onSelectSecondary: handleSecondarySelect,
    onSecondaryQuickAdd: handleSecondaryQuickAdd,
    pendingIntroTargetIds,
    selectedSecondaryId: pickedSecondaryId,
    focusExtras,
    t,
  };

  const statsChips = (
    <div className="connections__stats connections__stats--hud">
      {stats.map((stat) => (
        <div key={stat.label} className="connections__stat connections__stat--hud">
          <span className="connections__stat-value">{stat.value}</span>
          <span className="connections__stat-label">{stat.label}</span>
        </div>
      ))}
    </div>
  );

  return (
    <motion.div
      className={[
        "page",
        "connections",
        immersiveGraph ? "connections--immersive" : "",
        needsDockClearance ? "connections--dock-clearance" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      {showTrustGraph ? (
        immersiveGraph ? (
          <div className="connections__inner-flow connections__inner-flow--immersive">
            <ConnectionsGraph
              immersive
              {...graphSharedProps}
              statsSummary={statsChips}
              requestsSlot={
                <ConnectionRequestsPanel
                  inboxRequests={requestInbox}
                  sentRequests={requestSent}
                  userId={user?.id}
                  isOpen={requestsOpen}
                  onToggle={() => setRequestsOpen((current) => !current)}
                  onRespond={respondToRequest}
                  respondingId={respondingId}
                  t={t}
                  panelClassName="connections__requests-panel--embedded"
                />
              }
            />
          </div>
        ) : (
          <div className="connections__inner-flow">
            {pageHeader}
            <div className="connections__graph-stack">
              <ConnectionsGraph {...graphSharedProps} />
              <div
                className="connections__stats connections__stats--below-graph"
                aria-label={t("connections.networkSummary")}
              >
                {stats.map((stat) => (
                  <div key={stat.label} className="connections__stat">
                    <span className="connections__stat-value">{stat.value}</span>
                    <span className="connections__stat-label">{stat.label}</span>
                  </div>
                ))}
              </div>
              <ConnectionRequestsPanel
                inboxRequests={requestInbox}
                sentRequests={requestSent}
                userId={user?.id}
                isOpen={requestsOpen}
                onToggle={() => setRequestsOpen((current) => !current)}
                onRespond={respondToRequest}
                respondingId={respondingId}
                t={t}
              />
            </div>
          </div>
        )
      ) : (
        <>
          {pageHeader}

          {loading && <div className="connections__loading">{t("connections.loadingGraph")}</div>}

          {!loading && innerConnections.length === 0 && (
            <section className="connections__empty-state">
              <h2 className="connections__empty-title">{t("connections.emptyTitle")}</h2>
              <p className="connections__empty-copy">{t("connections.emptyBody")}</p>
              <ConnectionRequestsPanel
                inboxRequests={requestInbox}
                sentRequests={requestSent}
                userId={user?.id}
                isOpen={requestsOpen}
                onToggle={() => setRequestsOpen((current) => !current)}
                onRespond={respondToRequest}
                respondingId={respondingId}
                t={t}
              />
            </section>
          )}
        </>
      )}
    </motion.div>
  );
}
