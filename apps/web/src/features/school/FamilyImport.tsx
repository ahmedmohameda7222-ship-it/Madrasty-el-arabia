"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { z } from "zod";
import {
  guardianSchema, importColumns, importInspectionSchema, importPreviewSchema, importReceiptSchema,
  importVersionSchema, maxFamilyUploadBytes, studentSchema, type Locale,
} from "@madrasty/contracts";
import { ApiResponseError, requestApi } from "@/api/client";
import { useAdminCommand } from "@/api/commands";
import { dictionary, localizedError } from "@/i18n";

const copy = {
  ar: {
    title:"استيراد الأسر", upload:"رفع الملف", template:"تنزيل قالب", instructions:"استبدل صفوف الأمثلة، واحفظ مفاتيح الأسر والطلاب وأولياء الأمور كنص. كل صف يربط طفلًا بولي أمر واحد.",
    file:"ملف CSV أو XLSX", worksheet:"ورقة العمل", delimiter:"فاصل CSV", noColumn:"غير مستخدم", mapping:"مطابقة الأعمدة",
    map:"معاينة البيانات", review:"مراجعة الصفوف", row:"صف", column:"عمود", decision:"القرار", save:"حفظ القرار",
    approve:"استخدم السجل الحالي", skip:"تخطّ الصف", restore:"اعتمد إعادة الربط", match_guardian:"اختر ولي أمر موجودًا",
    match_student:"اختر طالبًا موجودًا", payer:"مرشح للسداد", keep:"حسب الملف", yes:"نعم", no:"لا", find:"بحث",
    commit:"اعتماد الصفوف", receipt:"نتيجة الاستيراد", rows:"الصفوف المعتمدة", links:"الروابط المعتمدة الجديدة",
    eligible:"أولياء أمور مؤهلون للدعوة", sendNotice:"يمكن إرسال دعوات أولياء الأمور من هنا أو من ملفات الأسر.", next:"عرض صفوف إضافية",
    invalidFile:"راجع الملف واختر CSV أو XLSX صالحًا.", utf8:"احفظ CSV بترميز UTF-8.", workbookSize:"ملف Excel أكبر من الحدود المسموحة.",
    unsupportedWorkbook:"تركيب ملف Excel غير مدعوم.", worksheetError:"اختر ورقة عمل متاحة.", cellSize:"إحدى الخلايا أكبر من المسموح.",
    csvLayout:"راجع فاصل CSV والاقتباسات.", headers:"تأكد من وجود صف عناوين.", columnLimit:"الملف يتجاوز حد الأعمدة.", rowLimit:"الملف يتجاوز حد الصفوف.",
    familyKey:"مفتاح الأسرة (اختياري)",familyName:"اسم الأسرة (اختياري)",childKey:"مفتاح الطالب", studentNumber:"رقم الطالب", childName:"اسم الطالب", guardianKey:"مفتاح ولي الأمر",
    guardianName:"اسم ولي الأمر", email:"البريد الإلكتروني", communicationLocale:"لغة المراسلات", payerCandidate:"مرشح للسداد",
    new:"جديد", existing:"موجود", duplicate:"مكرر", conflict:"تعارض", revoked:"رابط ملغى", skipped:"متخطّى",
    invalid_value:"قيمة غير صالحة", identifier_needs_text:"احفظ المفتاح كنص للحفاظ على الأصفار", formula:"استبدل المعادلة بقيمة نصية",
    student_number_unknown:"رقم الطالب غير موجود", source_key_mismatch:"مفتاح المصدر مختلف", identity_fields_differ:"بيانات السجل مختلفة",
    conflicting_rows:"بيانات متعارضة بين الصفوف", link_revoked:"يتطلب إعادة اعتماد صريحة", guardian_email_collision:"البريد مرتبط بسجل آخر",
    decision_required:"اختر سجلًا صالحًا", inactive_student:"الطالب غير نشط", payer_conflict:"أكثر من مرشح للسداد", payer_missing:"لا يوجد مرشح للسداد",
  },
  de: {
    title:"Familien importieren", upload:"Datei hochladen", template:"Vorlage herunterladen",
    instructions:"Ersetzen Sie die Beispielzeilen. Speichern Sie Familien-, Schüler- und Sorgeberechtigten-Schlüssel als Text. Jede Zeile verknüpft ein Kind mit einer sorgeberechtigten Person.",
    file:"CSV- oder XLSX-Datei", worksheet:"Arbeitsblatt", delimiter:"CSV-Trennzeichen", noColumn:"Nicht verwendet", mapping:"Spalten zuordnen",
    map:"Vorschau anzeigen", review:"Zeilen prüfen", row:"Zeile", column:"Spalte", decision:"Entscheidung", save:"Entscheidung speichern",
    approve:"Bestehenden Eintrag übernehmen", skip:"Zeile überspringen", restore:"Verknüpfung erneut bestätigen", match_guardian:"Vorhandene Sorgeberechtigte auswählen",
    match_student:"Vorhandenen Schüler auswählen", payer:"Vorgeschlagener Zahler", keep:"Aus Datei", yes:"Ja", no:"Nein", find:"Suchen",
    commit:"Zeilen übernehmen", receipt:"Importergebnis", rows:"Übernommene Zeilen", links:"Neue bestätigte Verknüpfungen",
    eligible:"Einladungsberechtigte Sorgeberechtigte", sendNotice:"Elterneinladungen können hier oder im Familienprofil gesendet werden.", next:"Weitere Zeilen anzeigen",
    invalidFile:"Wählen Sie eine gültige CSV- oder XLSX-Datei.", utf8:"Speichern Sie die CSV-Datei als UTF-8.",
    workbookSize:"Die Excel-Datei überschreitet das Größenlimit.", unsupportedWorkbook:"Diese Excel-Struktur wird nicht unterstützt.",
    worksheetError:"Wählen Sie ein vorhandenes Arbeitsblatt.", cellSize:"Eine Zelle überschreitet die zulässige Größe.",
    csvLayout:"Prüfen Sie Trennzeichen und Anführungszeichen.", headers:"Prüfen Sie die Kopfzeile.",
    columnLimit:"Die Datei enthält zu viele Spalten.", rowLimit:"Die Datei enthält zu viele Zeilen.",
    familyKey:"Familienschlüssel (optional)",familyName:"Familienname (optional)",childKey:"Schülerschlüssel", studentNumber:"Schülernummer", childName:"Schülername", guardianKey:"Schlüssel der Sorgeberechtigten",
    guardianName:"Name der Sorgeberechtigten", email:"E-Mail-Adresse", communicationLocale:"Sprache für Mitteilungen", payerCandidate:"Vorgeschlagener Zahler",
    new:"Neu", existing:"Vorhanden", duplicate:"Duplikat", conflict:"Konflikt", revoked:"Widerrufen", skipped:"Übersprungen",
    invalid_value:"Ungültiger Wert", identifier_needs_text:"Schlüssel als Text speichern, damit führende Nullen erhalten bleiben",
    formula:"Formel durch einen Textwert ersetzen", student_number_unknown:"Schülernummer ist unbekannt", source_key_mismatch:"Quellschlüssel weicht ab",
    identity_fields_differ:"Bestehende Stammdaten weichen ab", conflicting_rows:"Widersprüchliche Zeilen", link_revoked:"Erneute Bestätigung erforderlich",
    guardian_email_collision:"Adresse gehört zu einem anderen Datensatz", decision_required:"Gültigen Eintrag auswählen",
    inactive_student:"Schüler inaktiv", payer_conflict:"Mehr als ein Zahlungsvorschlag", payer_missing:"Kein Zahlungsvorschlag",
  },
} as const;
const fields = Object.keys(importColumns.shape) as (keyof typeof importColumns.shape)[];
const optional = new Set(["studentNumber","payerCandidate","familyKey","familyName"]);
const lookup = z.union([studentSchema.array(), guardianSchema.array()]);
type Inspection = z.infer<typeof importInspectionSchema>;
type Preview = z.infer<typeof importPreviewSchema>;
type Review = Preview["rows"][number];
type Decision = "approve" | "skip" | "restore" | "match_guardian" | "match_student";
type Edit = { rowNo: number; decision: Decision; matchedId?: string; payerCandidate?: boolean };
const base = "/school/family-imports";
const readerErrors = {
  "imports.invalidFile":"invalidFile","imports.utf8":"utf8","imports.workbookSize":"workbookSize",
  "imports.unsupportedWorkbook":"unsupportedWorkbook","imports.worksheet":"worksheetError","imports.cellSize":"cellSize",
  "imports.csvLayout":"csvLayout","imports.headers":"headers","imports.columns":"columnLimit","imports.rows":"rowLimit",
} as const;

