import React, { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import axios from "axios";
import { useApp } from "../context/AppContext";
import { useTranslations } from "../i18n";
import DialContactScreen from "../components/dial/DialContactScreen";
import "../components/RadialContactWheel.css";
import "./Contacts.css";

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.04, delayChildren: 0.06 } } };
const item = { hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } };

const VIEW_GRID = "grid";
const VIEW_LIST = "list";
const VIEW_RADIAL = "radial";

export default function Contacts() {
  const { user, baseURL, theme } = useApp();
  const t = useTranslations(user?.locale ? user.locale : "en");
  const [contacts, setContacts] = useState([]);
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [importText, setImportText] = useState("");
  const [importing, setImporting] = useState(false);
  const [addingFor, setAddingFor] = useState(null);
  const [intermediaries, setIntermediaries] = useState([]);
  const [sendingRequest, setSendingRequest] = useState(false);
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768; // eslint-disable-line no-restricted-globals
  const [viewMode, setViewMode] = useState(isMobile ? VIEW_RADIAL : VIEW_GRID);
  const [importOpen, setImportOpen] = useState(false);
  const [, setRadialSelected] = useState(null); // used by DialContactScreen onSelectContact + sendSecondaryRequest
  const [loadError, setLoadError] = useState(false);
  const [importStatus, setImportStatus] = useState(null);
  const [modalError, setModalError] = useState(null);
  const [radialError, setRadialError] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    setLoading(true);
    setLoadError(false);
    Promise.all([
      axios.get(baseURL + "/api/contacts"),
      axios.get(baseURL + "/api/connections"),
    ])
      .then(([contactsRes, connectionsRes]) => {
        setContacts(contactsRes.data.contacts || []);
        setConnections(connectionsRes.data.connections || []);
      })
      .catch(() => {
        setContacts([]);
        setConnections([]);
        setLoadError(true);
      })
      .finally(() => setLoading(false));
  }, [user, baseURL]);

  const { innerConnections, secondaryConnections, prospectiveContacts, connectedPeerIds } = useMemo(() => {
    const inner = (connections || []).filter((c) => c.circle_type === "inner");
    const secondary = (connections || []).filter((c) => c.circle_type === "secondary");
    const peerIds = new Set([...inner, ...secondary].map((c) => c.peer_id));
    const prospective = (contacts || []).filter((c) => c.user_id && !peerIds.has(c.user_id));
    return { innerConnections: inner, secondaryConnections: secondary, prospectiveContacts: prospective, connectedPeerIds: peerIds };
  }, [connections, contacts]);

  /** Unified secondary-search; when an inner is selected, branch_only limits rows to that inner's discovery paths */
  const [hybridSecondaryResults, setHybridSecondaryResults] = useState([]);
  const [selectedInnerCircleUserId, setSelectedInnerCircleUserId] = useState(null);
  const [loadingHybridSecondaries, setLoadingHybridSecondaries] = useState(false);
  const [secondaryUnifiedSearchInput, setSecondaryUnifiedSearchInput] = useState("");
  const [debouncedSecondaryUnifiedQuery, setDebouncedSecondaryUnifiedQuery] = useState("");

  useEffect(() => {
    const tid = window.setTimeout(
      () => setDebouncedSecondaryUnifiedQuery((secondaryUnifiedSearchInput || "").trim()),
      320
    );
    return () => window.clearTimeout(tid);
  }, [secondaryUnifiedSearchInput]);

  useEffect(() => {
    if (!user?.id || viewMode !== VIEW_RADIAL) {
      return;
    }

    let cancelled = false;
    setLoadingHybridSecondaries(true);

    const params = new URLSearchParams({ limit: "200" });
    if (debouncedSecondaryUnifiedQuery) {
      params.set("q", debouncedSecondaryUnifiedQuery);
    }
    if (selectedInnerCircleUserId != null) {
      params.set("focused_inner_peer_id", String(selectedInnerCircleUserId));
      params.set("branch_only", "1");
    }

    axios
      .get(`${baseURL}/api/connections/secondary-search?${params.toString()}`)
      .then((res) => {
        if (!cancelled) {
          setHybridSecondaryResults(res.data.results || []);
          setRadialError(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHybridSecondaryResults([]);
          setRadialError(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingHybridSecondaries(false);
      });

    return () => {
      cancelled = true;
    };
  }, [baseURL, debouncedSecondaryUnifiedQuery, selectedInnerCircleUserId, user?.id, viewMode]);

  function handleImport() {
    if (!user?.id || !importText.trim()) return;
    const lines = importText
      .split(/\n/)
      .map((line) => {
        const parts = line.split(/[,;\t]/).map((p) => p.trim());
        return { phone: parts[0] || "", name: parts[1] || "" };
      })
      .filter((c) => c.phone);
    if (lines.length === 0) {
      setImportStatus({ type: "error", key: "contacts.importNoRows" });
      return;
    }
    setImporting(true);
    setImportStatus(null);
    axios
      .post(baseURL + "/api/contacts/import", { contacts: lines })
      .then(() => {
        setImportText("");
        return axios.get(baseURL + "/api/contacts");
      })
      .then((r) => {
        setContacts(r.data.contacts || []);
        setImportStatus({ type: "success", key: "contacts.importSuccess" });
      })
      .catch((err) => {
        setImportStatus({
          type: "error",
          message: err.response?.data?.error || t("contacts.importError"),
        });
      })
      .finally(() => setImporting(false));
  }

  function openAddToSecondary(contact) {
    if (!contact.user_id) return;
    setAddingFor(contact);
    setModalError(null);
    axios
      .get(baseURL + "/api/contacts/possible-intermediaries", { params: { target_user_id: contact.user_id } })
      .then((r) => setIntermediaries(r.data.intermediaries || []))
      .catch(() => {
        setIntermediaries([]);
        setModalError(t("contacts.intermediariesError"));
      });
  }

  function sendSecondaryRequest(intermediaryId) {
    if (!addingFor?.user_id || !user?.id) return;
    setSendingRequest(true);
    setModalError(null);
    axios
      .post(baseURL + "/api/connection-requests", {
        target_user_id: addingFor.user_id,
        intermediary_id: intermediaryId,
        circle_type: "secondary",
      })
      .then(() => {
        setAddingFor(null);
        setIntermediaries([]);
        setRadialSelected(null);
        return Promise.all([axios.get(baseURL + "/api/contacts"), axios.get(baseURL + "/api/connections")]);
      })
      .then(([cr, connr]) => {
        setContacts(cr.data.contacts || []);
        setConnections(connr.data.connections || []);
      })
      .catch((err) => {
        setModalError(err.response?.data?.error || t("contacts.requestError"));
      })
      .finally(() => setSendingRequest(false));
  }

  return (
    <motion.div
      className="page contacts"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      <motion.header
        className="contacts__header"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <h1 className="contacts__title">{t("contacts.title")}</h1>
        <p className="contacts__subtitle">{t("contacts.subtitle")}</p>
      </motion.header>

      <section className="contacts__import">
        <button
          type="button"
          className="contacts__import-toggle"
          onClick={() => setImportOpen((v) => !v)}
          aria-expanded={importOpen}
        >
          <span className="contacts__import-toggle-label">{t("contacts.import")}</span>
          <span className={`contacts__import-toggle-icon${importOpen ? " contacts__import-toggle-icon--open" : ""}`}>▾</span>
        </button>
        {importOpen && (
          <div className="contacts__import-body">
            <p className="contacts__hint">{t("contacts.importHint")}</p>
            <textarea
              id="contacts-import-text"
              name="importText"
              className="contacts__textarea"
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder="+1234567890, Jane Smith"
              rows={2}
              aria-label="Import contacts"
            />
            <motion.button
              type="button"
              className="contacts__btn contacts__btn--primary"
              onClick={handleImport}
              disabled={importing || !importText.trim()}
              whileTap={{ scale: 0.97 }}
            >
              {importing ? "Importing…" : t("contacts.import")}
            </motion.button>
            {importStatus && (
              <p
                className={`contacts__status contacts__status--${importStatus.type}`}
                role={importStatus.type === "error" ? "alert" : "status"}
              >
                {importStatus.message || t(importStatus.key)}
              </p>
            )}
          </div>
        )}
      </section>

      {/* View mode: Grid / List / Radial */}
      <div className="contacts__view-mode" role="group" aria-label={t("contacts.viewModeLabel")}>
        <button
          type="button"
          className={`contacts__view-btn ${viewMode === VIEW_GRID ? "contacts__view-btn--active" : ""}`}
          aria-pressed={viewMode === VIEW_GRID}
          onClick={() => setViewMode(VIEW_GRID)}
        >
          {t("contacts.viewGrid")}
        </button>
        <button
          type="button"
          className={`contacts__view-btn ${viewMode === VIEW_LIST ? "contacts__view-btn--active" : ""}`}
          aria-pressed={viewMode === VIEW_LIST}
          onClick={() => setViewMode(VIEW_LIST)}
        >
          {t("contacts.viewList")}
        </button>
        <button
          type="button"
          className={`contacts__view-btn ${viewMode === VIEW_RADIAL ? "contacts__view-btn--active" : ""}`}
          aria-pressed={viewMode === VIEW_RADIAL}
          onClick={() => setViewMode(VIEW_RADIAL)}
        >
          {t("contacts.viewRadial")}
        </button>
      </div>

      <section className="contacts__list-wrap">
        {/* One loading line for every view; the radial view would otherwise flash its "no contacts" empty state */}
        {loading && <p className="contacts__loading">{t("contacts.loading")}</p>}
        {viewMode === VIEW_RADIAL && !loading && (
          <div className="contacts__radial-view">
            <DialContactScreen
              innerConnections={innerConnections}
              secondaryConnections={secondaryConnections}
              prospectiveContacts={prospectiveContacts}
              onSelectContact={(item) => {
                setRadialSelected(item);
                if (!item) {
                  setSelectedInnerCircleUserId(null);
                  return;
                }
                if (item.peer_id && innerConnections.some((c) => c.peer_id === item.peer_id)) {
                  setSelectedInnerCircleUserId(item.peer_id);
                } else {
                  setSelectedInnerCircleUserId(null);
                }
              }}
              onAddToSecondary={(item) => item && openAddToSecondary(item)}
              onRequestIntroduction={(peer) =>
                openAddToSecondary({
                  user_id: peer.peer_id,
                  user_name: peer.peer_name,
                  phone: peer.peer_phone || "",
                  job_role: peer.peer_job_role || "",
                })
              }
              fetchSecondaryForInnerCircle={(id) =>
                id != null ? setSelectedInnerCircleUserId(id) : setSelectedInnerCircleUserId(null)
              }
              selectedInnerCircleUserId={selectedInnerCircleUserId}
              unifiedSecondaryConnections={hybridSecondaryResults}
              unifiedSearchValue={secondaryUnifiedSearchInput}
              onUnifiedSearchChange={setSecondaryUnifiedSearchInput}
              secondaryUsesUnifiedSearch
              loadingSecondary={loadingHybridSecondaries}
              theme={theme}
              t={t}
            />
            {radialError && (
              <p className="contacts__status contacts__status--error" role="alert">
                {t("contacts.radialError")}
              </p>
            )}
          </div>
        )}

        {(viewMode === VIEW_GRID || viewMode === VIEW_LIST) && (
          <>
            <h2 className="contacts__section-title">{t("contacts.yourContacts")}</h2>
            {!loading && loadError && (
              <div className="contacts__empty contacts__empty--error" role="alert">
                <p>{t("contacts.loadError")}</p>
              </div>
            )}
            {!loading && !loadError && contacts.length === 0 && (
              <div className="contacts__empty">
                <p>{t("contacts.noContacts")}</p>
                <button
                  type="button"
                  className="contacts__btn contacts__btn--secondary contacts__empty-action"
                  onClick={() => setImportOpen(true)}
                >
                  {t("contacts.import")}
                </button>
              </div>
            )}
            {!loading && !loadError && contacts.length > 0 && (
              <motion.ul
                className={`contacts__list ${viewMode === VIEW_GRID ? "contacts__list--grid" : "contacts__list--list"}`}
                variants={container}
                initial="hidden"
                animate="show"
              >
                {contacts.map((c) => (
                  <motion.li key={c.id} variants={item} className="contact-card">
                    <div className="contact-card__main">
                      <span className="contact-card__name">{c.contact_name || c.phone}</span>
                      <span className="contact-card__phone">{c.phone}</span>
                      {c.user_id ? (
                        <span className="contact-card__badge">{t("contacts.matched")}</span>
                      ) : (
                        <span className="contact-card__badge contact-card__badge--muted">
                          {t("contacts.notMatched")}
                        </span>
                      )}
                    </div>
                    {c.user_id && (
                      <div className="contact-card__meta">
                        {[c.user_name !== c.contact_name && c.user_name, c.job_role].filter(Boolean).join(" · ")}
                      </div>
                    )}
                    {c.user_id && !connectedPeerIds.has(c.user_id) && (
                      <button
                        type="button"
                        className="contact-card__btn"
                        onClick={() => openAddToSecondary(c)}
                      >
                        {t("contacts.addToSecondary")}
                      </button>
                    )}
                    {c.user_id && connectedPeerIds.has(c.user_id) && (
                      <span className="contact-card__badge">{t("contacts.inCircle") || "In circle"}</span>
                    )}
                  </motion.li>
                ))}
              </motion.ul>
            )}
          </>
        )}
      </section>

      {addingFor && (
        <motion.div
          className="contacts__modal"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          onClick={() => {
            setAddingFor(null);
            setIntermediaries([]);
            setModalError(null);
          }}
        >
          <motion.div
            className="contacts__modal-content"
            initial={{ scale: 0.95 }}
            animate={{ scale: 1 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3>Add {addingFor.user_name || addingFor.phone} to secondary circle</h3>
            <p className="contacts__modal-hint">
              Choose who will vouch for you (your inner-circle contact who knows them):
            </p>
            {modalError && (
              <p className="contacts__status contacts__status--error" role="alert">
                {modalError}
              </p>
            )}
            {intermediaries.length === 0 && (
              <p className="contacts__empty">No eligible intermediary found.</p>
            )}
            <ul className="contacts__intermediaries">
              {intermediaries.map((i) => (
                <li key={i.id}>
                  <button
                    type="button"
                    className="contacts__btn contacts__btn--secondary"
                    onClick={() => sendSecondaryRequest(i.id)}
                    disabled={sendingRequest}
                  >
                    {i.name} ({i.job_role})
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="contacts__btn"
              onClick={() => {
                setAddingFor(null);
                setIntermediaries([]);
                setModalError(null);
              }}
            >
              {t("common.cancel")}
            </button>
          </motion.div>
        </motion.div>
      )}
    </motion.div>
  );
}
