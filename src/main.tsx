import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router";
import "./styles.css";
import { HomePage } from "./pages/HomePage";
import { CheckPage } from "./pages/CheckPage";
import { PlacePage } from "./pages/PlacePage";
import { WherePage } from "./pages/WherePage";
import { SharePage } from "./pages/SharePage";
import { NotFoundPage } from "./pages/NotFoundPage";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <div className="app">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/share" element={<SharePage />} />
          <Route path="/check/:id" element={<CheckPage />} />
          <Route path="/check/:id/place" element={<PlacePage />} />
          <Route path="/check/:id/where" element={<WherePage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </div>
    </BrowserRouter>
  </StrictMode>,
);
