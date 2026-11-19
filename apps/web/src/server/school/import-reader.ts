import "server-only";
import { posix } from "node:path";
import { parse } from "csv-parse/sync";
import { SaxesParser } from "saxes";
import { fromBuffer, type Entry, type ZipFile } from "yauzl";
import { ApiError } from "@/server/http";

const maxRows = 2_000;
const maxColumns = 64;
const maxCellBytes = 16_384;
const maxZipBytes = 16 * 1024 * 1024;
const maxEntryBytes = 8 * 1024 * 1024;

export type ImportCell = { value: string; kind: "text" | "number" | "formula" };
type SheetRow = { rowNo: number; cells: Map<number, ImportCell> };
export type ParsedImport = {
  worksheets: string[];
  worksheet: string | null;
  delimiter: "," | ";" | "\t" | null;
  columns: { index: number; label: string }[];
  rows: SheetRow[];
};

function invalid(reason = "imports.invalidFile"): never {
  throw new ApiError("validation", { file: reason });
}

function utf8(buffer: Buffer) {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(buffer); }
  catch { return invalid("imports.utf8"); }
}

function packageZip(buffer: Buffer) {
  return new Promise<ZipFile>((resolve, reject) => {
    fromBuffer(buffer, { lazyEntries: true, validateEntrySizes: true, strictFileNames: true, autoClose: false },
      (error, zip) => error ? reject(error) : resolve(zip));
  });
}

function readEntry(zip: ZipFile, entry: Entry) {
  return new Promise<Buffer>((resolve, reject) => {
    zip.openReadStream(entry, (error, stream) => {
      if (error || !stream) { reject(error ?? new Error("ZIP entry missing")); return; }
      const chunks: Buffer[] = [];
      let size = 0;
      stream.on("data", (part: Buffer) => {
        size += part.length;
        if (size > maxEntryBytes) stream.destroy(new Error("ZIP entry too large"));
        else chunks.push(part);
      });
      stream.once("error", reject);
      stream.once("end", () => resolve(Buffer.concat(chunks, size)));
    });
  });
}

async function worksheetsFromZip(buffer: Buffer) {
  const zip = await packageZip(buffer);
  const files = new Map<string, string>();
  try {
    if (zip.entryCount > 256) invalid("imports.workbookSize");
    return await new Promise<Map<string, string>>((resolve, reject) => {
      let total = 0;
      zip.once("error", reject);
      zip.on("entry", (entry: Entry) => {
        void (async () => {
          total += entry.uncompressedSize;
          if (total > maxZipBytes || entry.uncompressedSize > maxEntryBytes ||
              (entry.generalPurposeBitFlag & 1) !== 0) invalid("imports.workbookSize");
          if (/^xl\/(?:externalLinks\/|vbaProject\.bin$|macrosheets\/)/i.test(entry.fileName)) {
            invalid("imports.unsupportedWorkbook");
          }
          if (/^xl\/(?:workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|worksheets\/[\w.-]+\.xml)$/.test(entry.fileName)) {
            if (files.has(entry.fileName)) invalid("imports.unsupportedWorkbook");
            files.set(entry.fileName, utf8(await readEntry(zip, entry)));
          }
          zip.readEntry();
        })().catch(reject);
      });
      zip.once("end", () => resolve(files));
      zip.readEntry();
    });
  } finally {
    zip.close();
  }
}

type Attributes = Record<string, string>;
function xml(payload: string, hooks: {
  open?: (name: string, attributes: Attributes) => void;
  text?: (value: string) => void;
  close?: (name: string) => void;
}) {
  const parser = new SaxesParser({ xmlns: false });
  let depth = 0;
  const justName = (name: string) => name.slice(name.lastIndexOf(":") + 1);
  parser.on("doctype", () => invalid("imports.unsupportedWorkbook"));
  parser.on("error", () => invalid("imports.unsupportedWorkbook"));
  parser.on("opentag", (tag) => {
    if (++depth > 64) invalid("imports.unsupportedWorkbook");
    hooks.open?.(justName(tag.name), tag.attributes);
  });
  parser.on("text", (value) => hooks.text?.(value));
  parser.on("cdata", () => invalid("imports.unsupportedWorkbook"));
  parser.on("closetag", (tag) => { hooks.close?.(justName(tag.name)); depth--; });
  parser.write(payload).close();
}

function sharedStrings(file: string | undefined) {
  if (!file) return [];
  const entries: string[] = [];
  let item: string | undefined;
  let inText = false;
  let phonetic = false;
  xml(file, {
    open(name) {
      if (name === "si") item = "";
      if (name === "rPh") phonetic = true;
      if (name === "t" && !phonetic) inText = true;
    },
    text(value) {
      if (item !== undefined && inText) {
        item += value;
        if (item.length > maxCellBytes) invalid("imports.cellSize");
      }
    },
    close(name) {
      if (name === "t") inText = false;
      if (name === "rPh") phonetic = false;
      if (name === "si") {
        entries.push(item ?? "");
        item = undefined;
        if (entries.length > maxRows * maxColumns) invalid("imports.workbookSize");
      }
    },
  });
  return entries;
}

