export type InboxContext = { filter: string; search: string; archived: boolean };

export function readInboxContext<const T extends string>(
  params: Pick<URLSearchParams, "get">,
  validFilters: readonly T[],
): { filter: T; search: string; archived: boolean } {
  const candidate = params.get("filter") as T | null;
  return {
    filter: candidate && validFilters.includes(candidate) ? candidate : validFilters[0]!,
    search: params.get("q") ?? "",
    archived: params.get("archived") === "1",
  };
}

export function writeInboxContext(params: URLSearchParams, patch: Partial<InboxContext>): URLSearchParams {
  const next = new URLSearchParams(params);
  if (patch.filter !== undefined) {
    if (patch.filter === "all") next.delete("filter");
    else next.set("filter", patch.filter);
  }
  if (patch.search !== undefined) {
    const query = patch.search.trim();
    if (query) next.set("q", query);
    else next.delete("q");
  }
  if (patch.archived !== undefined) {
    if (patch.archived) next.set("archived", "1");
    else next.delete("archived");
  }
  return next;
}

export function withInboxThread(params: Pick<URLSearchParams, "toString">, id?: string): URLSearchParams {
  const next = new URLSearchParams(params.toString());
  if (id) next.set("thread", id);
  else next.delete("thread");
  return next;
}
