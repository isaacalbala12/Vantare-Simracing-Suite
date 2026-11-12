import { Combobox } from "@base-ui/react/combobox";
import { Fragment, type ReactNode, useEffect, useState } from "react";
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
  shortcut?: string;
  disabled?: boolean;
  run: () => void;
};
export function CommandPalette({
  title,
  description,
  trigger,
  empty,
  commands,
  open,
  onOpenChange,
}: {
  title: string;
  description: string;
  trigger: ReactNode;
  closeLabel: string;
  empty: string;
  commands: PaletteCommand[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);
  const filtered = commands.filter((item) =>
    `${item.label} ${item.meta ?? ""}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  return (
    <Dialog.Root
      open={open}
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
            autoHighlight
            itemToStringLabel={(item) => item.label}
            itemToStringValue={(item) => item.id}
            isItemEqualToValue={(a, b) => a.id === b.id}
            inline
            onValueChange={(item) => {
              if (item && !item.disabled) {
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
            <Combobox.List className="v-command-results">
              {(item: PaletteCommand) => (
                <Fragment key={item.id}>
                  {filtered.find((candidate) => candidate.group === item.group)
                    ?.id === item.id && (
                    <div className="v-command-group" role="presentation">
                      {item.group === "navigation"
                        ? text.destinations
                        : text.actions}
                    </div>
                  )}
                  <Combobox.Item
                    className="v-command-row"
                    value={item}
                    disabled={item.disabled}
                  >
                    <span className="v-command-icon">
                      <Icon name={item.icon ?? "i-comando"} />
                    </span>
                    <span className="v-command-label">{item.label}</span>
                    <span className="v-command-meta">{item.meta}</span>
                    {item.shortcut && <Keycap>{item.shortcut}</Keycap>}
                    {item.disabled && <Icon name="v-lock" />}
                  </Combobox.Item>
                </Fragment>
              )}
            </Combobox.List>
            <Combobox.Empty className="v-command-empty">{empty}</Combobox.Empty>
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
