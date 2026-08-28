import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import Admin from "./admin.tsx";

// Simple pathname-based routing — no router dependency. The student app
// lives at the site root (/NEXUS/ once deployed under the GitHub Pages
// base path, or / in local dev); the admin/mentor prototype lives at
// /NEXUS/admin (or /admin in local dev, where there's no base prefix).
function isAdminPath(pathname: string): boolean {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  return normalized === "/NEXUS/admin" || normalized === "/admin";
}

const RootComponent = isAdminPath(window.location.pathname) ? Admin : App;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RootComponent />
  </StrictMode>,
);
