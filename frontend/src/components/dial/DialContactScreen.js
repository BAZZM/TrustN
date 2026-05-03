import React, { useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "../../i18n";
import DialToolbar from "./DialToolbar";
import { DIAL_CONFIG } from "./dialConfig";
import UnifiedSecondarySearchBar from "../connections/UnifiedSecondarySearchBar";
import "./DialContactScreen.css";

function contactName(c) {
  return c.peer_name || c.contact_name || c.user_name || c.name || "?";
}

function contactInitial(c) {
  return contactName(c).charAt(0).toUpperCase();
}

function RelationshipDiscoveryCard({ contact, onRequest, t }) {
  const name = contactName(contact);
  const job = contact.peer_job_role || "";
  const exp = contact.peer_experience || "";
  const meta = [job, exp].filter(Boolean).join(" · ");

  return (
    <motion.div
      className="dial-discovery-card"
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
    >
      <div className="dial-discovery-card__main">
        <span className="dial-discovery-card__avatar">{contactInitial(contact)}</span>
        <div className="dial-discovery-card__copy">
          <span className="dial-discovery-card__name">{name}</span>
          {meta ? <span className="dial-discovery-card__meta">{meta}</span> : null}
        </div>
      </div>
      <motion.button
        type="button"
        className="dial-discovery-card__cta"
        onClick={() => onRequest?.(contact)}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.97 }}
      >
        {t("contacts.requestIntroduction")}
      </motion.button>
    </motion.div>
  );
}

function ContactChip({ contact, isSelected, onClick, circle, extraClassName = "" }) {
  const name = contactName(contact);
  return (
    <motion.button
      type="button"
      className={`dial-chip ${isSelected ? "dial-chip--selected" : ""} dial-chip--${circle} ${extraClassName}`.trim()}
      onClick={onClick}
      whileTap={{ scale: 0.95 }}
      layout
    >
      <span className="dial-chip__avatar">{contactInitial(contact)}</span>
      <span className="dial-chip__name">{name}</span>
      {contact.peer_job_role && <span className="dial-chip__role">{contact.peer_job_role}</span>}
    </motion.button>
  );
}

function ContactDetail({ contact, circle, onClose, onAction, actionLabel }) {
  if (!contact) return null;
  const name = contactName(contact);
  const phone = contact.peer_phone || contact.phone || null;
  const jobRole = contact.peer_job_role || contact.job_role || null;
  const industry = contact.peer_industry || contact.industry || null;
  const experience = contact.peer_experience || contact.experience || null;

  return (
    <motion.div
      className="dial-detail"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.2 }}
    >
      <div className="dial-detail__header">
        <div className="dial-detail__avatar">{name.charAt(0).toUpperCase()}</div>
        <div className="dial-detail__info">
          <h3 className="dial-detail__name">{name}</h3>
          {phone && circle === "inner" && (
            <p className="dial-detail__phone">{phone}</p>
          )}
          {jobRole && <p className="dial-detail__role">{jobRole}{industry ? ` · ${industry}` : ""}</p>}
          {experience && <p className="dial-detail__exp">{experience}</p>}
        </div>
      </div>
      <span className={`dial-detail__badge dial-detail__badge--${circle}`}>
        {circle === "inner" ? "Inner circle" : circle === "secondary" ? "Secondary" : "Prospective"}
      </span>
      <div className="dial-detail__actions">
        {actionLabel && onAction && (
          <motion.button
            type="button"
            className="dial-detail__btn dial-detail__btn--primary"
            onClick={() => onAction(contact)}
            whileTap={{ scale: 0.97 }}
          >
            {actionLabel}
          </motion.button>
        )}
        <motion.button
          type="button"
          className="dial-detail__btn dial-detail__btn--ghost"
          onClick={onClose}
          whileTap={{ scale: 0.97 }}
        >
          Close
        </motion.button>
      </div>
    </motion.div>
  );
}

