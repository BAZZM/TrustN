import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import axios from "axios";
import { isSessionExpiredError } from "./sessionExpiry";

const baseURL = process.env.REACT_APP_API_URL || "";

const defaultTheme = {
  slug: "default",
  config: {
    loginGradient: "linear-gradient(145deg, #1a1d23 0%, #252a33 50%, #1e2128 100%)",
    appBackground: "#000000",
    fontFamily: '"Share Tech Mono", monospace',
    accent: "#4a5568",
  },
};

// Registered at module load, not in an effect: child effects run before AppProvider's, so an
// effect-based interceptor misses the first requests on a cold load and they 401.
axios.interceptors.request.use(
  (config) => {
    // Always read localStorage so a freshly stored token is picked up
    try {
      const currentToken = localStorage.getItem("intro_token");
      if (currentToken) {
        config.headers = config.headers || {};
        config.headers.Authorization = `Bearer ${currentToken}`;
      }
    } catch (_) {
      /* storage unavailable: send the request unauthenticated */
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// A 401 on a data route means the stored token expired: AppProvider registers a handler that signs
// out and shows a notice on the login screen, instead of every page showing a raw error.
let handleSessionExpired = null;
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (handleSessionExpired && isSessionExpiredError(error)) handleSessionExpired();
    return Promise.reject(error);
  }
);

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [user, setUserState] = useState(() => {
    try {
      const s = localStorage.getItem("intro_user");
      return s ? JSON.parse(s) : null;
    } catch {
      return null;
    }
  });
  const [token, setTokenState] = useState(() => localStorage.getItem("intro_token") || null);
  const [theme, setThemeState] = useState(() => {
    try {
      const t = localStorage.getItem("intro_theme");
      return t ? JSON.parse(t) : defaultTheme;
    } catch {
      return defaultTheme;
    }
  });
  const [locale, setLocaleState] = useState(() => localStorage.getItem("intro_locale") || "en");
  const [themesList, setThemesList] = useState([]);
  const [sessionExpired, setSessionExpired] = useState(false);

  const setUser = useCallback((u, authToken) => {
    setUserState(u);
    if (u) {
      setSessionExpired(false);
      localStorage.setItem("intro_user", JSON.stringify(u));
      if (authToken) {
        setTokenState(authToken);
        localStorage.setItem("intro_token", authToken);
      }
    } else {
      localStorage.removeItem("intro_user");
      localStorage.removeItem("intro_token");
      setTokenState(null);
    }
  }, []);

  useEffect(() => {
    const t = localStorage.getItem("intro_token");
    if (t) setTokenState(t);
  }, []);

  useEffect(() => {
    handleSessionExpired = () => {
      setUser(null);
      setSessionExpired(true);
    };
    return () => {
      handleSessionExpired = null;
    };
  }, [setUser]);

  const setTheme = useCallback((t) => {
    setThemeState(t || defaultTheme);
    localStorage.setItem("intro_theme", JSON.stringify(t || defaultTheme));
  }, []);

  const setLocale = useCallback((l) => {
    setLocaleState(l);
    localStorage.setItem("intro_locale", l);
  }, []);

  useEffect(() => {
    axios.get(baseURL + "/api/themes").then((r) => setThemesList(r.data.themes || [])).catch(() => {});
  }, []);

  const value = {
    user,
    setUser,
    token,
    theme,
    setTheme,
    locale,
    setLocale,
    themesList,
    baseURL,
    sessionExpired,
  };
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
