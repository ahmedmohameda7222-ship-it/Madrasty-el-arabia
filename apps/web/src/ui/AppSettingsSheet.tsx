"use client";
import {useRef,useState,type ReactNode} from "react";
import type {Locale} from "@madrasty/contracts";
import {Icon} from "./Icon";
import {LanguageSettings} from "./PresentationLanguage";

export function AppSettingsSheet({locale,children}:{locale:Locale;children?:ReactNode}){
 const dialog=useRef<HTMLDialogElement>(null),trigger=useRef<HTMLButtonElement>(null);
 const [open,setOpen]=useState(false);
 const title=locale==="ar"?"إعدادات التطبيق":"App-Einstellungen";
 const close=locale==="ar"?"إغلاق":"Schließen";
 return <>
  <button ref={trigger} type="button" className="plain-button app-settings-trigger" aria-label={title} aria-haspopup="dialog"
    onClick={()=>{setOpen(true);dialog.current?.showModal();}}><Icon name="settings"/></button>
  <dialog ref={dialog} className="scope-sheet app-settings-sheet" aria-label={title}
    onClose={()=>{setOpen(false);trigger.current?.focus({preventScroll:true});}}>
    <div className="sheet-header"><h2>{title}</h2><button className="plain-button" type="button" onClick={()=>dialog.current?.close()}>{close}</button></div>
    {open&&<><LanguageSettings locale={locale}/>{children}</>}
  </dialog>
 </>;
}
