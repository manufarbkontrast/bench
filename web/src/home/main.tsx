import { createRoot } from "react-dom/client";
import App from "./App";
import ErrorBoundary from "../shared/ErrorBoundary";
import { initTheme } from "../shared/theme";
import "./styles.css";

initTheme();

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary active="home">
    <App />
  </ErrorBoundary>,
);
