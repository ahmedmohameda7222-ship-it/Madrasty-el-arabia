/** Encode full-page JPEG images as a valid multi-page A4 PDF. */
export function financePdfPages(pages:Buffer[],width=1240,height=1754):Buffer {
  if(!pages.length)throw new Error("No document pages");
  const chunks:Buffer[]=[Buffer.from("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n","latin1")];
  const offsets:number[]=[0];let length=chunks[0].length;
  const append=(value:string|Buffer)=>{const part=typeof value==="string"?Buffer.from(value,"ascii"):value;chunks.push(part);length+=part.length;};
  const object=(id:number,body:string|Buffer[])=>{offsets[id]=length;append(id+" 0 obj\n");if(typeof body==="string")append(body);else body.forEach(append);append("\nendobj\n");};
  const kids=pages.map((_,i)=>(3+i*3)+" 0 R").join(" ");
  object(1,"<< /Type /Catalog /Pages 2 0 R >>");
  object(2,"<< /Type /Pages /Count "+pages.length+" /Kids ["+kids+"] >>");
  for(let i=0;i<pages.length;i++){
    const page=3+i*3,image=page+1,content=page+2,jpeg=pages[i];
    object(page,"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Im0 "+image+" 0 R >> >> /Contents "+content+" 0 R >>");
    object(image,[Buffer.from("<< /Type /XObject /Subtype /Image /Width "+width+" /Height "+height+" /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length "+jpeg.length+" >>\nstream\n"),jpeg,Buffer.from("\nendstream")]);
    const commands="q\n595.28 0 0 841.89 0 0 cm\n/Im0 Do\nQ\n";
    object(content,"<< /Length "+Buffer.byteLength(commands)+" >>\nstream\n"+commands+"endstream");
  }
  const xref=length;
  append("xref\n0 "+offsets.length+"\n0000000000 65535 f \n");
  for(let i=1;i<offsets.length;i++)append(String(offsets[i]).padStart(10,"0")+" 00000 n \n");
  append("trailer\n<< /Size "+offsets.length+" /Root 1 0 R >>\nstartxref\n"+xref+"\n%%EOF\n");
  return Buffer.concat(chunks);
}
