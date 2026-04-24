import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Register the service worker for Web Push + PWA support.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* push will simply be unavailable */
    });
  });
}

createRoot(document.getElementById("root")!).render(<App />);
