import { useEffect } from "react";
import { useUi } from "../app/UiState";
export default function AnalysisNavigate() {
  const navigate = useUi((s) => s.navigate);
  useEffect(() => navigate("analysis"), [navigate]);
  return null;
}
