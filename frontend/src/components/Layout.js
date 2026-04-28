import React from "react";
import { Link, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { useApp } from "../context/AppContext";
import "./Layout.css";

const navItems = [
  { path: "/", label: "Home", icon: "◆" },
  { path: "/contacts", label: "Contacts", icon: "◎" },
  { path: "/connections", label: "Connections", icon: "◇" },
  { path: "/activity", label: "Activity", icon: "○" },
  { path: "/settings", label: "Settings", icon: "▷" },
  { path: "/admin", label: "Admin", icon: "⚙" },
];

export default function Layout({ children }) {
  const location = useLocation();
  const { setUser } = useApp();

  return (
    <div className="app">
      <header className="layout-header">
        <motion.div
          className="layout-header__inner"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        >
          <Link to="/" className="layout-header__logo">
            Trust Network
          </Link>
          <button type="button" className="layout-header__logout" onClick={() => setUser(null)} aria-label="Sign out">
            Sign out
          </button>
        </motion.div>
      </header>

      <main className={"app__main " + (location.pathname === "/" ? "app__main--black" : "")}>{children}</main>

      <nav className="layout-nav" aria-label="Main navigation">
        <motion.ul
          className="layout-nav__list"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.3 }}
        >
          {navItems.map(({ path, label, icon }, i) => {
            const isActive = location.pathname === path;
            return (
              <li key={path} className="layout-nav__item">
                <Link
                  to={path}
                  className="layout-nav__link"
                  aria-current={isActive ? "page" : undefined}
                >
                  <motion.span
                    className="layout-nav__icon"
                    animate={isActive ? { scale: 1.1 } : { scale: 1 }}
                    transition={{ type: "spring", stiffness: 400, damping: 25 }}
                  >
                    {icon}
                  </motion.span>
                  <span className="layout-nav__label">{label}</span>
                  {isActive && (
                    <motion.span
                      className="layout-nav__indicator"
                      layoutId="nav-indicator"
                      transition={{ type: "spring", stiffness: 350, damping: 30 }}
                    />
                  )}
                </Link>
              </li>
            );
          })}
        </motion.ul>
      </nav>
    </div>
  );
}