function encode(bytes: Uint8Array) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 16_384) binary += String.fromCharCode(...bytes.subarray(i, i + 16_384));
  return btoa(binary);
}

export function FamilyImport({ locale, job }: { locale: Locale; job?:string }) {
  const text = copy[locale], translated = dictionary(locale), command = useAdminCommand();
  const [file, setFile] = useState<File>();
  const [history,setHistory]=useState<z.infer<typeof importVersionSchema>[]>([]);
  const [filter,setFilter]=useState("all");
  const [stage,setStage]=useState(1);
  useEffect(()=>{document.querySelector(".school-content")?.scrollTo(0,0);window.scrollTo(0,0);},[stage]);
  const [confirmed,setConfirmed]=useState(false);
  const fileInput=useRef<HTMLInputElement>(null);
  const ar=locale==="ar";
  const tr=(de:string,arabic:string)=>ar?arabic:de;
  function rememberJob(id?:string){const url=new URL(window.location.href);if(id)url.searchParams.set("job",id);else url.searchParams.delete("job");window.history.replaceState(null,"",url);}
  async function resume(id:string,signal?:AbortSignal){
    const {data:status}=await requestApi(`${base}/${id}/status`,importVersionSchema,{signal});
    if(signal?.aborted)return;
    if(status.state==="committed"){const {data}=await requestApi(`${base}/${id}/receipt`,importReceiptSchema,{signal});if(!signal?.aborted){setReceipt(data);setStage(4);}return;}
    setReceipt(undefined);
    const info=await inspect(id,undefined,signal);
    if(!info||signal?.aborted)return;
    setStage(2);
    if(info.state==="review"){const {data}=await requestApi(`${base}/${id}/preview`,importPreviewSchema,{signal});if(!signal?.aborted){setPreview(data);setStage(3);}}
  }
  useEffect(()=>{const ctrl=new AbortController();void requestApi(base,importVersionSchema.array(),{signal:ctrl.signal}).then(({data})=>setHistory(data)).catch(()=>{});return()=>ctrl.abort();},[]);
  const [inspection, setInspection] = useState<Inspection>();
  const [mapping, setMapping] = useState<Partial<Record<(typeof fields)[number], number>>>({});
  const [preview, setPreview] = useState<Preview>();
  const [receipt, setReceipt] = useState<z.infer<typeof importReceiptSchema>>();
  const [limit, setLimit] = useState(40);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function run(action: () => Promise<unknown>) {
    setError(""); setPending(true);
    try { await action(); }
    catch (failure) {
      if (failure instanceof ApiResponseError) {
        const reason = (failure.fields?.file ?? failure.fields?.fileName) as keyof typeof readerErrors;
        setError(readerErrors[reason] ? text[readerErrors[reason]] : localizedError(locale, failure.messageKey));
      } else setError(translated["error.unavailable"]);
    } finally { setPending(false); }
  }

  async function inspect(id: string, option?: { worksheet?: string; delimiter?: string }, signal?:AbortSignal) {
    const query = new URLSearchParams(option);
    const { data } = await requestApi(`${base}/${id}${query.size ? `?${query}` : ""}`, importInspectionSchema,{signal});
    if(signal?.aborted)return;
    setInspection(data);
    const auto: typeof mapping = {};
    for (const key of fields) {
      const matches = data.columns.filter(({ label }) => label.toLowerCase() === key.toLowerCase());
      if (matches.length === 1) auto[key] = matches[0].index;
    }
    setMapping(data.savedColumnMap??auto);
    setPreview(undefined);
    return data;
  }

  useEffect(()=>{
    if(!job)return;
    const abort=new AbortController();
    setPending(true);
    setError("");
    void resume(job,abort.signal).catch((cause)=>{
      if(!abort.signal.aborted)setError(cause instanceof ApiResponseError
        ? localizedError(locale,cause.messageKey) : translated["error.unavailable"]);
    }).finally(()=>{if(!abort.signal.aborted)setPending(false);});
    return ()=>abort.abort();
  },[job,locale,translated]);

  const upload = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file || file.size > maxFamilyUploadBytes || !/\.(csv|xlsx)$/i.test(file.name)) {
      setError(text.invalidFile); return;
    }
    void run(async () => {
      const mime = /\.csv$/i.test(file.name) ? "text/csv" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      const result = await command(base, "POST", {
        fileName: file.name, mime, bytesBase64: encode(new Uint8Array(await file.arrayBuffer())),
      }, importVersionSchema);
      setReceipt(undefined);
      rememberJob(result.id);
      await inspect(result.id);setStage(2);
    });
  };

  const map = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!inspection) return;
    const cols = importColumns.safeParse(mapping);
    if (!cols.success) { setError(translated["error.validation"]); return; }
    void run(async () => {
      const next = await command(`${base}/${inspection.id}/mapping`, "PUT", {
        columnMap: cols.data, revision: inspection.revision,
        ...(inspection.worksheet && { worksheet: inspection.worksheet }),
        ...(inspection.delimiter && { delimiter: inspection.delimiter }),
      }, importPreviewSchema);
      setPreview(next);setConfirmed(false);
      setInspection({ ...inspection, revision: next.revision });
      setLimit(40);setStage(3);setConfirmed(false);
    });
  };

  const decide = (edit: Edit) => {
    if (!preview || !inspection) return;
    void run(async () => {
      const next = await command(`${base}/${preview.id}/decisions`, "PATCH",
        { revision: preview.revision, rows: [edit] }, importPreviewSchema);
      setPreview(next);setConfirmed(false);
      setInspection({ ...inspection, revision: next.revision });
    });
  };

  const rows=preview?.rows.filter(row=>filter==="all"||row.disposition===filter)??[];
  return <div className="family-workspace family-import">
    <Link className="plain-button family-back" href={`/${locale}/school/students`}>{tr("Zurück","رجوع")}</Link>
    <h1>{text.title}</h1>
    <p role="status">{tr("Schritt","الخطوة")} {stage}/4 · {[tr("Datei auswählen","اختيار الملف"),text.mapping,text.review,text.receipt][stage-1]}</p>
    {stage===1&&<section className="auth-card">
      {history.length>0&&<details><summary>{tr("Frühere Importe","الاستيرادات السابقة")}</summary>{history.map(item=><button type="button" className="plain-button" key={item.id} disabled={pending} onClick={()=>void run(async()=>{rememberJob(item.id);await resume(item.id);})}>{item.fileName} · {item.state==="committed"?text.receipt:tr("Fortsetzen","استكمال")}</button>)}</details>}
      <p>{text.instructions}</p>
      <div className="header-actions">
        <a className="plain-button" href="/templates/family-import-groups.csv" download>CSV · {locale==="ar"?"قالب":"Vorlage"}</a>
        <a className="plain-button" href="/templates/family-import.xlsx" download>XLSX · {locale==="ar"?"قالب":"Vorlage"}</a>
      </div>
      <form className="auth-form" onSubmit={upload}>
        <p>{text.file} · 2.5 MB max.</p><input ref={fileInput} type="file" hidden accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={event=>setFile(event.target.files?.[0])}/>
        <button type="button" className="plain-button" disabled={pending} onClick={()=>fileInput.current?.click()}>{file?.name??tr("Datei auswählen","اختيار الملف")}</button>
        <button disabled={pending || !file} className="primary-button">{text.upload}</button>
      </form>
    </section>}
    {stage===2&&inspection && !receipt && <section className="auth-card">
      <h2>{text.mapping}</h2>
      <p><bdi>{inspection.fileName}</bdi></p>
      <form className="auth-form" onSubmit={map}>
        {inspection.worksheets.length > 0 && <label>{text.worksheet}
          <select value={inspection.worksheet ?? ""} disabled={pending} onChange={(event) =>
            void run(() => inspect(inspection.id, { worksheet: event.target.value }))}>
            {inspection.worksheets.map((sheet) => <option key={sheet} value={sheet}>{sheet}</option>)}
          </select>
        </label>}
        {inspection.delimiter && <label>{text.delimiter}
          <select value={inspection.delimiter} disabled={pending} onChange={(event) =>
            void run(() => inspect(inspection.id, { delimiter: event.target.value }))}>
            {[",",";","\t"].map((delimiter) => <option key={delimiter} value={delimiter}>{delimiter === "\t" ? "TAB" : delimiter}</option>)}
          </select>
        </label>}
        {fields.map((column) => <label key={column}>{text[column]}
          <select required={!optional.has(column)} value={mapping[column] ?? ""}
            onChange={(event) => {
              const value = event.target.value;
              setMapping({ ...mapping, [column]: value ? Number(value) : undefined });
              setPreview(undefined);
            }}>
            <option value="">{text.noColumn}</option>
            {inspection.columns.map(({ index, label }) => <option key={index} value={index}>{index} · {label}</option>)}
          </select>
        </label>)}
        <button disabled={pending} className="plain-button">{text.map}</button>
      </form>
    </section>}
    {stage===3&&preview && !receipt && <section className="auth-card">
      <h2>{text.review}</h2>
      <dl className="family-import-counts">{Object.entries(preview.counts).map(([key,value])=><div key={key}><dt>{text[key as keyof typeof preview.counts]}</dt><dd>{value}</dd></div>)}</dl>
      <label>{tr("Status filtern","تصفية الحالة")}<select value={filter} onChange={e=>{setFilter(e.target.value);setLimit(40);}}><option value="all">{tr("Alle","الكل")}</option>{Object.keys(preview.counts).map(key=><option key={key} value={key}>{text[key as keyof typeof preview.counts]}</option>)}</select></label>
      <ol className="group-list">
        {rows.slice(0, limit).map((row) => <ImportRow key={row.rowNo} locale={locale} row={row} busy={pending} save={decide} />)}
      </ol>
      {rows.length > limit && <button className="plain-button" onClick={() => setLimit(limit + 40)}>{text.next}</button>}
      <label className="family-import-confirm"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>{tr("Ich habe die Verknüpfungen geprüft.","راجعت روابط الطلاب وأولياء الأمور.")}</label>
      <div className="family-import-review-actions"><button className="plain-button" disabled={pending} onClick={()=>setStage(2)}>{tr("Zuordnung bearbeiten","تعديل الأعمدة")}</button>
      <button className="primary-button" disabled={!confirmed || pending || Boolean(preview.counts.conflict || preview.counts.revoked)
        || preview.counts.new + preview.counts.existing === 0}
        onClick={() => void run(async () => {setReceipt(await command(`${base}/${preview.id}/commit`, "POST", { reviewedRevision: preview.revision }, importReceiptSchema));setStage(4);})}>{text.commit}</button></div>
    </section>}
    {stage===4&&receipt && <section className="auth-card">
      <h2>{text.receipt}</h2>
      <dl className="family-import-receipt"><div><dt>{text.rows}</dt><dd>{receipt.rowsCommitted}</dd></div>
        <div><dt>{text.links}</dt><dd>{receipt.linksCreated}</dd></div>
        <div><dt>{text.eligible}</dt><dd>{receipt.eligibleGuardians}</dd></div></dl>
      <p>{text.sendNotice}</p>
      {receipt.eligibleGuardians > 0 && <Link className="plain-button" href={`/${locale}/school/students?batchId=${receipt.id}`}>{text.eligible}</Link>}
    </section>}
    {stage>1&&<button type="button" className="plain-button" disabled={pending} onClick={()=>{rememberJob();setStage(1);setFile(undefined);setInspection(undefined);setPreview(undefined);setReceipt(undefined);setConfirmed(false);void requestApi(base,importVersionSchema.array()).then(({data})=>setHistory(data)).catch(()=>{});}}>{tr("Neuer Import","استيراد جديد")}</button>}
    {pending && <p role="status">{translated.pending}</p>}
    {error && <p role="alert" className="notice">{error}</p>}
  </div>;
}

