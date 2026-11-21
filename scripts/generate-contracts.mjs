import {mkdir,readFile,writeFile} from "node:fs/promises";
import {parse} from "yaml";

const contract=parse(await readFile(new URL("../packages/contracts/openapi.yaml",import.meta.url),"utf8"));
const schemas=contract.components.schemas;
const models=contract["x-madrasty-generated-models"];
const operations=contract["x-madrasty-generated-operations"];
const operationsByName=new Map();
const sourceMessage="Generated from packages/contracts/openapi.yaml by pnpm generate:contracts.";

for(const [path,methods] of Object.entries(contract.paths)){
  for(const method of ["get","post","put","patch","delete","head","options"]){
    const name=methods[method]?.operationId;
    if(!name)continue;
    if(operationsByName.has(name))throw new Error("Duplicate operationId "+name);
    operationsByName.set(name,{path,method:method.toUpperCase()});
  }
}

const modelName=(shape)=>shape.$ref?.split("/").at(-1);
const propertyTypes={
  string:["string","String","getString"],integer:["number","Long","getLong"],boolean:["boolean","Boolean","getBoolean"],
};
function property(shape){
  const name=modelName(shape);
  if(name&&models.includes(name))return {ts:name,kt:name,decode:(key)=>`${name}.fromWire(value.getString(${JSON.stringify(key)}))`};
  const types=propertyTypes[shape.type];
  if(!types)throw new Error("Unsupported generated property "+JSON.stringify(shape));
  return {ts:types[0],kt:types[1],decode:(key)=>`value.${types[2]}(${JSON.stringify(key)})`};
}
const typescript=[`// ${sourceMessage}`];
const kotlin=[`// ${sourceMessage}`,"package de.madrasty.app.navigation","","import org.json.JSONObject",""];

for(const name of models){
  const schema=schemas[name];
  if(!schema)throw new Error("Missing schema "+name);
  if(Array.isArray(schema.enum)){
    typescript.push(`export const ${name[0].toLowerCase()+name.slice(1)}Values=${JSON.stringify(schema.enum)} as const;`,
      `export type ${name}=typeof ${name[0].toLowerCase()+name.slice(1)}Values[number];`,"");
    kotlin.push(`internal enum class ${name}(val wire: String) {`,
      "    "+schema.enum.map((one)=>`${one.toUpperCase()}(${JSON.stringify(one)})`).join(",\n    ")+";","",
      "    companion object {","        fun fromWire(wire: String) = entries.first { it.wire == wire }","    }","}","");
    continue;
  }
  if(schema.type!=="object")throw new Error("Unsupported model "+name);
  const fields=Object.entries(schema.properties).map(([key,shape])=>({key,...property(shape),optional:!schema.required?.includes(key)}));
  typescript.push(`export interface ${name} {`,
    ...fields.map(({key,ts,optional})=>`  ${key}${optional?"?":""}: ${ts};`),"}","");
  kotlin.push(`internal data class ${name}(`,
    ...fields.map(({key,kt,optional})=>`    val ${key}: ${kt}${optional?"? = null":""},`),") {","    companion object {",
    `        fun fromJson(value: JSONObject): ${name} = ${name}(`,
    ...fields.map(({key,decode,optional})=>`            ${key} = ${optional?`if (value.isNull(${JSON.stringify(key)})) null else `:""}${decode(key)},`),
    "        )","    }","}","");
}
const selected=Object.fromEntries(operations.map((name)=>{
  const operation=operationsByName.get(name);
  if(!operation)throw new Error("Missing operation "+name);
  return [name,operation];
}));
typescript.push(`export const schoolOperations = ${JSON.stringify(selected,null,2)} as const;`,"");
kotlin.push("internal object SchoolOperations {",
  ...Object.entries(selected).map(([name,{path}])=>`    const val ${name} = ${JSON.stringify(path)}`),"}","");
await writeFile(new URL("../packages/contracts/src/generated.ts",import.meta.url),typescript.join("\n"));
const androidDirectory=new URL("../apps/android/app/src/main/java/de/madrasty/app/navigation/",import.meta.url);
await mkdir(androidDirectory,{recursive:true});
await writeFile(new URL("GeneratedSchoolContract.kt",androidDirectory),kotlin.join("\n"));
console.log(`Generated ${models.length} models from OpenAPI and indexed ${operationsByName.size} operations.`);
