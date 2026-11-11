import { RailBlock } from "../../ui/Frame";
import { shortcutsText } from "./shortcuts.es";
export function ShortcutsRail() {
  return (
    <>
      {shortcutsText.blocks.map(([title, help]) => (
        <RailBlock key={title} title={title} icon="v-keys">
          <p>{help}</p>
        </RailBlock>
      ))}
    </>
  );
}
