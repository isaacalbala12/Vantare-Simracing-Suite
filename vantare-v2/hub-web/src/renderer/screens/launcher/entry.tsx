import { SectionChrome, SectionPanel } from "../../app/SectionChrome";
import { launcherText as text } from "../../i18n/launcher";
import { ProfileEditorProvider, useProfileEditorState } from "./editor-state";
import { Launcher } from "./Launcher";
import { LauncherRail } from "./LauncherRail";
export default function LauncherEntry() {
  return (
    <ProfileEditorProvider>
      <LauncherContent />
    </ProfileEditorProvider>
  );
}
function LauncherContent() {
  const editor = useProfileEditorState();
  const activeTab = editor.value ? "profile" : "profiles";
  return (
    <>
      <SectionChrome
        title={text.title}
        tabs={[
          { id: "profiles", etiqueta: text.profilesTab, visible: true },
          { id: "applications", etiqueta: text.applications, visible: false },
          {
            id: "profile",
            etiqueta: text.profileTab,
            visible: editor.value !== null,
          },
        ]}
        activeTab={activeTab}
        onTabChange={(id) => {
          if (id === "profiles" && !editor.value?.pending) editor.close();
        }}
        rail={<LauncherRail />}
      />
      <SectionPanel activeTab={activeTab}>
        <Launcher />
      </SectionPanel>
    </>
  );
}
