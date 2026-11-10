import { useState } from "react";
import { contrastRange } from "../../contract/generated/contract";
import { Icon } from "../assets/icons/Icon";
import { paletteNames, specimen as t } from "../i18n/es";
import { Button, IconButton } from "../ui/Button";
import {
  Avatar,
  Badge,
  Callout,
  Card,
  Keycap,
  Progress,
  SettingRow,
  Skeleton,
  Spinner,
  Table,
} from "../ui/Data";
import {
  Checkbox,
  Input,
  RadioGroup,
  SearchInput,
  Segmented,
  Select,
  Slider,
  Switch,
  Tabs,
  Textarea,
} from "../ui/Forms";
import { CommandPalette, PageHeader } from "../ui/Frame";
import {
  AlertDialog,
  Dialog,
  Menu,
  Popover,
  useToastManager,
} from "../ui/Layers";
export function Specimen() {
  const [checked, setChecked] = useState(false);
  const [value, setValue] = useState(100);
  const [search, setSearch] = useState("");
  const [scheme, setScheme] = useState("dark");
  const [dialogScheme, setDialogScheme] = useState("dark");
  const [tab, setTab] = useState("general");
  const [palette, setPalette] = useState("vantare");
  const [commandsOpen, setCommandsOpen] = useState(false);
  const toast = useToastManager();
  const options = [
    { value: "dark", label: t.dark },
    { value: "light", label: t.light },
    { value: "system", label: t.system },
  ];
  return (
    <div className="v-specimen">
      <PageHeader title={t.title} description={t.description} />
      <Card title={t.theme}>
        <div className="v-specimen-row">
          <Select
            label={t.palette}
            value={palette}
            onChange={(v) => {
              setPalette(v);
              document.documentElement.dataset.palette = v;
            }}
            options={Object.entries(paletteNames).map(([value, label]) => ({
              value,
              label,
            }))}
          />
          <Segmented
            label={t.scheme}
            value={scheme}
            options={options}
            onChange={(v) => {
              setScheme(v);
              document.documentElement.dataset.scheme =
                v === "system"
                  ? matchMedia("(prefers-color-scheme: dark)").matches
                    ? "dark"
                    : "light"
                  : v;
            }}
          />
        </div>
      </Card>
      <Card title={t.controls}>
        <div className="v-specimen-row">
          <Button variant="primary">{t.primary}</Button>
          <Button>{t.neutral}</Button>
          <Button variant="ghost">{t.ghost}</Button>
          <Button variant="danger">{t.danger}</Button>
          <Button busy>{t.pending}</Button>
          <Button disabled>{t.disabled}</Button>
          <IconButton label={t.settings}>
            <Icon name="i-ajustes" />
          </IconButton>
        </div>
        <SettingRow label={t.name} description={t.hint}>
          <Input label={t.name} defaultValue={t.avatar} />
        </SettingRow>
        <SettingRow label={t.invalid}>
          <Input label={t.name} error={t.invalid} defaultValue={t.avatar} />
        </SettingRow>
        <SettingRow label={t.descriptionField}>
          <Textarea label={t.descriptionField} />
        </SettingRow>
        <SettingRow label={t.search}>
          <SearchInput
            label={t.search}
            clearLabel={t.clear}
            value={search}
            onChange={setSearch}
          />
        </SettingRow>
        <SettingRow label={t.notifications}>
          <Switch
            label={t.notifications}
            checked={checked}
            onCheckedChange={setChecked}
          />
        </SettingRow>
        <SettingRow label={t.pendingSwitch}>
          <Switch label={t.pendingSwitch} checked={checked} pending />
        </SettingRow>
        <SettingRow label={t.contrast}>
          <Slider
            label={t.contrast}
            value={value}
            min={contrastRange[0]}
            max={contrastRange[1]}
            onChange={setValue}
            onValueCommitted={setValue}
          />
        </SettingRow>
        <div className="v-specimen-row">
          <Checkbox
            label={t.permission}
            checked={checked}
            onCheckedChange={setChecked}
          />
          <Checkbox label={t.permission} indeterminate />
          <RadioGroup
            label={t.choice}
            options={options.slice(0, 2)}
            value={scheme}
            onChange={setScheme}
          />
        </div>
        <Tabs
          label={t.tabs}
          value={tab}
          onChange={setTab}
          items={[
            { value: "general", label: t.general, content: t.hint },
            {
              value: "appearance",
              label: t.appearance,
              content: t.description,
            },
          ]}
        />
      </Card>
      <Card title={t.layers}>
        <div className="v-specimen-row">
          <Dialog
            title={t.dialogTitle}
            description={t.dialogDescription}
            trigger={t.dialog}
            closeLabel={t.close}
          >
            <Input label={t.name} />
            <Select
              label={t.dialogSelect}
              options={options}
              value={dialogScheme}
              onChange={setDialogScheme}
            />
          </Dialog>
          <AlertDialog
            title={t.dialogTitle}
            description={t.dialogDescription}
            trigger={t.alert}
            closeLabel={t.close}
          >
            <Button>{t.neutral}</Button>
          </AlertDialog>
          <Popover label={t.popover} trigger={<Icon name="i-panel" />}>
            <p>{t.hint}</p>
          </Popover>
          <Menu
            label={t.menu}
            items={[
              { id: "save", label: t.primary, onSelect: () => {} },
              {
                id: "delete",
                label: t.danger,
                disabled: true,
                onSelect: () => {},
              },
            ]}
          />
          <Button
            onClick={() =>
              toast.add({
                title: t.error,
                type: "err",
                priority: "high",
                timeout: 0,
              })
            }
          >
            {t.toast}
          </Button>
          <CommandPalette
            title={t.commands}
            description={t.commandsDescription}
            trigger={t.openCommands}
            closeLabel={t.close}
            empty={t.empty}
            commands={[
              { id: "settings", label: t.settings, run: () => {} },
              { id: "home", label: t.home, run: () => {} },
            ]}
            open={commandsOpen}
            onOpenChange={setCommandsOpen}
          />
        </div>
      </Card>
      <Card title={t.data}>
        <div className="v-specimen-row">
          <Badge>{t.beta}</Badge>
          <Badge tone="live">{t.ready}</Badge>
          <Keycap>{t.zoom}</Keycap>
          <Avatar label={t.avatar} initials={t.initials} />
          <Spinner label={t.pending} />
          <Skeleton label={t.pending} />
        </div>
        <Progress label={t.progress} value={60} />
        <Callout title={t.message}>{t.hint}</Callout>
        <Callout title={t.warning} tone="warn" />
        <Callout
          title={t.error}
          tone="err"
          actions={<Button size="sm">{t.retry}</Button>}
        />
        <Table
          caption={t.table}
          columns={[
            { key: "document", label: t.document },
            { key: "state", label: t.state },
          ]}
          rows={[{ id: "settings", cells: ["hub-settings.json", t.ready] }]}
          empty={t.noRows}
        />
        <Table
          caption={t.table}
          columns={[
            { key: "document", label: t.document },
            { key: "state", label: t.state },
          ]}
          rows={Array.from({ length: 1000 }, (_, index) => ({
            id: String(index),
            cells: [`qa-${index}.json`, t.ready],
          }))}
          empty={t.noRows}
        />
      </Card>
    </div>
  );
}
