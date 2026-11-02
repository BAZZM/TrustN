import React from "react";
import { BrowserRouter, Routes, Route, useLocation, Navigate } from "react-router-dom";
import { AnimatePresence, MotionConfig } from "framer-motion";
import { useApp } from "./context/AppContext";
import usePreferenceAttributes from "./hooks/usePreferenceAttributes";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Connections from "./pages/Connections";
import Contacts from "./pages/Contacts";
import Activity from "./pages/Activity";
import Settings from "./pages/Settings";
import Admin from "./pages/Admin";
import "./App.css";

function AnimatedRoutes() {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/connections" element={<Connections />} />
        <Route path="/contacts" element={<Contacts />} />
        <Route path="/activity" element={<Activity />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AnimatePresence>
  );
}

function App() {
  const { user } = useApp();
  usePreferenceAttributes(user);
  // "user": framer-motion drops transform/layout animations when the OS asks for reduced motion
  return (
    <MotionConfig reducedMotion="user">
      {!user ? (
        <Login />
      ) : (
        <BrowserRouter>
          <Layout>
            <AnimatedRoutes />
          </Layout>
        </BrowserRouter>
      )}
    </MotionConfig>
  );
}

export default App;
