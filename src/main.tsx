import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { validateEnv } from "./lib/env";
import { EnvErrorScreen } from "./components/EnvErrorScreen";

// Register the service worker for Web Push + PWA support.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* push will simply be unavailable */
    });
  });
}

const root = createRoot(document.getElementById("root")!);
const result = validateEnv();

if (!result.ok) {
  // Surface a clear UI error instead of failing silently inside React Query / Supabase.
  // eslint-disable-next-line no-console
  console.error("[env] Missing required vars:", result.missing);
  root.render(<EnvErrorScreen missing={result.missing} />);
} else {
  root.render(<App />);
}
