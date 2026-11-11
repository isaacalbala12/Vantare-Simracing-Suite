import { useState } from "react";
import type { AccessView } from "../../../contract/generated/contract";
import { testingText as text } from "./es";

export type TestingTab = "summary" | "questionnaires" | "reports" | "community";
export function testingTabs(access: AccessView) {
  const verified = access.verified && !access.blocked;
  return [
    {
      id: "summary",
      etiqueta: text.summary,
      visible: verified && access.tester,
    },
    {
      id: "questionnaires",
      etiqueta: text.questionnaires,
      visible: verified && access.tester,
    },
    { id: "reports", etiqueta: text.title, visible: verified },
    {
      id: "community",
      etiqueta: text.community,
      visible: verified && access.tester,
    },
  ] as const;
}
export function useTestingTabs(access: AccessView) {
  const tabs = testingTabs(access);
  const [selected, setSelected] = useState<TestingTab>();
  const preferred = selected ?? (access.tester ? "summary" : "reports");
  const active = tabs.some((tab) => tab.id === preferred && tab.visible)
    ? preferred
    : "reports";
  function change(id: string) {
    const tab = tabs.find((tab) => tab.id === id && tab.visible);
    if (tab) setSelected(tab.id);
  }
  return { tabs, active, change };
}
