import { Combobox } from "@base-ui/react/combobox";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "../assets/icons/Icon";
import { commandsText as text } from "../i18n/commands.es";
import { Keycap } from "./Data";
import { WindowDialog as Dialog } from "./WindowDialog";
import "./command-palette.css";

export type PaletteCommand = {
  id: string;
  label: string;
  group?: "navigation" | "actions";
  icon?: IconName;
  meta?: string;
  trail?: string;
  locked?: boolean;
  shortcut?: string;
  disabled?: boolean;
  run: () => void;
};
// Base UI 1.9 implements "always" in AriaCombobox and passes it through Root,
// but Root's public declaration still narrows this property to boolean. Keep
// the compatibility cast here; Chromium checks initial highlight and Enter.
const highlightOnOpen = { autoHighlight: "always" } as unknown as Pick<
  Combobox.Root.Props<PaletteCommand>,
  "autoHighlight"
>;
export function CommandPalette({
  title,
  description,
  trigger,
  empty,
  commands,
  open,
  onOpenChange,
  notice,
}: {
  title: string;
  description: string;
  trigger: ReactNode;
  closeLabel: string;
  empty: string;
  commands: PaletteCommand[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  notice?: string;
}) {
  const [query, setQuery] = useState("");
  const committed = useRef(false);
  useEffect(() => {
    if (!open) {
      setQuery("");
      // The screen was inert while the dialog was open. Its layout cleanup
      // must finish before focusing the destination after a command.
      if (committed.current)
        document.querySelector<HTMLElement>(".v-shell-main")?.focus();
    } else committed.current = false;
  }, [open]);
  const filtered = commands.filter((item) =>
    `${item.label} ${item.meta ?? ""} ${item.trail ?? ""}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  return (
    <Dialog.Root
      open={open}
      onOpenChangeComplete={(value) => {
        if (!value && committed.current)
          document.querySelector<HTMLElement>(".v-shell-main")?.focus();
      }}
      onOpenChange={(value) => {
        if (!value) setQuery("");
        onOpenChange(value);
      }}
    >
      {trigger !== null && (
        <Dialog.Trigger className="v-button">{trigger}</Dialog.Trigger>
      )}
      <Dialog.Portal>
        <Dialog.Backdrop className="v-command-backdrop" />
        <Dialog.Popup
          className="v-command-palette"
          finalFocus={() =>
            // Base UI resolves an element to its first tabbable child. A
            // destination's loading screen may replace that child; focus the
            // stable main explicitly after close instead.
            !committed.current
          }
          initialFocus={(event) => {
            if (event !== "touch")
              return document.querySelector<HTMLInputElement>(
                "[data-command-palette]",
              );
            return false;
          }}
        >
          <Dialog.Title className="v-sr-only">{title}</Dialog.Title>
          <Dialog.Description className="v-sr-only">
            {description}
          </Dialog.Description>
          <Combobox.Root<PaletteCommand>
            items={filtered}
            filter={null}
            inputValue={query}
            onInputValueChange={setQuery}
            {...highlightOnOpen}
            defaultOpen
            itemToStringLabel={(item) => item.label}
            itemToStringValue={(item) => item.id}
            isItemEqualToValue={(a, b) => a.id === b.id}
            inline
            onValueChange={(item, event) => {
              if (!item) return;
              if (
                item.disabled ||
                committed.current ||
                (event.event instanceof MouseEvent && event.event.detail > 1)
              ) {
                event.cancel();
                return;
              }
              if (item) {
                committed.current = true;
                onOpenChange(false);
                setQuery("");
                item.run();
              }
            }}
          >
            <div className="v-command-search">
              <Icon name="i-comando" />
              <Combobox.Input
                data-command-palette=""
                aria-label={title}
                placeholder={text.placeholder}
              />
            </div>
            {notice && (
              <p className="v-command-notice" role="status">
                {notice}
              </p>
            )}
            <Combobox.List className="v-command-results">
              {(["navigation", "actions"] as const).map((group) => {
                const items = filtered.filter(
                  (item) => (item.group ?? "actions") === group,
                );
                if (!items.length) return null;
                return (
                  <Combobox.Group key={group} items={items}>
                    <Combobox.GroupLabel className="v-command-group">
                      {group === "navigation"
                        ? text.destinations
                        : text.actions}
                    </Combobox.GroupLabel>
                    <Combobox.Collection>
                      {(item: PaletteCommand) => (
                        <Combobox.Item
                          className="v-command-row"
                          key={item.id}
                          value={item}
                          aria-disabled={item.disabled || undefined}
                          aria-label={
                            item.meta
                              ? `${item.label} · ${item.meta}`
                              : item.label
                          }
                        >
                          <span className="v-command-icon">
                            <Icon name={item.icon ?? "i-comando"} />
                          </span>
                          <span className="v-command-label">{item.label}</span>
                          <span className="v-command-meta">{item.meta}</span>
                          {item.shortcut && <Keycap>{item.shortcut}</Keycap>}
                          {(item.disabled || item.locked) && (
                            <Icon name="v-lock" />
                          )}
                        </Combobox.Item>
                      )}
                    </Combobox.Collection>
                  </Combobox.Group>
                );
              })}
            </Combobox.List>
            <Combobox.Empty className="v-sr-only">{empty}</Combobox.Empty>
          </Combobox.Root>
          <footer className="v-command-footer">
            <span>{text.navigate}</span>
            <span>{text.execute}</span>
            <span>{text.lockedHelp}</span>
          </footer>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
