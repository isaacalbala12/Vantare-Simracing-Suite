import { SectionChrome, SectionPanel } from "../../app/SectionChrome";
import { launcherText as text } from "../../i18n/launcher";
import { Launcher } from "./Launcher";
import { LauncherRail } from "./LauncherRail";
export default function LauncherEntry() {
  return (
    <>
      <SectionChrome
        title={text.title}
        tabs={[{ id: "profiles", etiqueta: text.profilesTab, visible: true }]}
        activeTab="profiles"
        rail={<LauncherRail />}
      />
      <SectionPanel activeTab="profiles">
        <Launcher />
      </SectionPanel>
    </>
  );
}
