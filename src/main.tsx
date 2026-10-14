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
import { SavedPage } from "./pages/SavedPage";
import { PlanPage } from "./pages/PlanPage";
import { TripPage } from "./pages/TripPage";
import { TripsPage } from "./pages/TripsPage";
import { BookPage } from "./pages/BookPage";
import { ExplorePage } from "./pages/ExplorePage";
import { SharedPage } from "./pages/SharedPage";
import { ReelViewerPage } from "./pages/ReelViewerPage";
import { MePage } from "./pages/MePage";
import { PrivacyPage } from "./pages/PrivacyPage";
import { WelcomePage } from "./pages/WelcomePage";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <div className="app">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/share" element={<SharePage />} />
          <Route path="/welcome" element={<WelcomePage />} />
          <Route path="/me" element={<MePage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/check/:id" element={<CheckPage />} />
          <Route path="/check/:id/place" element={<PlacePage />} />
          <Route path="/check/:id/where" element={<WherePage />} />
          <Route path="/explore" element={<ExplorePage />} />
          <Route path="/explore/reel/:id" element={<ReelViewerPage />} />
          <Route path="/s/:token" element={<SharedPage />} />
          <Route path="/saved" element={<SavedPage />} />
          <Route path="/plan" element={<PlanPage />} />
          <Route path="/trips" element={<TripsPage />} />
          <Route path="/trips/:id" element={<TripPage />} />
          <Route path="/trips/:id/book" element={<BookPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </div>
    </BrowserRouter>
  </StrictMode>,
);
