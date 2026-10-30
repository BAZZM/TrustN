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
import UnifiedSecondarySearchBar from "../components/connections/UnifiedSecondarySearchBar";
import AskNetworkPanel from "../components/connections/AskNetworkPanel";
import "./Connections.css";

/** True iff the focused inner peer is one of the secondary's `via` introducers; matches app_can_intermediate. */
function secondaryIntroEligibleViaFocusedInner(graphNode, focusedInnerRawId) {
  if (!graphNode || focusedInnerRawId == null) return false;
  const inner = Number(focusedInnerRawId);
  if (!Number.isFinite(inner)) return false;
  return (graphNode.via || []).some((id) => Number(id) === inner);
}

/** Higher score = show earlier on the branch arc when an inner peer is focused (discovery rows beat orphan edges). */
function secondaryBranchArcPriority(norm, focusedRawId) {
  const inner = Number(focusedRawId);
  const viaHere = Number.isFinite(inner) && (norm?.via || []).some((id) => Number(id) === inner);
  if (viaHere) return 2;
  if (norm?.direct) return 1;
  return 0;
}

export default function Connections() {
  const location = useLocation();
  const { user, baseURL } = useApp();
  const t = useTranslations(user?.locale ? user.locale : "en");
  const [connections, setConnections] = useState([]);
  const [requestInbox, setRequestInbox] = useState([]);
  const [requestSent, setRequestSent] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [requestsOpen, setRequestsOpen] = useState(false);
  const [respondingId, setRespondingId] = useState(null);
  const [focusUserId, setFocusUserId] = useState(null);
  const [unifiedSecondaryRows, setUnifiedSecondaryRows] = useState([]);
  const [secondaryUnifiedLoading, setSecondaryUnifiedLoading] = useState(false);
  const [secondarySearchInput, setSecondarySearchInput] = useState("");
  const [debouncedSecondaryQuery, setDebouncedSecondaryQuery] = useState("");
  const [pickedSecondaryId, setPickedSecondaryId] = useState(null);
  const [introRequestSending, setIntroRequestSending] = useState(false);
  const [introRequestError, setIntroRequestError] = useState(null);
  const discoveryRef = useRef(null);
  // "Ask your network" picks a person who is only loaded once their introducer's branch opens.
  const pendingAskPickRef = useRef(null);
  const [askPinnedId, setAskPinnedId] = useState(null);

  const loadConnectionsPage = useCallback(() => {
    if (!user?.id) {
      return Promise.resolve();
    }

    setLoading(true);
    setLoadError(false);

    return Promise.all([
      // Inner ring only: secondaries load per focused branch below.
      axios.get(baseURL + "/api/connections/graph?secondary=0"),
      axios.get(baseURL + "/api/connection-requests?scope=all"),
    ])
      .then(([connRes, reqRes]) => {
        setConnections(connRes.data.inner || []);
        setRequestInbox(reqRes.data.inbox || []);
        setRequestSent(reqRes.data.sent || []);
      })
      .catch(() => {
        setConnections([]);
        setRequestInbox([]);
        setRequestSent([]);
        setLoadError(true);
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
        .map((item) => normalizeGraphNode(item, "inner"))
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

    if (base.some((item) => String(item.id) === String(focusUserId))) {
      return base;
    }

    const focused = innerConnections.find((item) => String(item.id) === String(focusUserId));

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
    () => innerConnections.find((item) => String(item.id) === String(focusUserId)) || null,
    [focusUserId, innerConnections]
  );

  const hasFocusedInnerPeer = useMemo(
    () =>
      focusUserId != null &&
      innerConnections.some((item) => String(item.id) === String(focusUserId)),
    [focusUserId, innerConnections]
  );

  const secondaryConnections = useMemo(() => {
    if (!focusUserId) {
      return [];
    }

    const mapped = (unifiedSecondaryRows || [])
      .map((item) => normalizeGraphNode(item, "secondary"))
      .filter(Boolean);

    const fid = focusedConnection?.rawId;
    if (fid == null) {
      return mapped;
    }

    return [...mapped].sort((a, b) => {
      if (askPinnedId) {
        if (a.id === askPinnedId && b.id !== askPinnedId) return -1;
        if (b.id === askPinnedId && a.id !== askPinnedId) return 1;
      }
      const byPri = secondaryBranchArcPriority(b, fid) - secondaryBranchArcPriority(a, fid);
      if (byPri !== 0) return byPri;
      return String(a.name || "").localeCompare(String(b.name || ""));
    });
  }, [askPinnedId, focusUserId, focusedConnection?.rawId, unifiedSecondaryRows]);

  const pickedSecondary = useMemo(
    () => secondaryConnections.find((s) => s.id === pickedSecondaryId) || null,
    [pickedSecondaryId, secondaryConnections]
  );

  const pickedIntroEligible = useMemo(() => {
    if (!pickedSecondary || focusedConnection?.rawId == null) return false;
    return secondaryIntroEligibleViaFocusedInner(pickedSecondary, focusedConnection.rawId);
  }, [pickedSecondary, focusedConnection?.rawId]);

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

    if (!innerConnections.some((item) => String(item.id) === String(focusUserId))) {
      setFocusUserId(null);
      setPickedSecondaryId(null);
      setIntroRequestError(null);
    }
  }, [focusUserId, innerConnections]);

  useEffect(() => {
    const t = window.setTimeout(
      () => setDebouncedSecondaryQuery((secondarySearchInput || "").trim()),
      320
    );
    return () => window.clearTimeout(t);
  }, [secondarySearchInput]);

  useEffect(() => {
    if (!focusUserId || !focusedConnection?.rawId) {
      setUnifiedSecondaryRows([]);
      setSecondaryUnifiedLoading(false);
      return;
    }

    const focusInner = focusedConnection.rawId;
    let cancelled = false;

    setSecondaryUnifiedLoading(true);

    const params = new URLSearchParams({
      limit: "200",
      focus: String(focusInner),
    });
    if (debouncedSecondaryQuery) {
      params.set("q", debouncedSecondaryQuery);
    }

    axios
      .get(`${baseURL}/api/connections/graph?${params.toString()}`)
      .then((res) => {
        if (!cancelled) {
          setUnifiedSecondaryRows(res.data?.secondary || []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setUnifiedSecondaryRows([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setSecondaryUnifiedLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [baseURL, debouncedSecondaryQuery, focusUserId, focusedConnection?.rawId]);

  const handleFocusConnection = useCallback((innerNode) => {
    setAskPinnedId(null);
    pendingAskPickRef.current = null;
    setPickedSecondaryId(null);
    setIntroRequestError(null);
    setSecondarySearchInput("");
    setDebouncedSecondaryQuery("");
    if (!innerNode) {
      setFocusUserId(null);
      return;
    }

    const cacheKey = String(innerNode.id);
    setFocusUserId(cacheKey);
  }, []);

  const handleResetFocus = useCallback(() => {
    setAskPinnedId(null);
    pendingAskPickRef.current = null;
    setFocusUserId(null);
    setPickedSecondaryId(null);
    setIntroRequestError(null);
    setSecondarySearchInput("");
    setDebouncedSecondaryQuery("");
    setUnifiedSecondaryRows([]);
  }, []);

  /** Jump to an "ask" result: open the introducer's branch and select the person once it loads. */
  const handleAskPick = useCallback(
    (result) => {
      if (result.kind === "inner") {
        handleFocusConnection({ id: String(result.id) });
        return;
      }
      if (result.path?.kind === "via_inner" && result.path.via?.id != null) {
        handleFocusConnection({ id: String(result.path.via.id) });
        pendingAskPickRef.current = String(result.id);
        setAskPinnedId(String(result.id));
      }
    },
    [handleFocusConnection]
  );

  useEffect(() => {
    const pending = pendingAskPickRef.current;
    if (!pending) return;
    if (secondaryConnections.some((s) => s.id === pending)) {
      pendingAskPickRef.current = null;
      setPickedSecondaryId(pending);
    }
  }, [secondaryConnections]);

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
    if (!secondaryIntroEligibleViaFocusedInner(pickedSecondary, focusedConnection.rawId)) return;
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

  const immersiveStatsKey = useMemo(
    () =>
      `${innerConnections.length}|${visibleInnerConnections.length}|${requestInbox.length}|${requestSent.length}`,
    [
      innerConnections.length,
      visibleInnerConnections.length,
      requestInbox.length,
      requestSent.length,
    ]
  );

  const isSecondaryLoading = Boolean(focusUserId && secondaryUnifiedLoading);
  const showTrustGraph = !loading && innerConnections.length > 0;
  // Full-bleed at every width; wide screens centre the graph column in CSS (see Connections.css).
  const immersiveGraph = showTrustGraph;
  const needsDockClearance = location.pathname === "/connections" && !immersiveGraph;

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

  const focusSearchSlot = hasFocusedInnerPeer ? (
    <UnifiedSecondarySearchBar
      key={`connections-unified-secondary-${focusUserId}`}
      id="connections-unified-secondary-search"
      value={secondarySearchInput}
      onChange={setSecondarySearchInput}
      placeholder={t("connections.unifiedSecondaryPlaceholder")}
      ariaLabel={t("connections.unifiedSecondaryAria")}
    />
  ) : null;

  const focusExtras = useMemo(() => {
    if (!focusedConnection) return null;

    if (isSecondaryLoading) {
      return (
        <div ref={discoveryRef} className="connections__discovery">
          <p className="connections__discovery-hint">{t("connections.loadingBranch")}</p>
        </div>
      );
    }

    if (secondaryConnections.length === 0) {
      return (
        <div ref={discoveryRef} className="connections__discovery">
          <p className="connections__discovery-hint">{t("connections.noSecondaryUnified")}</p>
        </div>
      );
    }

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
              {pickedIntroEligible
                ? t("connections.discoveryBody")
                    .replace("{intermediary}", focusedConnection.name)
                    .replace("{target}", pickedSecondary.name)
                : t("connections.introNotEligibleViaIntermediary")
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
                  disabled={!pickedIntroEligible}
                  aria-disabled={!pickedIntroEligible}
                  title={
                    pickedIntroEligible ? undefined : t("connections.introRequestDisabledTitle")
                  }
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
    pickedIntroEligible,
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
    focusSearchSlot,
    secondarySearchActive: Boolean(focusUserId && debouncedSecondaryQuery),
    renderAsk: ({ close }) => (
      <AskNetworkPanel
        baseURL={baseURL}
        t={t}
        onPick={(result) => {
          handleAskPick(result);
          close();
        }}
      />
    ),
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
              immersiveStatsKey={immersiveStatsKey}
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

          {!loading && loadError && (
            <section className="connections__empty-state" role="alert">
              <h2 className="connections__empty-title">{t("connections.loadErrorTitle")}</h2>
              <p className="connections__empty-copy">{t("connections.loadErrorBody")}</p>
              <button type="button" className="connections__fab" onClick={() => loadConnectionsPage()}>
                {t("connections.retry")}
              </button>
            </section>
          )}

          {!loading && !loadError && innerConnections.length === 0 && (
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
