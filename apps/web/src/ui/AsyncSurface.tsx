"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { dictionary } from "@/i18n";
import type { Locale } from "@madrasty/contracts";
import { Icon } from "./Icon";
import { ConfirmedAt } from "./RecordValues";

export type AsyncState =
  | { kind: "initialLoading"; shape?: "list" | "card" | "detail" }
  | { kind: "ready"; content: ReactNode }
  | { kind: "refreshing"; content: ReactNode; lastConfirmed?: string }
  | { kind: "stale"; content: ReactNode; lastConfirmed: string; retry: () => void }
  | { kind: "empty"; filtered?: boolean; action?: ReactNode }
  | { kind: "error" | "offline"; retry: () => void; message?: string }
  | { kind: "offlineDraft"; content: ReactNode; lastConfirmed?: string }
  | { kind: "conflict" | "readOnly"; content: ReactNode; message?: string }
  | { kind: "forbidden"; action?: ReactNode };

export function AsyncSurface({ locale, state }: { locale: Locale; state: AsyncState }) {
  const text = dictionary(locale);
  if (state.kind === "initialLoading") return <ColdLoad locale={locale} shape={state.shape} />;
  if (state.kind === "forbidden") return <Forbidden locale={locale} action={state.action} />;
  if (state.kind === "empty") return (
    <div className="notice">{state.filtered ? text.filteredEmpty : text.empty}{state.action}</div>
  );
  if (state.kind === "error" || state.kind === "offline") return (
    <div className="notice">
      <p role="alert"><Icon name="warning" />{state.message ?? text[state.kind]}</p>
      <Retry locale={locale} retry={state.retry} />
    </div>
  );

  return (
    <>
      {state.kind === "refreshing" && <DelayedStatus label={text.refreshing} />}
      {state.kind === "stale" && (
        <div className="notice">
          <p role="status"><Icon name="warning" />{text.error}</p>
          <Retry locale={locale} retry={state.retry} />
        </div>
      )}
      {state.kind === "offlineDraft" && <p className="notice" role="status"><Icon name="clock" />{text.offlineDraft}</p>}
      {state.kind === "conflict" && <p className="notice" role="alert">{state.message ?? text.conflict}</p>}
      {state.kind === "readOnly" && <p className="notice"><Icon name="lock" />{state.message ?? text.readOnly}</p>}
      {"lastConfirmed" in state && state.lastConfirmed && <ConfirmedAt locale={locale} value={state.lastConfirmed} />}
      {"content" in state && state.content}
    </>
  );
}

function ColdLoad({ locale, shape = "list" }: { locale: Locale; shape?: "list" | "card" | "detail" }) {
  const text = dictionary(locale);
  const [showSkeleton, setShowSkeleton] = useState(false);
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const skeleton = setTimeout(() => setShowSkeleton(true), 180);
    const stillLoading = setTimeout(() => setSlow(true), 8_000);
    return () => { clearTimeout(skeleton); clearTimeout(stillLoading); };
  }, []);
  return (
    <>
      <p role="status" className={slow ? "status" : "screen-reader-only"}>{slow ? text.stillLoading : text.loading}</p>
      {showSkeleton && (
        <div className={`skeleton skeleton-${shape}`} aria-hidden="true">
          {Array.from({ length: shape === "card" ? 2 : 4 }, (_, index) => (
            <div className="skeleton-row" key={index}><span /><span /></div>
          ))}
        </div>
      )}
    </>
  );
}

function DelayedStatus({ label }: { label: string }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setVisible(true), 180);
    return () => clearTimeout(id);
  }, []);
  return <span className="status" role="status">{visible ? label : ""}</span>;
}

function Forbidden({ locale, action }: { locale: Locale; action?: ReactNode }) {
  const notice = useRef<HTMLDivElement>(null);
  useEffect(() => notice.current?.focus(), []);
  return (
    <div className="notice" tabIndex={-1} ref={notice}>
      <p><Icon name="lock" />{dictionary(locale).forbidden}</p>{action}
    </div>
  );
}

function Retry({ locale, retry }: { locale: Locale; retry: () => void }) {
  return <button className="plain-button" type="button" onClick={retry}>{dictionary(locale).retry}</button>;
}
