  import { createRoot } from "react-dom/client";
  import App from "./App.tsx";
import { AuthProvider } from "./contexts/AuthContext.tsx";
  import "./index.css";
import React from "react";

createRoot(document.getElementById("root")!).render(
  <AuthProvider children={undefined}>
    <App />
  </AuthProvider>
);
  