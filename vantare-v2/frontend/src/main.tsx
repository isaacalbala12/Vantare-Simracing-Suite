import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { CompositeApp } from "./overlay/CompositeApp";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <CompositeApp />
  </StrictMode>,
);
