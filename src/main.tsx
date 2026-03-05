  import { createRoot } from "react-dom/client";
  import App from "./App.tsx";
import { AuthProvider } from "./contexts/AuthContext.tsx";
  import { LanguageProvider } from "./contexts/LanguageContext.tsx";
  import "./index.css";
import React from "react";
  import dropsyncrLogo from "./assets/dropsyncr-logo.png";

  const faviconLink = document.querySelector<HTMLLinkElement>('link[rel="icon"]') || document.createElement('link');
  faviconLink.rel = 'icon';
  faviconLink.type = 'image/png';
  faviconLink.href = dropsyncrLogo;
  if (!faviconLink.parentNode) {
    document.head.appendChild(faviconLink);
  }

createRoot(document.getElementById("root")!).render(
    <LanguageProvider>
      <AuthProvider children={undefined}>
        <App />
      </AuthProvider>
    </LanguageProvider>
);
  