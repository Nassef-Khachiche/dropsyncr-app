  import { createRoot } from "react-dom/client";
  import App from "./App.tsx";
import { AuthProvider } from "./contexts/AuthContext.tsx";
  import { LanguageProvider } from "./contexts/LanguageContext.tsx";
  import "./index.css";
import React from "react";

createRoot(document.getElementById("root")!).render(
    <LanguageProvider>
      <AuthProvider children={undefined}>
        <App />
      </AuthProvider>
    </LanguageProvider>
);
  