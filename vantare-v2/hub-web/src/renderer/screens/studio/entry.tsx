import { SectionChrome, SectionPanel } from "../../app/SectionChrome";
import { useUi } from "../../app/UiState";
import { studioText as t } from "../../i18n/studio";
import { Gallery } from "../../ui/studio/Gallery";
import { StudioRail } from "../../ui/studio/Rail";
import { StudioProvider } from "./state";
import "../../ui/studio/studio.css";
export default function StudioEntry() {
  const navigate = useUi((state) => state.navigate);
  return (
    <StudioProvider>
      <SectionChrome
        title={t.title}
        rail={<StudioRail onPlans={() => navigate("settings")} />}
      />
      <SectionPanel activeTab="studio">
        <Gallery />
      </SectionPanel>
    </StudioProvider>
  );
}
