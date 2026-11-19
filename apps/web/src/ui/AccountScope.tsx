"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Persona } from "@madrasty/contracts";

export type AccountPartition = Readonly<{
  accountId: string;
  sessionId: string;
  persona: Persona;
}>;

export type ScopeChoice = Readonly<{ id: string; label: string; detail?: string }>;

const Scope = createContext<AccountPartition | null>(null);

export function AccountScope({ actor, children }: { actor: AccountPartition; children: ReactNode }) {
  return (
    <Scope.Provider key={JSON.stringify([actor.accountId, actor.sessionId, actor.persona])} value={actor}>
      {children}
    </Scope.Provider>
  );
}

export function useAccountScope() {
  const actor = useContext(Scope);
  if (!actor) throw new Error("Protected controls require an account partition");
  return actor;
}
