import { SectionChrome, SectionPanel } from "../../app/SectionChrome";
import { launcherText as text } from "../../i18n/launcher";
import { Applications } from "./Applications";
import { ProfileEditorProvider, useProfileEditorState } from "./editor-state";
import { Launcher } from "./Launcher";
import { LauncherRail } from "./LauncherRail";
import { ResidentInbox, useResident } from "./resident";
export default function LauncherEntry() {
  return (
    <ProfileEditorProvider>
      <LauncherContent />
    </ProfileEditorProvider>
  );
}
function LauncherContent() {
  const editor = useProfileEditorState();
  const resident = useResident();
  const activeTab = editor.value ? "profile" : editor.tab;
  return (
    <>
      <SectionChrome
        title={text.title}
        tabs={[
          { id: "profiles", etiqueta: text.profilesTab, visible: true },
          { id: "applications", etiqueta: text.applications, visible: true },
          {
            id: "profile",
            etiqueta: text.profileTab,
            visible: editor.value !== null,
          },
        ]}
        activeTab={activeTab}
        onTabChange={(id) => {
          if (id === "profiles" || id === "applications") editor.navigate(id);
        }}
        rail={<LauncherRail residentStatus={resident} />}
      />
      <SectionPanel activeTab={activeTab}>
        {editor.tab === "applications" && !editor.value ? (
          <Applications />
        ) : (
          <Launcher />
        )}
      </SectionPanel>
      <ResidentInbox view={resident} />
    </>
  );
}
