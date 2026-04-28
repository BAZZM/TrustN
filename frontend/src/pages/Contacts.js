import React, { useState, useEffect, useMemo, useCallback } from "react";
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

  useEffect(() => {
    if (!user?.id) return;
    setLoading(true);
    Promise.all([
      axios.get(baseURL + "/api/contacts"),
      axios.get(baseURL + "/api/connections"),
    ])
      .then(([contactsRes, connectionsRes]) => {
        setContacts(contactsRes.data.contacts || []);
        setConnections(connectionsRes.data.connections || []);
      })
      .catch((err) => {
        console.error('Contacts fetch error:', err.response?.status, err.response?.data);
        setContacts([]);
        setConnections([]);
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

  // State for relationship-based secondary connections (when an inner circle contact is selected)
  const [relationshipSecondaryConnections, setRelationshipSecondaryConnections] = useState([]);
  const [selectedInnerCircleUserId, setSelectedInnerCircleUserId] = useState(null);
  const [loadingSecondaryConnections, setLoadingSecondaryConnections] = useState(false);
  const [secondaryJobFilter, setSecondaryJobFilter] = useState("");
  const [secondaryIndustryFilter, setSecondaryIndustryFilter] = useState("");

  // Fetch secondary connections for a selected inner circle contact
  const fetchSecondaryConnectionsForInnerCircle = useCallback(async (innerCircleUserId) => {
    if (!innerCircleUserId || !user?.id) return;
    setLoadingSecondaryConnections(true);
    try {
      const params = new URLSearchParams();
      if (secondaryJobFilter) params.append('job_role', secondaryJobFilter);
      if (secondaryIndustryFilter) params.append('industry', secondaryIndustryFilter);
      const queryString = params.toString();
      const suffix = queryString ? "?" + queryString : "";
      const url = baseURL + "/api/connections/secondary-for/" + innerCircleUserId + suffix;
      const response = await axios.get(url);
      setRelationshipSecondaryConnections(response.data.secondaryConnections || []);
      setSelectedInnerCircleUserId(innerCircleUserId);
    } catch (err) {
      console.error('Error fetching secondary connections:', err);
      setRelationshipSecondaryConnections([]);
      setSelectedInnerCircleUserId(null);
    } finally {
      setLoadingSecondaryConnections(false);
    }
  }, [user, baseURL, secondaryJobFilter, secondaryIndustryFilter]);

  // Debounced effect for filter changes
  useEffect(() => {
    if (!selectedInnerCircleUserId) return;
    const timeoutId = setTimeout(() => {
      fetchSecondaryConnectionsForInnerCircle(selectedInnerCircleUserId);
    }, 300);
    return () => clearTimeout(timeoutId);
  }, [secondaryJobFilter, secondaryIndustryFilter, selectedInnerCircleUserId, fetchSecondaryConnectionsForInnerCircle]);

  function handleImport() {
    if (!user?.id || !importText.trim()) return;
    const lines = importText
      .split(/\n/)
      .map((line) => {
        const parts = line.split(/[,;\t]/).map((p) => p.trim());
        return { phone: parts[0] || "", name: parts[1] || "" };
      })
      .filter((c) => c.phone);
    if (lines.length === 0) return;
    setImporting(true);
    axios
      .post(baseURL + "/api/contacts/import", { contacts: lines })
      .then(() => {
        setImportText("");
        return axios.get(baseURL + "/api/contacts");
      })
      .then((r) => setContacts(r.data.contacts || []))
      .catch(() => {})
      .finally(() => setImporting(false));
  }

  function openAddToSecondary(contact) {
    if (!contact.user_id) return;
    setAddingFor(contact);
    axios
      .get(baseURL + "/api/contacts/possible-intermediaries", { params: { target_user_id: contact.user_id } })
      .then((r) => setIntermediaries(r.data.intermediaries || []))
      .catch(() => setIntermediaries([]));
  }

  function sendSecondaryRequest(intermediaryId) {
    if (!addingFor?.user_id || !user?.id) return;
    setSendingRequest(true);
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
      .catch(() => {})
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
          </div>
        )}
      </section>

      {/* View mode: Grid / List / Radial */}
      <div className="contacts__view-mode">
        <button
          type="button"
          className={`contacts__view-btn ${viewMode === VIEW_GRID ? "contacts__view-btn--active" : ""}`}
          onClick={() => setViewMode(VIEW_GRID)}
        >
          {t("contacts.viewGrid")}
        </button>
        <button
          type="button"
          className={`contacts__view-btn ${viewMode === VIEW_LIST ? "contacts__view-btn--active" : ""}`}
          onClick={() => setViewMode(VIEW_LIST)}
        >
          {t("contacts.viewList")}
        </button>
        <button
          type="button"
          className={`contacts__view-btn ${viewMode === VIEW_RADIAL ? "contacts__view-btn--active" : ""}`}
          onClick={() => setViewMode(VIEW_RADIAL)}
        >
          {t("contacts.viewRadial")}
        </button>
      </div>

      <section className="contacts__list-wrap">
        {viewMode === VIEW_RADIAL && (
          <div className="contacts__radial-view">
            <DialContactScreen
              innerConnections={innerConnections}
              secondaryConnections={secondaryConnections}
              prospectiveContacts={prospectiveContacts}
              onSelectContact={(item) => {
                setRadialSelected(item);
                if (!item) {
                  setSelectedInnerCircleUserId(null);
                  setRelationshipSecondaryConnections([]);
                  setSecondaryJobFilter("");
                  setSecondaryIndustryFilter("");
                  return;
                }
                if (item.peer_id && innerConnections.some((c) => c.peer_id === item.peer_id)) {
                  fetchSecondaryConnectionsForInnerCircle(item.peer_id);
                } else {
                  setSelectedInnerCircleUserId(null);
                  setRelationshipSecondaryConnections([]);
                  setSecondaryJobFilter("");
                  setSecondaryIndustryFilter("");
                }
              }}
              onAddToSecondary={(item) => item && openAddToSecondary(item)}
              fetchSecondaryForInnerCircle={fetchSecondaryConnectionsForInnerCircle}
              selectedInnerCircleUserId={selectedInnerCircleUserId}
              relationshipSecondaryConnections={relationshipSecondaryConnections}
              loadingSecondary={loadingSecondaryConnections}
              jobFilterValue={secondaryJobFilter}
              industryFilterValue={secondaryIndustryFilter}
              onJobFilterChange={setSecondaryJobFilter}
              onIndustryFilterChange={setSecondaryIndustryFilter}
              theme={theme}
              t={t}
            />
          </div>
        )}

        {(viewMode === VIEW_GRID || viewMode === VIEW_LIST) && (
          <>
            <h2 className="contacts__section-title">{t("contacts.yourContacts")}</h2>
            {loading && <p className="contacts__loading">Loading…</p>}
            {!loading && contacts.length === 0 && (
              <p className="contacts__empty">{t("contacts.noContacts")}</p>
            )}
            {!loading && contacts.length > 0 && (
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
                        {c.user_name} · {c.job_role}
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