function xlsxRows(file: string, strings: string[]) {
  const rows: SheetRow[] = [];
  let row: SheetRow | undefined;
  let cell: { index: number; type: string; value: string; formula: boolean } | undefined;
  let expectedRow = 0;
  let inValue = false;
  xml(file, {
    open(name, attributes) {
      if (name === "row") {
        const rowNo = Number(attributes.r ?? (expectedRow + 1));
        if (!Number.isInteger(rowNo) || rowNo < 1 || rowNo <= expectedRow || rowNo > 1_048_576) invalid();
        expectedRow = rowNo;
        row = { rowNo, cells: new Map() };
      }
      if (name === "c" && row) {
        const ref = /^([A-Z]{1,3})([1-9]\d*)$/.exec(attributes.r ?? "");
        if (!ref || Number(ref[2]) !== row.rowNo) invalid();
        const index = [...ref[1]].reduce((current, letter) => current * 26 + letter.charCodeAt(0) - 64, 0);
        cell = { index, type: attributes.t ?? "n", value: "", formula: false };
      }
      if (name === "f" && cell) cell.formula = true;
      if (name === "v" || (name === "t" && cell?.type === "inlineStr")) inValue = true;
    },
    text(value) {
      if (cell && inValue) {
        cell.value += value;
        if (cell.value.length > maxCellBytes) invalid("imports.cellSize");
      }
    },
    close(name) {
      if (name === "v" || name === "t") inValue = false;
      if (name === "c" && cell && row) {
        let value = cell.value;
        if (cell.type === "s" && value !== "") {
          const index = Number(value);
          if (!/^\d+$/.test(value) || !Number.isSafeInteger(index) || index >= strings.length) invalid();
          value = strings[index];
        }
        if (value !== "" || cell.formula) {
          if (cell.index > maxColumns || row.cells.has(cell.index)) invalid("imports.columns");
          row.cells.set(cell.index, { value, kind: cell.formula ? "formula" : cell.type === "n" ? "number" : "text" });
        }
        cell = undefined;
      }
      if (name === "row" && row) {
        if (row.cells.size) rows.push(row);
        if (rows.length > maxRows + 1) invalid("imports.rows");
        row = undefined;
      }
    },
  });
  return rows;
}

async function readExcel(buffer: Buffer, requested?: string) {
  const files = await worksheetsFromZip(buffer);
  const workbook = files.get("xl/workbook.xml");
  const relationships = files.get("xl/_rels/workbook.xml.rels");
  if (!workbook || !relationships) invalid("imports.unsupportedWorkbook");

  const sheetTargets = new Map<string, string>();
  xml(relationships, { open(name, attrs) {
    if (name !== "Relationship" || !attrs.Type?.endsWith("/worksheet")) return;
    if (!attrs.Id || !attrs.Target || attrs.TargetMode === "External") invalid("imports.unsupportedWorkbook");
    const target = attrs.Target.startsWith("/") ? attrs.Target.slice(1) : posix.join("xl", attrs.Target);
    if (!/^xl\/worksheets\/[\w.-]+\.xml$/.test(target)) invalid("imports.unsupportedWorkbook");
    sheetTargets.set(attrs.Id, target);
  } });
  const sheets = new Map<string, string>();
  xml(workbook, { open(name, attrs) {
    if (name !== "sheet" || (attrs.state && attrs.state !== "visible")) return;
    const target = sheetTargets.get(attrs["r:id"]);
    if (!target || !attrs.name || sheets.has(attrs.name)) invalid("imports.unsupportedWorkbook");
    sheets.set(attrs.name, target);
  } });
  if (!sheets.size || sheets.size > 24) invalid("imports.unsupportedWorkbook");
  const worksheet = requested ?? [...sheets.keys()][0];
  const target = sheets.get(worksheet);
  const content = target && files.get(target);
  if (!content) invalid("imports.worksheet");
  return { worksheets: [...sheets.keys()], worksheet, delimiter: null, rows: xlsxRows(content, sharedStrings(files.get("xl/sharedStrings.xml"))) };
}

type Delimiter = "," | ";" | "\t";
function determineDelimiter(source: string): Delimiter {
  const candidates = [",", ";", "\t"] as const;
  const scored = candidates.map((delimiter) => {
    try {
      const first = parse(source, { delimiter, to: 1, skip_empty_lines: true, max_record_size: 64 * 1024 }) as string[][];
      return { delimiter, width: first[0]?.length ?? 0 };
    } catch { return { delimiter, width: 0 }; }
  }).sort((a, b) => b.width - a.width);
  return scored[0].delimiter;
}

function readCsv(buffer: Buffer, requested?: Delimiter) {
  const source = utf8(buffer);
  const delimiter = requested ?? determineDelimiter(source);
  let records: { record: string[]; info: { lines: number } }[];
  try {
    records = parse(source, {
      delimiter, bom: true, skip_empty_lines: true, relax_column_count_less: true,
      max_record_size: 64 * 1024, info: true, to: maxRows + 2,
    }) as unknown as typeof records;
  } catch { return invalid("imports.csvLayout"); }
  if (records.length > maxRows + 1) invalid("imports.rows");
  const rows = records.map(({ record, info }) => {
    if (record.length > maxColumns || record.some((cell) => cell.length > maxCellBytes)) invalid("imports.columns");
    const cells = new Map<number, ImportCell>();
    record.forEach((value, index) => { if (value !== "") cells.set(index + 1, { value, kind: "text" }); });
    return { rowNo: info.lines, cells };
  }).filter(({ cells }) => cells.size > 0);
  return { worksheets: [], worksheet: null, delimiter, rows };
}

export async function parseFamilyFile(
  buffer: Buffer, mime: string, options: { worksheet?: string; delimiter?: Delimiter } = {},
): Promise<ParsedImport> {
  try {
    const parsed = mime === "text/csv" ? readCsv(buffer, options.delimiter) : await readExcel(buffer, options.worksheet);
    const [header, ...rows] = parsed.rows;
    if (!header || header.cells.size < 2 || header.cells.size > maxColumns) invalid("imports.headers");
    const columns = [...header.cells].map(([index, cell]) => {
      if (cell.kind === "formula" || !cell.value.trim() || cell.value.length > 180) invalid("imports.headers");
      return { index, label: cell.value.trim() };
    }).sort((a, b) => a.index - b.index);
    return { ...parsed, columns, rows };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    return invalid();
  }
}
