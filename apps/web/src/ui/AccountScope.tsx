"use client";

import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { activateAttendanceDrafts } from "@/features/attendance/draft-store";
import type { Locale, Persona } from "@madrasty/contracts";

export type AccountPartition = Readonly<{
  accountId: string;
  sessionId: string;
  persona: Persona;
  expiresAt?: string;
}>;

export type ScopeChoice = Readonly<{ id: string; label: string; detail?: string }>;

const Scope = createContext<AccountPartition | null>(null);

export function AccountScope({ actor, locale, children }: { actor: AccountPartition; locale:Locale; children: ReactNode }) {
  const partition=useMemo(()=>({accountId:actor.accountId,sessionId:actor.sessionId,persona:actor.persona,expiresAt:actor.expiresAt}),[actor.accountId,actor.sessionId,actor.persona,actor.expiresAt]);
  useEffect(()=>{void activateAttendanceDrafts(partition,locale);},[partition,locale]);
  return (
    <Scope.Provider key={JSON.stringify([actor.accountId, actor.sessionId, actor.persona])} value={partition}>
      {children}
    </Scope.Provider>
  );
}

export function useAccountScope() {
  const actor = useContext(Scope);
  if (!actor) throw new Error("Protected controls require an account partition");
  return actor;
}
