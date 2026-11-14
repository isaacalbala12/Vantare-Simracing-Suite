// The default Launcher profile depends on the initial scene, even after navigation.
export function launcherHeading(messages) {
  const profiles = messages.find(
    (message) => message.kind === "response" && message.result?.method === "launcher.get",
  )?.result.value.profiles;
  const selected = profiles?.find((profile) => profile.favorite) ?? profiles?.[0];
  if (typeof selected?.name !== "string" || !selected.name.trim())
    throw new Error("Measurement scene has no named default Launcher profile");
  return selected.name;
}
