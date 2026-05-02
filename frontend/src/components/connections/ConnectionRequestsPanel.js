import React from "react";
import { motion, useReducedMotion } from "framer-motion";

function getInboundSecondaryStatus(request, t) {
  const intermediaryApproved = Boolean(request.approved_by_intermediary_at);
  const targetApproved = Boolean(request.approved_by_target_at);

  return [
    intermediaryApproved ? t("requests.intermediaryApproved") : t("requests.awaitingIntermediary"),
    targetApproved ? t("requests.targetApproved") : t("requests.awaitingTarget"),
  ].join(" · ");
}

function getOutboundStatus(request, t) {
  const isSecondary = request.circle_type === "secondary" && request.intermediary_id;
  if (!isSecondary) {
    return t("requests.outboundInnerPending");
  }
  if (!request.approved_by_intermediary_at) {
    return t("requests.outboundAwaitingIntermediary").replace("{name}", request.intermediary_name || "—");
  }
  if (!request.approved_by_target_at) {
    return t("requests.outboundAwaitingTarget").replace("{name}", request.target_name || "—");
  }
  return "";
}

function renderInboundRow(request, userId, onRespond, respondingId, t) {
  const isSecondary = request.circle_type === "secondary" && request.intermediary_id;
  const isTarget = String(request.target_user_id) === String(userId);
  const isIntermediary = request.intermediary_id && String(request.intermediary_id) === String(userId);
  const isBusy = respondingId === request.id;

  return (
    <li key={request.id} className="connection-request">
      <div className="connection-request__body">
        <span className="connection-request__name">
          {request.requester_name} {t("requests.wantsToConnect")} {request.target_name}
          {isSecondary && request.intermediary_name ? ` ${t("requests.via")} ${request.intermediary_name}` : ""}
        </span>
        <span className="connection-request__meta">
          {request.circle_type === "inner" ? t("connections.inner") : t("connections.secondary")}
        </span>
        {isSecondary && (
          <span className="connection-request__meta">{getInboundSecondaryStatus(request, t)}</span>
        )}
      </div>

      <div className="connection-request__actions">
        {!isSecondary && (isTarget || isIntermediary) && (
          <>
            <button
              type="button"
              className="connection-request__btn connection-request__btn--accept"
              onClick={() => onRespond(request.id, "accept")}
              disabled={isBusy}
            >
              {t("requests.accept")}
            </button>
            <button
              type="button"
              className="connection-request__btn connection-request__btn--decline"
              onClick={() => onRespond(request.id, "decline")}
              disabled={isBusy}
            >
              {t("requests.decline")}
            </button>
          </>
        )}

        {isSecondary && isIntermediary && !request.approved_by_intermediary_at && (
          <>
            <button
              type="button"
              className="connection-request__btn connection-request__btn--accept"
              onClick={() => onRespond(request.id, "approve_as_intermediary")}
              disabled={isBusy}
            >
              {t("requests.approveAsIntermediary")}
            </button>
            <button
              type="button"
              className="connection-request__btn connection-request__btn--decline"
              onClick={() => onRespond(request.id, "decline")}
              disabled={isBusy}
            >
              {t("requests.decline")}
            </button>
          </>
        )}

        {isSecondary && isTarget && !request.approved_by_target_at && (
          <>
            <button
              type="button"
              className="connection-request__btn connection-request__btn--accept"
              onClick={() => onRespond(request.id, "approve_as_target")}
              disabled={isBusy}
            >
              {t("requests.approveAsTarget")}
            </button>
            <button
              type="button"
              className="connection-request__btn connection-request__btn--decline"
              onClick={() => onRespond(request.id, "decline")}
              disabled={isBusy}
            >
              {t("requests.decline")}
            </button>
          </>
        )}

        {isSecondary &&
          isIntermediary &&
          request.approved_by_intermediary_at &&
          !request.approved_by_target_at && (
            <span className="connection-request__waiting">{t("requests.waitingForTargetAccept")}</span>
          )}
      </div>
    </li>
  );
}

export default function ConnectionRequestsPanel({
  inboxRequests = [],
  sentRequests = [],
  userId,
  isOpen,
  onToggle,
  onRespond,
  respondingId,
  t,
  panelClassName = "",
}) {
  const inboxCount = inboxRequests.length;
  const sentCount = sentRequests.length;
  const totalCount = inboxCount + sentCount;
  const reduceMotion = useReducedMotion();
  const drawerTransition = reduceMotion ? { duration: 0.12, ease: "linear" } : { duration: 0.22 };
  const pendingAria =
    totalCount > 0 ? t("requests.pendingToggleAria").replace("{count}", String(totalCount)) : null;

  return (
    <section className={["connections__requests-panel", panelClassName].filter(Boolean).join(" ")}>
      <button
        type="button"
        className={
          "connections__requests-toggle" +
          (inboxCount > 0 && !isOpen ? " connections__requests-toggle--has-pending" : "")
        }
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-label={pendingAria ? `${t("requests.title")}. ${pendingAria}` : t("requests.title")}
      >
        <span className="connections__requests-toggle-copy">
          <span className="connections__requests-title">{t("requests.title")}</span>
          <span className="connections__requests-caption">
            {totalCount > 0
              ? t("requests.queueSummary")
                  .replace("{inbox}", String(inboxCount))
                  .replace("{sent}", String(sentCount))
              : t("requests.none")}
          </span>
        </span>
        <span className="connections__requests-toggle-meta">
          {totalCount > 0 && (
            <span className="connections__requests-badge" aria-hidden="true">
              {inboxCount > 0 ? inboxCount : sentCount}
            </span>
          )}
          <span className="connections__requests-chevron" aria-hidden="true">
            {isOpen ? "-" : "+"}
          </span>
        </span>
      </button>

      {isOpen && (
        <motion.div
          className="connections__requests-drawer"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={drawerTransition}
        >
          {totalCount === 0 && <p className="connections__empty-inline">{t("requests.none")}</p>}

          {inboxCount > 0 && (
            <div className="connections__requests-section">
              <h3 className="connections__requests-section-title">{t("requests.sectionInbox")}</h3>
              <ul className="connections__requests-list">
                {inboxRequests.map((request) => renderInboundRow(request, userId, onRespond, respondingId, t))}
              </ul>
            </div>
          )}

          {sentCount > 0 && (
            <div className="connections__requests-section">
              <h3 className="connections__requests-section-title">{t("requests.sectionSent")}</h3>
              <ul className="connections__requests-list">
                {sentRequests.map((request) => (
                  <li key={`sent-${request.id}`} className="connection-request connection-request--sent">
                    <div className="connection-request__body">
                      <span className="connection-request__name">
                        {t("requests.youRequested")}{" "}
                        <strong>{request.target_name}</strong>
                        {request.circle_type === "secondary" && request.intermediary_name
                          ? ` ${t("requests.via")} ${request.intermediary_name}`
                          : ""}
                      </span>
                      <span className="connection-request__meta">{getOutboundStatus(request, t)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </motion.div>
      )}
    </section>
  );
}
