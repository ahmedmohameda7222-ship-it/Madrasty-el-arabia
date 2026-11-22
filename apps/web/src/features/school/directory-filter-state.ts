export type DirectoryMode = "students" | "guardians";

function filterKey(mode: DirectoryMode) {
  return mode === "students" ? "studentQuery" : "guardianQuery";
}

export function readDirectorySearch(params: Pick<URLSearchParams, "get">, mode: DirectoryMode): string {
  return params.get(filterKey(mode)) ?? "";
}

export function writeDirectorySearch(params: URLSearchParams, mode: DirectoryMode, value: string): URLSearchParams {
  const next = new URLSearchParams(params);
  const query = value.trim();
  if (query) next.set(filterKey(mode), query);
  else next.delete(filterKey(mode));
  return next;
}
