"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { z } from "zod";
import { dictionary } from "@/i18n";
import { displayPath } from "@/i18n/presentation";
import { AppSettingsSheet } from "./AppSettingsSheet";
import type { Locale, Persona, Preferences } from "@madrasty/contracts";
import { AccountScope, type AccountPartition, type ScopeChoice } from "./AccountScope";
import { Icon } from "./Icon";
import { MoreBackLink } from "./MoreBackLink";
import { SchoolLink } from "./SchoolLink";
import { NotificationLink, PushPreferences } from "@/features/comms/NotificationCenter";

type Destination = "home" | "students" | "attendance" | "children" | "messages" | "calendar" | "more";
const roleTab: Record<Persona, Destination> = { admin: "students", teacher: "attendance", guardian: "children" };
const childScope = z.uuid();

export function SchoolHeader({ locale, children, brandHref, notificationSettings }: { locale: Locale; children?: ReactNode; alternateHref?: string; brandHref?: string; notificationSettings?: ReactNode }) {
  const text = dictionary(locale);
  return (
    <header className="school-header">
      <Link className="brand" href={brandHref ?? `/${locale}`} aria-label={text.school} title={text.school}>
        <Image src="/school-192.png" alt="" width={44} height={44} />
        <span>{text.school}</span>
      </Link>
      <div className="header-actions">
        {children}
        <AppSettingsSheet locale={locale}>{notificationSettings}</AppSettingsSheet>
      </div>
    </header>
  );
}

export function SchoolShell(props: {
  actor: AccountPartition;
  locale: Locale;
  children: ReactNode;
  theme?: Preferences["theme"];
  selectedScope?: ScopeChoice;
  scopePicker?: ReactNode;
  secondary?: { href: string; label: string }[];
  mayManageStudents?: boolean;
}) {
  return (
    <AccountScope actor={props.actor} locale={props.locale}>
      <ScopedShell {...props} />
    </AccountScope>
  );
}

