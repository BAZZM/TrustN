import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import axios from "axios";
import { useApp } from "../context/AppContext";
import { useTranslations } from "../i18n";
import "./Login.css";

const STEP_PHONE = "phone";
const STEP_OTP = "otp";
const STEP_REGISTER = "register";

/** Pull user-visible string from express.json body or a raw string/parse edge case. */
function getApiErrorMessage(data) {
  if (data == null) return null;
  if (typeof data === "string") {
    const t = data.trim();
    if (t.startsWith("{") || t.startsWith("[")) {
      try {
        return getApiErrorMessage(JSON.parse(t));
      } catch {
        return null;
      }
    }
    return null;
  }
  if (Array.isArray(data) && data.length > 0 && typeof data[0] === "string" && data[0]) {
    return data[0];
  }
  if (typeof data === "object" && !Array.isArray(data)) {
    if (typeof data.error === "string" && data.error) return data.error;
    if (typeof data.message === "string" && data.message) return data.message;
    for (const key of ["error", "message", "detail", "description", "err"]) {
      const v = data[key];
      if (typeof v === "string" && v.length > 0) return v;
    }
  }
  return null;
}

export default function Login() {
  const { setUser, theme, locale, baseURL } = useApp();
  const t = useTranslations(locale);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [registerData, setRegisterData] = useState({ name: "", job_role: "", industry: "", experience: "" });
  const [step, setStep] = useState(STEP_PHONE);
  const [pendingPhone, setPendingPhone] = useState(null);
  const [requireOtp, setRequireOtp] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    axios.get(baseURL + "/api/auth/otp-required").then((r) => {
      setRequireOtp(r.data.require_phone_verification === true);
    }).catch(() => setRequireOtp(false));
  }, [baseURL]);

  const cfg = theme && theme.config ? theme.config : {};
  const gradient = cfg.loginGradient || "linear-gradient(145deg, #1a1d23 0%, #252a33 50%, #1e2128 100%)";

  function handlePhoneSubmit(e) {
    e.preventDefault();
    setError(null);
    if (!phone.trim()) return;
    setLoading(true);
    axios
      .post(baseURL + "/api/auth/identify", { phone: phone.trim() })
      .then((res) => {
        if (res.data.pending && requireOtp) {
          setPendingPhone(res.data.phone);
          setStep(STEP_OTP);
          setCode("");
        } else if (res.data.user && res.data.token) {
          setUser(res.data.user, res.data.token);
        }
      })
      .catch((err) => {
        if (err.response?.status === 404) {
          setStep(STEP_REGISTER);
          setPendingPhone(phone.trim());
          setRegisterData((prev) => ({ ...prev, name: "" }));
          return;
        }
        if (!err.response) {
          setError(t("login.errorNetwork"));
          return;
        }
        const status = err.response.status;
        if (status >= 502 && status <= 504) {
          setError(t("login.errorNetwork"));
          return;
        }
        const data = err.response.data;
        const isNodeDev = process.env.NODE_ENV !== "production";
        const fromBody = getApiErrorMessage(data);
        if (fromBody) {
          setError(fromBody);
          return;
        }
        if (typeof err.response.data === "string") {
          const raw = err.response.data;
          if (/proxy|ECONNREFUSED|getaddrinfo|ENOTFOUND|connect\s/i.test(raw)) {
            setError(t("login.errorNetwork"));
            return;
          }
          setError(t("login.errorUnexpectedResponse"));
          return;
        }
        if (isNodeDev) {
          setError(
            `${t("login.errorServer")} (HTTP ${status}${data == null ? ", empty body" : ""} — see API terminal, DATABASE_URL, and migrations).`
          );
        } else {
          setError(t("login.errorServer"));
        }
      })
      .finally(() => setLoading(false));
  }

  function handleOtpSubmit(e) {
    e.preventDefault();
    setError(null);
    if (!code.trim() || !pendingPhone) return;
    setLoading(true);
    axios
      .post(baseURL + "/api/auth/verify", { phone: pendingPhone, code: code.trim() })
      .then((res) => {
        if (res.data.user && res.data.token) {
          setUser(res.data.user, res.data.token);
        }
      })
      .catch((err) => {
        setError(err.response?.data?.error || "Invalid or expired code");
      })
      .finally(() => setLoading(false));
  }

  function handleRegisterSubmit(e) {
    e.preventDefault();
    setError(null);
    if (!pendingPhone) return;
    setLoading(true);
    axios
      .post(baseURL + "/api/auth/register", {
        phone: pendingPhone,
        name: registerData.name || "New User",
        job_role: registerData.job_role || "",
        industry: registerData.industry || "",
        experience: registerData.experience || "",
      })
      .then((res) => {
        if (res.data.user && res.data.token) {
          setUser(res.data.user, res.data.token);
        }
      })
      .catch((err) => {
        setError(err.response?.data?.error || "Registration failed");
      })
      .finally(() => setLoading(false));
  }

  function goBack() {
    setStep(STEP_PHONE);
    setPendingPhone(null);
    setCode("");
    setError(null);
  }

  return (
    <motion.div
      className="login"
      style={{ background: gradient }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      <div className="login__brush" aria-hidden="true" />
      <motion.div
        className="login__card"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.4 }}
      >
        <h1 className="login__title">{t("login.title")}</h1>
        <p className="login__subtitle">{t("login.subtitle")}</p>

        <AnimatePresence mode="wait">
          {step === STEP_PHONE && (
            <motion.form
              key="phone"
              onSubmit={handlePhoneSubmit}
              className="login__form"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <input
                type="tel"
                id="login-phone"
                name="phone"
                className="login__input"
                placeholder={t("login.phonePlaceholder")}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                autoComplete="tel"
                disabled={loading}
                aria-label={t("login.phonePlaceholder")}
              />
              {error && <p className="login__error">{error}</p>}
              <motion.button
                type="submit"
                className="login__btn"
                disabled={loading}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                {loading ? "..." : t("login.continue")}
              </motion.button>
              <p className="login__hint">
                Don&apos;t have an account? Enter your phone to register.
              </p>
            </motion.form>
          )}

          {step === STEP_OTP && (
            <motion.form
              key="otp"
              onSubmit={handleOtpSubmit}
              className="login__form"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <p className="login__otp-hint">Code sent to {pendingPhone}</p>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                id="login-code"
                name="code"
                className="login__input login__input--code"
                placeholder="Enter 6-digit code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                disabled={loading}
                aria-label="Verification code"
              />
              {error && <p className="login__error">{error}</p>}
              <motion.button
                type="submit"
                className="login__btn"
                disabled={loading || code.length < 6}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                {loading ? "..." : "Verify"}
              </motion.button>
              <button type="button" className="login__back" onClick={goBack}>
                Use different number
              </button>
            </motion.form>
          )}

          {step === STEP_REGISTER && (
            <motion.form
              key="register"
              onSubmit={handleRegisterSubmit}
              className="login__form login__form--register"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <p className="login__register-hint">Register with {pendingPhone}</p>
              <input
                type="text"
                id="register-name"
                name="name"
                className="login__input"
                placeholder="Your name"
                value={registerData.name}
                onChange={(e) => setRegisterData((p) => ({ ...p, name: e.target.value }))}
                disabled={loading}
              />
              <input
                type="text"
                id="register-job"
                name="job_role"
                className="login__input"
                placeholder="Job role (optional)"
                value={registerData.job_role}
                onChange={(e) => setRegisterData((p) => ({ ...p, job_role: e.target.value }))}
                disabled={loading}
              />
              <input
                type="text"
                id="register-industry"
                name="industry"
                className="login__input"
                placeholder="Industry (optional)"
                value={registerData.industry}
                onChange={(e) => setRegisterData((p) => ({ ...p, industry: e.target.value }))}
                disabled={loading}
              />
              <textarea
                id="register-experience"
                name="experience"
                className="login__input login__input--textarea"
                placeholder="Experience (optional)"
                rows={2}
                value={registerData.experience}
                onChange={(e) => setRegisterData((p) => ({ ...p, experience: e.target.value }))}
                disabled={loading}
              />
              {error && <p className="login__error">{error}</p>}
              <motion.button
                type="submit"
                className="login__btn"
                disabled={loading}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                {loading ? "..." : "Create account"}
              </motion.button>
              <button type="button" className="login__back" onClick={goBack}>
                Use different number
              </button>
            </motion.form>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