export default function DialContactScreen({
  innerConnections = [],
  secondaryConnections = [],
  prospectiveContacts = [],
  onSelectContact,
  onAddToSecondary,
  fetchSecondaryForInnerCircle,
  selectedInnerCircleUserId = null,
  unifiedSecondaryConnections = [],
  unifiedSearchValue = "",
  onUnifiedSearchChange,
  secondaryUsesUnifiedSearch = false,
  loadingSecondary = false,
  theme,
  t: tProp,
  onRequestIntroduction,
}) {
  const tFromHook = useTranslations("en");
  const t = tProp || tFromHook || ((key) => key);

  const [search, setSearch] = useState("");
  const [selectedContact, setSelectedContact] = useState(null);
  const [selectedCircle, setSelectedCircle] = useState(null);
  const filteredInner = useMemo(() => {
    const q = (search || "").trim().toLowerCase();
    if (!q) return innerConnections;
    return innerConnections.filter((c) =>
      contactName(c).toLowerCase().includes(q) ||
      (c.peer_job_role?.toLowerCase().includes(q)) ||
      (c.peer_phone != null && String(c.peer_phone).includes(search))
    );
  }, [innerConnections, search]);

  const filteredSecondary = useMemo(() => {
    if (secondaryUsesUnifiedSearch) return unifiedSecondaryConnections || [];

    const base = secondaryConnections;
    const q = (search || "").trim().toLowerCase();
    if (!q) return base;
    return base.filter((c) =>
      contactName(c).toLowerCase().includes(q) ||
      (c.peer_job_role?.toLowerCase().includes(q)) ||
      (c.peer_industry?.toLowerCase().includes(q))
    );
  }, [secondaryConnections, secondaryUsesUnifiedSearch, search, unifiedSecondaryConnections]);
  const filteredProspective = useMemo(() => {
    const q = (search || "").trim().toLowerCase();
    if (!q) return prospectiveContacts;
    return prospectiveContacts.filter((c) =>
      contactName(c).toLowerCase().includes(q) ||
      (c.job_role?.toLowerCase().includes(q))
    );
  }, [prospectiveContacts, search]);

  const handleSelectInner = useCallback((contact) => {
    setSelectedContact(contact);
    setSelectedCircle("inner");
    onSelectContact?.(contact);
    if (contact?.peer_id && fetchSecondaryForInnerCircle) {
      fetchSecondaryForInnerCircle(contact.peer_id);
    }
  }, [onSelectContact, fetchSecondaryForInnerCircle]);

  const handleSelectSecondary = useCallback((contact) => {
    setSelectedContact(contact);
    setSelectedCircle("secondary");
    onSelectContact?.(contact);
  }, [onSelectContact]);

  const handleSelectProspective = useCallback((contact) => {
    setSelectedContact(contact);
    setSelectedCircle("prospective");
    onSelectContact?.(contact);
  }, [onSelectContact]);

  const handleClose = useCallback(() => {
    setSelectedContact(null);
    setSelectedCircle(null);
    onSelectContact?.(null);
  }, [onSelectContact]);

  const hasAny =
    innerConnections.length > 0 ||
    secondaryConnections.length > 0 ||
    prospectiveContacts.length > 0;

  return (
    <section className="dial-contact-screen" aria-label="Dial contact view">
      <DialToolbar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder={t("contacts.searchPlaceholder") || DIAL_CONFIG.search.placeholder}
      />

      {!hasAny && (
        <p className="dial-contact-screen__empty">
          {t("contacts.noContacts") || "No contacts yet. Import your contact list to find people on Trust Network."}
        </p>
      )}

      {/* Inner circle */}
      {filteredInner.length > 0 && (
        <div className="dial-ring">
          <div className="dial-ring__header">
            <span className="dial-ring__label">Inner circle</span>
            <span className="dial-ring__count">{filteredInner.length}</span>
          </div>
          <div className="dial-ring__list">
            {filteredInner.map((c) => (
              <ContactChip
                key={c.peer_id || c.id}
                contact={c}
                circle="inner"
                extraClassName={c.peer_introduced ? "dial-chip--acquired-inner" : ""}
                isSelected={selectedContact === c}
                onClick={() => handleSelectInner(c)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Secondary / hybrid unified search */}
      {(secondaryUsesUnifiedSearch || filteredSecondary.length > 0) && (
        <div className="dial-ring">
          <div className="dial-ring__header">
            <span className="dial-ring__label">
              {selectedInnerCircleUserId ? t("contacts.discoveryViaInner") : "Secondary"}
            </span>
            <span className="dial-ring__count">{filteredSecondary.length}</span>
            {secondaryUsesUnifiedSearch && onUnifiedSearchChange && (
              <div className="dial-ring__filters dial-ring__filters--unified">
                <UnifiedSecondarySearchBar
                  id="contacts-radial-unified-secondary-search"
                  value={unifiedSearchValue}
                  onChange={onUnifiedSearchChange}
                  placeholder={t("contacts.unifiedSecondaryPlaceholder")}
                  ariaLabel={t("contacts.unifiedSecondaryAria")}
                  className="dial-ring__unified-search"
                />
              </div>
            )}
          </div>
          {loadingSecondary && <p className="dial-ring__loading">Loading…</p>}
          {secondaryUsesUnifiedSearch && !loadingSecondary && filteredSecondary.length === 0 && (
            <p className="dial-contact-screen__empty dial-contact-screen__empty--muted">
              {t("contacts.unifiedSecondaryEmpty")}
            </p>
          )}
          {selectedInnerCircleUserId ? (
            <div className="dial-discovery-list">
              {filteredSecondary.map((c) => (
                <RelationshipDiscoveryCard
                  key={c.peer_id || c.id}
                  contact={c}
                  onRequest={onRequestIntroduction}
                  t={t}
                />
              ))}
            </div>
          ) : (
            <div className="dial-ring__list">
              {filteredSecondary.map((c) => (
                <ContactChip
                  key={c.peer_id || c.id}
                  contact={c}
                  circle="secondary"
                  isSelected={selectedContact === c}
                  onClick={() => handleSelectSecondary(c)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Prospective */}
      {filteredProspective.length > 0 && (
        <div className="dial-ring">
          <div className="dial-ring__header">
            <span className="dial-ring__label">Prospective</span>
            <span className="dial-ring__count">{filteredProspective.length}</span>
          </div>
          <div className="dial-ring__list">
            {filteredProspective.map((c) => (
              <ContactChip
                key={c.user_id || c.id}
                contact={c}
                circle="prospective"
                isSelected={selectedContact === c}
                onClick={() => handleSelectProspective(c)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Detail overlay */}
      <AnimatePresence mode="wait">
        {selectedContact && (
          <ContactDetail
            key={selectedContact.peer_id || selectedContact.id}
            contact={selectedContact}
            circle={selectedCircle}
            onClose={handleClose}
            onAction={
              selectedCircle === "prospective" ? onAddToSecondary
              : selectedCircle === "secondary" ? onAddToSecondary
              : null
            }
            actionLabel={
              selectedCircle === "prospective" ? "Add to circle"
              : selectedCircle === "secondary" ? "Request connection"
              : null
            }
          />
        )}
      </AnimatePresence>
    </section>
  );
}
