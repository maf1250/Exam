import React, { useEffect } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import AdminPage from "./admin/AdminPage";
import TraineePortalPage from "./trainee/TraineePortalPage";

function HashRedirect() {
  useEffect(() => {
    if (window.location.hash.startsWith("#/")) {
      const path = window.location.hash.replace("#", "");
      window.history.replaceState(null, "", path);
    }
  }, []);

  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <HashRedirect />

      <Routes>
        <Route path="/" element={<TraineePortalPage />} />
        <Route path="/sportal" element={<AdminPage />} />
        <Route path="/trainee/:slug" element={<TraineePortalPage />} />
        <Route path="/:slug" element={<TraineePortalPage />} />
        <Route path="*" element={<TraineePortalPage />} />
      </Routes>
    </BrowserRouter>
  );
}
