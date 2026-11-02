import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import axios from "axios";
import { useApp } from "../context/AppContext";
import { useTranslations } from "../i18n";
import ToggleRow from "../components/ToggleRow";
import "./Settings.css";

const STATUS_DISMISS_MS = 3000;

export default function Settings() {
  const { user, setUser, token, theme, setTheme, locale, setLocale, themesList, baseURL } = useApp();
  const t = useTranslations(user && user.locale ? user.locale : "en");
  const [largeText, setLargeText] = useState(false);
  const [highContrast, setHighContrast] = useState(false);
  const [notifications, setNotifications] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState({ name: "", job_role: "", industry: "", experience: "" });
  const [profileSaving, setProfileSaving] = useState(false);
  const [status, setStatus] = useState(null);

  useEffect(function() {
    if (user) {
      setLargeText(!!user.large_text);
      setHighContrast(!!user.high_contrast);
      setNotifications(user.notifications_connection_requests !== false);
      setProfile({
        name: user.name || "",
        job_role: user.job_role || "",
        industry: user.industry || "",
        experience: user.experience || "",
      });
    }
  }, [user]);

  // Success toasts clear themselves; errors stay until the next action.
  useEffect(() => {
    if (status?.type !== "success") return undefined;
    const tid = window.setTimeout(() => setStatus(null), STATUS_DISMISS_MS);
    return () => window.clearTimeout(tid);
  }, [status]);

  // The stored default theme has no id, so fall back to the saved preference, then to a slug match.
  const activeThemeId =
    theme?.id ?? user?.theme_id ?? themesList.find((x) => x.slug === theme?.slug)?.id ?? null;

  function updatePref(key, value) {
    if (!user || !user.id) return;
    setSaving(true);
    setStatus(null);
    const payload = { [key]: value };
    axios.patch(baseURL + "/api/profile", payload).then(function(r) {
      setUser({ ...user, ...r.data }, token);
      setStatus({ type: "success", message: t("settings.saved") });
      setSaving(false);
    }).catch(function(err) {
      setStatus({ type: "error", message: err.response?.data?.error || t("settings.saveError") });
      setSaving(false);
    });
  }

  function handleLargeText(v) {
    setLargeText(v);
    updatePref("large_text", v);
  }
  function handleHighContrast(v) {
    setHighContrast(v);
    updatePref("high_contrast", v);
  }
  function handleNotifications(v) {
    setNotifications(v);
    updatePref("notifications_connection_requests", v);
  }
  function handleTheme(tid) {
    const th = themesList.find(function(x) { return x.id === parseInt(tid, 10); });
    if (th) setTheme(th);
    if (user && user.id) updatePref("theme_id", tid);
  }
  function handleLocale(loc) {
    setLocale(loc);
    if (user && user.id) updatePref("locale", loc);
  }

  function handleProfileSave(e) {
    e.preventDefault();
    if (!user?.id || profileSaving) return;
    const name = profile.name.trim();
    if (!name) {
      setStatus({ type: "error", message: t("settings.nameRequired") });
      return;
    }
    setProfileSaving(true);
    setStatus(null);
    axios.patch(baseURL + "/api/profile", { ...profile, name })
      .then(function(r) {
        setUser({ ...user, ...r.data }, token);
        setStatus({ type: "success", message: t("settings.profileSaved") });
      })
      .catch(function(err) {
        setStatus({ type: "error", message: err.response?.data?.error || t("settings.profileSaveError") });
      })
      .finally(function() { setProfileSaving(false); });
  }

  return (
    <motion.div className="page settings" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
      <motion.header className="settings__header" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
        <h1 className="settings__title">{t("settings.title")}</h1>
        <p className="settings__subtitle">{t("settings.subtitle")}</p>
      </motion.header>

      {/* Fixed above the nav so feedback shows next to whatever control was used, not at the page top */}
      <div className="settings__toast-region" aria-live="polite">
        {status && (
          <div
            className={`settings__status settings__status--${status.type}`}
            role={status.type === "error" ? "alert" : undefined}
          >
            {status.message}
          </div>
        )}
      </div>

      <motion.div className="settings__sections" initial="hidden" animate="show" variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: 0.08 } } }}>
        <motion.section className="settings-section" variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}>
          <h2 className="settings-section__title">{t("settings.profile")}</h2>
          <form onSubmit={handleProfileSave} className="settings-profile-form" noValidate>
            <div className="settings-profile-form__row">
              <label htmlFor="profile-name" className="settings-profile-form__label">Name</label>
              <input
                id="profile-name"
                type="text"
                className="settings-profile-form__input"
                value={profile.name}
                onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))}
                placeholder="Your name"
                required
                aria-required="true"
                autoComplete="name"
              />
            </div>
            <div className="settings-profile-form__row">
              <label htmlFor="profile-job" className="settings-profile-form__label">Job role</label>
              <input
                id="profile-job"
                type="text"
                className="settings-profile-form__input"
                value={profile.job_role}
                onChange={(e) => setProfile((p) => ({ ...p, job_role: e.target.value }))}
                placeholder="e.g. Software Engineer"
              />
            </div>
            <div className="settings-profile-form__row">
              <label htmlFor="profile-industry" className="settings-profile-form__label">Industry</label>
              <input
                id="profile-industry"
                type="text"
                className="settings-profile-form__input"
                value={profile.industry}
                onChange={(e) => setProfile((p) => ({ ...p, industry: e.target.value }))}
                placeholder="e.g. Technology"
              />
            </div>
            <div className="settings-profile-form__row">
              <label htmlFor="profile-experience" className="settings-profile-form__label">Experience</label>
              <textarea
                id="profile-experience"
                className="settings-profile-form__input settings-profile-form__input--textarea"
                value={profile.experience}
                onChange={(e) => setProfile((p) => ({ ...p, experience: e.target.value }))}
                placeholder="Brief description of your experience"
                rows={3}
              />
            </div>
            <button type="submit" className="settings-profile-form__btn" disabled={profileSaving}>
              {profileSaving ? "Saving…" : "Save profile"}
            </button>
          </form>
        </motion.section>

        <motion.section className="settings-section" variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}>
          <h2 className="settings-section__title">{t("settings.theme")}</h2>
          <ul className="settings-section__list">
            {themesList.map(function(th) {
              return (
                <li key={th.id}>
                  <motion.button type="button" className="settings-row" whileHover={{ x: 4 }} whileTap={{ scale: 0.99 }} onClick={function() { handleTheme(th.id); }}>
                    <span>{th.name}</span>
                    {activeThemeId === th.id ? <span className="settings-row__check" aria-label={t("settings.current")}>✓</span> : <span className="settings-row__arrow" aria-hidden="true">→</span>}
                  </motion.button>
                </li>
              );
            })}
            {themesList.length === 0 && (
              <li>
                <div className="settings-row"><span>Default (Dark)</span></div>
              </li>
            )}
          </ul>
        </motion.section>

        <motion.section className="settings-section" variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}>
          <h2 className="settings-section__title">{t("settings.language")}</h2>
          <ul className="settings-section__list">
            <li>
              <motion.button type="button" className="settings-row" whileHover={{ x: 4 }} onClick={function() { handleLocale("en"); }}>
                <span>English</span>
                {locale === "en" ? <span className="settings-row__check">✓</span> : <span className="settings-row__arrow">→</span>}
              </motion.button>
            </li>
          </ul>
        </motion.section>

        <motion.section className="settings-section" variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}>
          <h2 className="settings-section__title">{t("settings.accessibility")}</h2>
          <ul className="settings-section__list">
            <li>
              <ToggleRow label={t("settings.largeText")} checked={largeText} onChange={handleLargeText} />
            </li>
            <li>
              <ToggleRow label={t("settings.highContrast")} checked={highContrast} onChange={handleHighContrast} />
            </li>
          </ul>
        </motion.section>

        <motion.section className="settings-section" variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}>
          <h2 className="settings-section__title">{t("settings.notificationsTitle")}</h2>
          <ul className="settings-section__list">
            <li>
              <ToggleRow label={t("settings.notifications")} checked={notifications} onChange={handleNotifications} />
            </li>
          </ul>
        </motion.section>
      </motion.div>
      {saving && <p className="settings__saving">{t("settings.saving")}</p>}
    </motion.div>
  );
}
