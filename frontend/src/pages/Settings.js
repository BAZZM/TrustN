import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import axios from "axios";
import { useApp } from "../context/AppContext";
import { useTranslations } from "../i18n";
import "./Settings.css";

export default function Settings() {
  const { user, setUser, token, theme, setTheme, locale, setLocale, themesList, baseURL } = useApp();
  const t = useTranslations(user && user.locale ? user.locale : "en");
  const [largeText, setLargeText] = useState(false);
  const [highContrast, setHighContrast] = useState(false);
  const [notifications, setNotifications] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState({ name: "", job_role: "", industry: "", experience: "" });
  const [profileSaving, setProfileSaving] = useState(false);

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

  function updatePref(key, value) {
    if (!user || !user.id) return;
    setSaving(true);
    const payload = { [key]: value };
    axios.patch(baseURL + "/api/profile", payload).then(function(r) {
      setUser({ ...user, ...r.data }, token);
      setSaving(false);
    }).catch(function() { setSaving(false); });
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
    setProfileSaving(true);
    axios.patch(baseURL + "/api/profile", profile)
      .then(function(r) {
        setUser({ ...user, ...r.data }, token);
      })
      .catch(function() {})
      .finally(function() { setProfileSaving(false); });
  }

  return (
    <motion.div className="page settings" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
      <motion.header className="settings__header" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
        <h1 className="settings__title">{t("settings.title")}</h1>
        <p className="settings__subtitle">{t("settings.profile")}</p>
      </motion.header>

      <motion.div className="settings__sections" initial="hidden" animate="show" variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: 0.08 } } }}>
        <motion.section className="settings-section" variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}>
          <h2 className="settings-section__title">Profile</h2>
          <form onSubmit={handleProfileSave} className="settings-profile-form">
            <div className="settings-profile-form__row">
              <label htmlFor="profile-name" className="settings-profile-form__label">Name</label>
              <input
                id="profile-name"
                type="text"
                className="settings-profile-form__input"
                value={profile.name}
                onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))}
                placeholder="Your name"
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
                    {theme && theme.id === th.id ? <span className="settings-row__check">✓</span> : <span className="settings-row__arrow">→</span>}
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
          <h2 className="settings-section__title">Accessibility</h2>
          <ul className="settings-section__list">
            <li>
              <div className="settings-row settings-row--toggle">
                <span>{t("settings.largeText")}</span>
                <button type="button" className={"toggle " + (largeText ? "toggle--on" : "")} onClick={function() { handleLargeText(!largeText); }} aria-pressed={largeText} />
              </div>
            </li>
            <li>
              <div className="settings-row settings-row--toggle">
                <span>{t("settings.highContrast")}</span>
                <button type="button" className={"toggle " + (highContrast ? "toggle--on" : "")} onClick={function() { handleHighContrast(!highContrast); }} aria-pressed={highContrast} />
              </div>
            </li>
          </ul>
        </motion.section>

        <motion.section className="settings-section" variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}>
          <h2 className="settings-section__title">Notifications</h2>
          <ul className="settings-section__list">
            <li>
              <div className="settings-row settings-row--toggle">
                <span>{t("settings.notifications")}</span>
                <button type="button" className={"toggle " + (notifications ? "toggle--on" : "")} onClick={function() { handleNotifications(!notifications); }} aria-pressed={notifications} />
              </div>
            </li>
          </ul>
        </motion.section>
      </motion.div>
      {saving && <p className="settings__saving">Saving…</p>}
    </motion.div>
  );
}
