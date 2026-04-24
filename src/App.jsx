import React from "react";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import AdminPage from "./admin/AdminPage";
import TraineePortalPage from "./trainee/TraineePortalPage";

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<TraineePortalPage />} /> {/* <Navigate to="/admin" replace /> */}
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/trainee/:slug" element={<TraineePortalPage />} />
        <Route path="/:slug" element={<TraineePortalPage />} />
        <Route path="*" element={<TraineePortalPage />} /> {/* <Navigate to="/admin" replace /> */}
      </Routes>
    </HashRouter>
  );
}
