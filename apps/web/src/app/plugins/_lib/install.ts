export const installDeepLink = (id: string, version: string) =>
  `alpine-shell://install-plugin?id=${encodeURIComponent(id)}&version=${encodeURIComponent(version)}`;
