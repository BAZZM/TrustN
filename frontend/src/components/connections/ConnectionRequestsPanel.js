import React from "react";
import { motion, useReducedMotion } from "framer-motion";

function getSecondaryStatus(request, t) {
  const intermediaryApproved = Boolean(request.approved_by_intermediary_at);
  const targetApproved = Boolean(request.approved_by_target_at);

  return [
    intermediaryApproved ? t("requests.intermediaryApproved") : t("requests.awaitingIntermediary"),
    targetApproved ? t("requests.targetApproved") : t("requests.awaitingTarget"),
  ].join(" / ");
}

export default function ConnectionRequestsPanel({
  requests,
  userId,
  isOpen,
  onToggle,
  onRespond,
  respondingId,
  t,
}) {
  const requestCount = requests.length;
  const reduceMotion = useReducedMotion();
  const drawerTransition = reduceMotion
    ? { duration: 0.12, ease: "linear" }
    : { duration: 0.22 };
  const pendingAria =
    requestCount > 0 ? t("requests.pendingToggleAria").replace("{count}", String(requestCount)) : null;

  return (
    <section className="connections__requests-panel">
      <button
        type="button"
        className={
          "connections__requests-toggle" +
          (requestCount > 0 && !isOpen ? " connections__requests-toggle--has-pending" : "")
        }
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-label={
          pendingAria ? `${t("requests.title")}. ${pendingAria}` : t("requests.title")
        }
      >
        <span className="connections__requests-toggle-copy">
          <span className="connections__requests-title">{t("requests.title")}</span>
          <span className="connections__requests-caption">
            {requestCount > 0 ? t("requests.pendingSummary") : t("requests.none")}
          </span>
        </span>
        <span className="connections__requests-toggle-meta">
          {requestCount > 0 && (
            <span className="connections__requests-badge" aria-hidden="true">
              {requestCount}
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
          {requestCount === 0 && <p className="connections__empty-inline">{t("requests.none")}</p>}

          {requestCount > 0 && (
            <ul className="connections__requests-list">
              {requests.map((request) => {
                const isSecondary = request.circle_type === "secondary" && request.intermediary_id;
                const isTarget = String(request.target_user_id) === String(userId);
                const isIntermediary =
                  request.intermediary_id && String(request.intermediary_id) === String(userId);
                const isBusy = respondingId === request.id;

                return (
                  <li key={request.id} className="connection-request">
                    <div className="connection-request__body">
                      <span className="connection-request__name">
                        {request.requester_name} {t("requests.wantsToConnect")} {request.target_name}
                        {isSecondary && request.intermediary_name
                          ? ` ${t("requests.via")} ${request.intermediary_name}`
                          : ""}
                      </span>
                      <span className="connection-request__meta">
                        {request.circle_type === "inner"
                          ? t("connections.inner")
                          : t("connections.secondary")}
                      </span>
                      {isSecondary && (
                        <span className="connection-request__meta">
                          {getSecondaryStatus(request, t)}
                        </span>
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
                        ((isIntermediary && request.approved_by_intermediary_at) ||
                          (isTarget && request.approved_by_target_at)) && (
                          <span className="connection-request__waiting">
                            {t("requests.waitingForOtherApproval")}
                          </span>
                        )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </motion.div>
      )}
    </section>
  );
}
