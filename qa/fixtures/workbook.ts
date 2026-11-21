import { strToU8, zipSync } from "fflate";

const sheetNamespace = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const officeNamespace = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const packageNamespace = "http://schemas.openxmlformats.org/package/2006/relationships";
const contentNamespace = "http://schemas.openxmlformats.org/package/2006/content-types";

export function familyWorkbook() {
  const titles = ["Child code", "Child name", "Adult code", "Adult name", "Email", "Locale"];
  const values = ["00104", "QA Schüler", "QA-Excel", "QA Guardian", "workbook@madrasty.invalid", "de"];
  const row = (number: number, items: string[]) => `<row r="${number}">${items.map((value, index) => {
    const address = String.fromCharCode(65 + index) + number;
    const cell = number === 3 && index === 0 ? "<v>104</v>"
      : number === 4 && index === 0 ? "<f>1+1</f><v>2</v>"
      : `<is><t>${value}</t></is>`;
    const type = number >= 3 && index === 0 ? "n" : "inlineStr";
    return `<c r="${address}" t="${type}">${cell}</c>`;
  }).join("")}</row>`;
  const contents = {
    "[Content_Types].xml": `<Types xmlns="${contentNamespace}">
      <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
      <Default Extension="xml" ContentType="application/xml"/>
      <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
      <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
      </Types>`,
    "_rels/.rels": `<Relationships xmlns="${packageNamespace}">
      <Relationship Id="rId1" Type="${officeNamespace}/officeDocument" Target="xl/workbook.xml"/>
      </Relationships>`,
    "xl/workbook.xml": `<workbook xmlns="${sheetNamespace}" xmlns:r="${officeNamespace}">
      <sheets><sheet name="Familien" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<Relationships xmlns="${packageNamespace}">
      <Relationship Id="rId1" Type="${officeNamespace}/worksheet" Target="worksheets/sheet1.xml"/>
      </Relationships>`,
    "xl/worksheets/sheet1.xml": `<worksheet xmlns="${sheetNamespace}"><sheetData>
      ${row(1, titles)}${row(2, values)}${row(3, values)}${row(4, values)}</sheetData></worksheet>`,
  };
  return Buffer.from(zipSync(Object.fromEntries(Object.entries(contents).map(([name, contents]) => [name, strToU8(contents)]))));
}
