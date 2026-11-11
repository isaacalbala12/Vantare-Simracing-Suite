import { SectionChrome, SectionPanel } from "../../app/SectionChrome";
import { useUi } from "../../app/UiState";
import { studioText as t } from "../../i18n/studio";
import { Gallery } from "../../ui/studio/Gallery";
import { StudioRail } from "../../ui/studio/Rail";
import { StudioProvider } from "./state";
import "../../ui/studio/studio.css";
export default function StudioEntry() {
  const navigate = useUi((state) => state.navigate);
  const railCollapsed = useUi((state) => state.railCollapsed);
  return (
    <StudioProvider>
      <SectionChrome
        title={t.title}
        rail={
          railCollapsed ? null : (
            <StudioRail onPlans={() => navigate("account")} />
          )
        }
      />
      <SectionPanel activeTab="studio">
        <Gallery />
      </SectionPanel>
    </StudioProvider>
  );
}
