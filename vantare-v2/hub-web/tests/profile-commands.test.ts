import { expect, it, vi } from "vitest";
import fixture from "../fixtures/launcher-base.json";
import type { LauncherView } from "../src/contract/generated/contract";
import { createMockHost } from "../src/mock/host";
import { profileCommands } from "../src/renderer/app/profile-commands";

it("lists every profile and passes the exact read revision to the simulated core", () => {
  const host = createMockHost("launcher-ready");
  const snapshot = host({
    kind: "request",
    id: 1,
    request: { method: "launcher.get" },
  });
  if (
    snapshot?.kind !== "response" ||
    snapshot.result.method !== "launcher.get"
  )
    throw new Error("Missing launcher snapshot");
  const send = vi.fn((profile: string, baseRevision: string) =>
    host({
      kind: "request",
      id: 2,
      request: { method: "launcher.launch", profile, baseRevision },
    }),
  );
  const commands = profileCommands(snapshot.result.value, undefined, send);
  expect(commands).toHaveLength(snapshot.result.value.profiles.length);
  const second = commands[1];
  second.run();
  expect(send).toHaveBeenCalledExactlyOnceWith(
    snapshot.result.value.profiles[1].id,
    snapshot.result.value.revision,
  );
  expect(send.mock.results[0].value).toMatchObject({
    kind: "response",
    result: { method: "launcher.launch", accepted: true },
  });
});
it.each([
  "Acceso sin verificar",
  "No se puede lanzar en pista",
  "Petición en curso",
])("blocks launch for %s", (reason) => {
  const send = vi.fn();
  const view = structuredClone(fixture) as LauncherView;
  view.profiles.forEach((profile) => {
    profile.launchable = true;
  });
  const commands = profileCommands(view, reason, send);
  commands.forEach((command) => {
    expect(command.disabled).toBe(true);
    expect(command.meta).toBe(reason);
    command.run();
  });
  expect(send).not.toHaveBeenCalled();
});
it("does not dispatch with an active chain or unconfigured profile", () => {
  const send = vi.fn();
  const view = structuredClone(fixture) as LauncherView;
  profileCommands(view, undefined, send).forEach((command) => {
    expect(command.disabled).toBe(true);
    command.run();
  });
  view.running = true;
  view.profiles.forEach((profile) => {
    profile.launchable = true;
  });
  profileCommands(view, undefined, send).forEach((command) => {
    expect(command.disabled).toBe(true);
    command.run();
  });
  expect(send).not.toHaveBeenCalled();
});
