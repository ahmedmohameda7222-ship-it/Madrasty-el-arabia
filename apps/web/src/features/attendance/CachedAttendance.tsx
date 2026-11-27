"use client";

import { attendanceStatus, type AttendanceStatus, type Locale } from "@madrasty/contracts";
import type { CachedSheet, CachedAttendanceRow } from "./draft-store";

const copy={
  ar:{last:"آخر تأكيد من المدرسة",pending:"تعديلات غير مُرسلة",saved:"نسخة محفوظة على الجهاز",readonly:"الكشف للعرض فقط.",
    present:"حاضر",late:"متأخر",absent_unexcused:"غائب بدون عذر",absent_excused:"غائب بعذر",unmarked:"بدون تسجيل",
    locked:"حالة مقفولة",arrival:"حضور فعلي مؤكد",error:"تعذّر الحفظ على هذا الجهاز."},
  de:{last:"Zuletzt von der Schule bestätigt",pending:"Ungesendete Änderungen",saved:"Auf diesem Gerät gespeicherte Liste",readonly:"Die Liste kann nur gelesen werden.",
    present:"Anwesend",late:"Verspätet",absent_unexcused:"Unentschuldigt abwesend",absent_excused:"Entschuldigt abwesend",unmarked:"Ohne Eintrag",
    locked:"Status gesperrt",arrival:"Ankunft bestätigt",error:"Auf diesem Gerät konnte nicht gespeichert werden."},
} as const;

export function CachedAttendance({locale,entry,edit,error}:{locale:Locale;entry:CachedSheet;
  edit:(row:CachedAttendanceRow,status:AttendanceStatus|null)=>void;error:boolean}){
  const text=copy[locale];
  return <section className="auth-card auth-form attendance-sheet">
    <h2><bdi>{locale==="ar"?entry.classroom.nameAr:entry.classroom.nameDe}</bdi></h2>
    <bdi dir="ltr">{entry.schoolDate}</bdi>
    <p role="status">{text.saved}</p>
    <p>{text.last} · <bdi>{new Date(entry.confirmedAt).toLocaleString(locale==="ar"?"ar":"de-DE")}</bdi></p>
    <p>{text.pending} · {new Intl.NumberFormat(locale).format(Object.keys(entry.drafts).length)}</p>
    {error&&<p role="alert">{text.error}</p>}
    {entry.readonly&&<p>{text.readonly}</p>}
    <ul className="group-list attendance-rows">{entry.rows.map((row)=>{
      const pending=entry.drafts[row.id];
      const value=pending?pending.status:row.status;
      return <li key={row.id} className="timetable-day">
        <strong><bdi>{row.displayName}</bdi></strong> <bdi dir="ltr">{row.studentNumber}</bdi>
        {entry.readonly||row.locked||row.arrival?<p>{text[row.status??"unmarked"]}</p>:<label>
          <span className="screen-reader-only">{row.displayName}</span>
          <select value={value??""} onChange={(event)=>edit(row,event.target.value?attendanceStatus.parse(event.target.value):null)}>
            <option value="">{text.unmarked}</option>
            {attendanceStatus.options.map((status)=><option key={status} value={status}>{text[status]}</option>)}
          </select>
        </label>}
        {row.locked&&<p>{text.locked}</p>}{row.arrival&&<p>{text.arrival}</p>}
      </li>;
    })}</ul>
  </section>;
}