function ScopedShell({ actor, locale, children, theme = "system", selectedScope, scopePicker, secondary, mayManageStudents }: Parameters<typeof SchoolShell>[0]) {
  const text = dictionary(locale);
  const routePathname = usePathname();
  const pathname = displayPath(routePathname,locale);
  const routeParams = useSearchParams();
  const search = routeParams.toString();
  const main = useRef<HTMLElement>(null);
  const positions = useRef(new Map<string, { top: number; focus: string | null }>());
  const tabs = useRef(new Map<Destination, string>());
  const root = `/${locale}/school`;
  const showMoreBack = pathname.startsWith(`${root}/more/`) ||
    pathname === `/${locale}/directory` || pathname === `/${locale}/account/preferences`;
  const returnChild = actor.persona === "guardian" ? childScope.safeParse(routeParams.get("returnChild")).data : undefined;
  const year = childScope.safeParse(routeParams.get("year")).data;
  const classId = childScope.safeParse(routeParams.get("class")).data;
  const returnClass = actor.persona === "admin" && routeParams.get("returnToClass")==="1" && year && classId
    ? {year,id:classId} : undefined;
  const destinations: Destination[] = ["home", "messages", "calendar", "more"];
  if (actor.persona !== "admin" || mayManageStudents) destinations.splice(1,0,roleTab[actor.persona]);
  const commSection=pathname===`/${locale}/directory`?"chat":[`${root}/more/news`,`${root}/more/broadcasts`].includes(pathname)?"feed":undefined;
  const active = commSection?"messages":destinations.find((tab) => pathname.startsWith(`${root}/${tab}/`) || pathname === `${root}/${tab}`) ?? (pathname.includes("/account/") || pathname.endsWith("/directory") ? "more" : "home");

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    return () => { delete document.documentElement.dataset.theme; };
  }, [theme]);

  useLayoutEffect(() => {
    const area = main.current;
    if (!area) return;
    const route = search ? routePathname + "?" + search : routePathname;
    if(!commSection)tabs.current.set(active, route);
    const previous = positions.current.get(route);
    area.scrollTop = previous?.top ?? 0;
    if (previous?.focus) {
      const target = document.getElementById(previous.focus);
      if (target && area.contains(target)) target.focus({ preventScroll: true });
    }
    const save = () => positions.current.set(route, {
      top: area.scrollTop,
      focus: area.contains(document.activeElement) ? document.activeElement?.id || null : null,
    });
    area.addEventListener("scroll", save, { passive: true });
    area.addEventListener("focusin", save);
    return () => {
      area.removeEventListener("scroll", save);
      area.removeEventListener("focusin", save);
    };
  }, [routePathname, search, active, commSection]);

  return (
    <div className="school-shell">
      <a className="skip-link" href="#school-content">{text.skip}</a>
      <SchoolHeader locale={locale} brandHref={`${root}/home`} notificationSettings={<PushPreferences locale={locale}/>}>{scopePicker}<NotificationLink locale={locale}/></SchoolHeader>
      <div className="school-body">
        <nav className="school-nav" aria-label={text.navigation} data-columns={destinations.length}>
          {destinations.map((tab) => (
            <SchoolLink key={tab} href={tabs.current.get(tab) ?? `${root}/${tab}`} scroll={false}
              aria-current={active === tab ? "page" : undefined}
              aria-label={tab==="messages"?(locale==="ar"?"التواصل":"Kontakt"):tab==="calendar"?(locale==="ar"?"التقويم":"Kalender"):locale==="de"&&tab==="attendance"?text[tab]:undefined}>
              <Icon name={tab} />
              {locale === "de" && (tab === "attendance" || tab === "messages") ? <>
                <span className="nav-label-mobile" aria-hidden="true">{tab === "attendance" ? "Anwes." : "Kontakt"}</span>
                <span className="nav-label-desktop" aria-hidden="true">{tab==="messages"?"Kontakt":text[tab]}</span>
              </> : <span>{tab==="messages"?(locale==="ar"?"التواصل":"Kontakt"):tab==="calendar"?(locale==="ar"?"التقويم":"Kalender"):text[tab]}</span>}
            </SchoolLink>
          ))}
          {secondary && (
            <div className="school-secondary">
              {secondary.map(({ href, label }) => <SchoolLink key={href} href={href} scroll={false}>{label}</SchoolLink>)}
            </div>
          )}
        </nav>
        <main id="school-content" ref={main} className="school-content" tabIndex={-1}>
          {(showMoreBack || returnChild && pathname.startsWith(`${root}/children/`)) && <MoreBackLink locale={locale} child={returnChild} schoolClass={returnClass} communication={commSection} />}
          {selectedScope && <p className="scope-label"><bdi>{selectedScope.label}</bdi>{selectedScope.detail && <> · <bdi>{selectedScope.detail}</bdi></>}</p>}
          {children}
        </main>
      </div>
    </div>
  );
}

export function ScopeSheet({ locale, choices, selectedId, select }: {
  locale: Locale;
  choices: ScopeChoice[];
  selectedId?: string;
  select: (id: string) => void;
}) {
  const text = dictionary(locale);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const restore = () => trigger.current?.focus();
    element.addEventListener("close", restore);
    return () => element.removeEventListener("close", restore);
  }, []);

  return (
    <>
      <button ref={trigger} type="button" className="plain-button" onClick={() => dialog.current?.showModal()}>
        {text.chooseScope}
      </button>
      <dialog className="scope-sheet" ref={dialog} aria-label={text.choose}>
        <div className="sheet-header">
          <h2>{text.choose}</h2>
          <form method="dialog"><button className="plain-button">{text.close}</button></form>
        </div>
        <ul className="group-list">
          {choices.map(({ id, label, detail }) => (
            <li key={id}>
              <button type="button" className="group-row" aria-pressed={id === selectedId}
                onClick={() => { select(id); dialog.current?.close(); }}>
                <bdi>{label}</bdi>
                {detail && <small><bdi>{detail}</bdi></small>}
              </button>
            </li>
          ))}
        </ul>
      </dialog>
    </>
  );
}
