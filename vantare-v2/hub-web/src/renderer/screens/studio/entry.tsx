import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { AccessView } from "../../../contract/generated/contract";
import { coreKey, offline } from "../../app/Host";
import { SectionChrome, SectionPanel } from "../../app/SectionChrome";
import { studioText as t } from "../../i18n/studio";
import { workshopText } from "../../i18n/workshop";
import { StudioFocus } from "../../ui/studio/StudioFocus";
import { Workshop } from "../../ui/studio/Workshop";
import { StudioProvider } from "./state";
import "../../ui/studio/studio.css";
import "../../ui/studio/workshop.css";

export function canViewWorkshop(access: AccessView) {
  return access.verified && !access.blocked && access.tester;
}

export default function StudioEntry() {
  const { data: core = offline } = useQuery({
    queryKey: coreKey,
    queryFn: async () => offline,
    enabled: false,
  });
  const visible = canViewWorkshop(core.access);
  const [tab, setTab] = useState("studio");
  const activeTab = visible ? tab : "studio";
  const tabs = visible
    ? [
        { id: "studio", etiqueta: "Studio", visible: true },
        { id: "workshop", etiqueta: workshopText.title, visible: true },
      ]
    : undefined;
  const chrome = { title: t.title, tabs, activeTab, onTabChange: setTab };
  if (activeTab === "workshop") return <Workshop core={core} chrome={chrome} />;
  return (
    <StudioProvider>
      <SectionChrome {...chrome} rail={false} />
      <SectionPanel activeTab="studio">
        <StudioFocus />
      </SectionPanel>
    </StudioProvider>
  );
}
