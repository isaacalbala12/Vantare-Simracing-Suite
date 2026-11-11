import { skipToken, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CoreStatus,
  HomeView,
} from "../../../contract/generated/contract";
import { coreKey, offline, useHost } from "../../app/Host";
import { lock } from "../../app/navigation";
import { SectionChrome } from "../../app/SectionChrome";
import { useUi } from "../../app/UiState";
import { homeText as t } from "../../i18n/home";
import { HomeLayout, HomeRail } from "../../ui/home/HomeLayout";
import { profileChoice } from "../../ui/home/model";
import { snapshot } from "../launcher/editor-state";
import { useNotifications } from "../notifications/NotificationsState";
export default function Home() {
  const { client, hello } = useHost();
  const query = useQueryClient();
  const { data: core = offline } = useQuery<CoreStatus>({
    queryKey: coreKey,
    queryFn: skipToken,
  });
  const [view, setView] = useState<HomeView>();
  const [name, setName] = useState(hello?.demoName ?? "");
  const [selected, select] = useState("");
  const launching = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [now, setNow] = useState(() => new Date());
  const go = useUi((s) => s.navigate);
  async function navigate(section: import("../../app/sections").Section) {
    if (section === "launcher" || section === "studio") {
      const reason = lock(section, core.access);
      if (reason) {
        setError(reason);
        return;
      }
    }
    if (
      section === "launcher" &&
      view?.protected &&
      view.profiles.length === 0
    ) {
      setError(t.failed);
      return;
    }
    if (
      section === "launcher" &&
      view?.profiles.length === 0 &&
      client &&
      !query.getQueryData(["launcher", "profileDraft"])
    ) {
      try {
        const result = await client.request({
          method: "launcher.profile.get",
          id: null,
        });
        if (
          result.method === "launcher.profile.get" &&
          !query.getQueryData(["launcher", "profileDraft"])
        )
          query.setQueryData(
            ["launcher", "profileDraft"],
            snapshot(result.value, true),
          );
      } catch {
        setError(t.failed);
        return;
      }
    }
    go(section);
  }
  const commands = useUi((s) => s.commands);
  const notices = useNotifications();
  const reload = useCallback(async () => {
    if (!client) return;
    try {
      const result = await client.request({ method: "home.get" });
      if (result.method === "home.get") {
        setView(result.value);
      }
    } catch {
      setError(t.accessError);
    }
  }, [client]);
  useEffect(() => {
    if (!client) return;
    let active = true;
    const off = client.listen((m) => {
      if (m.kind === "event" && m.event.topic === "home")
        setView(m.event.value);
    });
    const unsub = client.subscribe("home");
    void reload();
    void client
      .request({ method: "pilot.load" })
      .then((r) => {
        if (active && r.method === "pilot.load")
          setName(hello?.demoName ?? r.value.fields.publicName);
      })
      .catch(() => {});
    return () => {
      active = false;
      unsub();
      off();
    };
  }, [client, reload, hello?.demoName]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const choice = profileChoice(
    view?.profiles ?? [],
    view?.favorite ?? null,
    selected,
  );
  async function launch(favorite: boolean) {
    if (!client || launching.current || !view) return;
    const profile = favorite ? view.favorite : choice;
    if (!profile) return;
    launching.current = true;
    setPending(true);
    setError(undefined);
    try {
      const result = await client.request({
        method: "launcher.launch",
        profile,
        baseRevision: view.revision,
      });
      if (result.method === "launcher.launch" && !result.accepted)
        setError(t.failed);
    } catch {
      setError(t.failed);
    } finally {
      launching.current = false;
      setPending(false);
      void reload();
    }
  }
  async function retry() {
    setError(undefined);
    if (client) {
      try {
        const result = await client.request({ method: "core.get" });
        if (result.method === "core.get")
          query.setQueryData(coreKey, result.value);
      } catch {
        setError(t.accessError);
      }
    }
    void reload();
  }
  return (
    <>
      <SectionChrome
        title={t.title}
        rail={
          <HomeRail view={view} core={core} navigate={navigate} error={error} />
        }
      />
      <HomeLayout
        view={view}
        core={core}
        name={name}
        now={now}
        selected={choice}
        pending={pending}
        error={error}
        records={notices.records}
        select={select}
        launch={launch}
        navigate={navigate}
        commands={() => commands(true)}
        retry={retry}
      />
    </>
  );
}
