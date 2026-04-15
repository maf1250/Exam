import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import AdminPage from "./admin/AdminPage";
import TraineePortalPage from "./trainee/TraineePortalPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/trainee/:slug" element={<TraineePortalPage />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