function ImportRow({ locale, row, busy, save }: { locale: Locale; row: Review; busy: boolean; save: (edit: Edit) => void }) {
  const text = copy[locale];
  const [choice, setChoice] = useState<Decision>("approve");
  const [criteria, setCriteria] = useState("");
  const [matches, setMatches] = useState<z.infer<typeof lookup>>([]);
  const [matchedId, setMatchedId] = useState("");
  const [payer, setPayer] = useState("");
  const [failure, setFailure] = useState("");
  const expectsMatch = choice === "match_guardian" || choice === "match_student";
  return <li className="import-row">
    <p>{text.row} {row.rowNo} · {text[row.disposition]}</p>
    {row.display && <p>{row.display.familyName&&<><bdi>{row.display.familyName}</bdi> · </>}<bdi>{row.display.childName}</bdi> · <bdi>{row.display.guardianName}</bdi></p>}
    {row.reason && <p>{text[row.reason]}{row.column && <> · {text.column} <bdi>{text[row.column as keyof typeof importColumns.shape] ?? row.column}</bdi></>}</p>}
    <details>
      <summary>{text.decision}{row.decision && <> · {text[row.decision]}</>}</summary>
      <div className="auth-form">
        <label>{text.decision}<select value={choice} onChange={(event) => {
          setChoice(event.target.value as Decision); setMatches([]); setMatchedId("");
        }}>
          <option value="approve">{text.approve}</option>
          <option value="skip">{text.skip}</option>
          {row.disposition === "revoked" && <option value="restore">{text.restore}</option>}
          {row.display && <><option value="match_guardian">{text.match_guardian}</option><option value="match_student">{text.match_student}</option></>}
        </select></label>
        {expectsMatch && <>
          <label>{text.find}<input value={criteria} onChange={(event) => setCriteria(event.target.value)} /></label>
          <button className="plain-button" onClick={() => {
            setFailure("");
            void requestApi(`/school/${choice === "match_guardian" ? "guardians" : "students"}?query=${encodeURIComponent(criteria)}`, lookup)
              .then(({ data }) => setMatches(data)).catch(() => setFailure(dictionary(locale)["error.unavailable"]));
          }}>{text.find}</button>
          <select aria-label={text[choice]} value={matchedId} onChange={(event) => setMatchedId(event.target.value)}>
            <option value="">{text[choice]}</option>
            {matches.map((item) => <option value={item.id} key={item.id}>{item.displayName}{"studentNumber" in item ? ` · ${item.studentNumber}` : ""}</option>)}
          </select>
        </>}
        {row.display && <label>{text.payer}<select value={payer} onChange={(event) => setPayer(event.target.value)}>
          <option value="">{text.keep}</option><option value="yes">{text.yes}</option><option value="no">{text.no}</option>
        </select></label>}
        {failure && <p role="alert">{failure}</p>}
        <button className="plain-button" disabled={busy || expectsMatch && !matchedId} onClick={() =>
          save({ rowNo: row.rowNo, decision: choice, ...(expectsMatch && { matchedId }),
            ...(payer !== "" && { payerCandidate: payer === "yes" }) })}>{text.save}</button>
      </div>
    </details>
  </li>;
}
