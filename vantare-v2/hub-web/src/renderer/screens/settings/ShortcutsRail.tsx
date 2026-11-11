import { RailBlock } from "../../ui/Frame";
import { ShortcutRail } from "../../ui/SettingActions";
import { shortcutsText } from "./shortcuts.es";
export function ShortcutsRail() {
  return (
    <ShortcutRail>
      {shortcutsText.blocks.map(([title, help]) => (
        <RailBlock key={title} title={title} icon="v-keys">
          <p>{help}</p>
        </RailBlock>
      ))}
    </ShortcutRail>
  );
}
