import "server-only";
import sharp from "sharp";
import { photoLimit,voiceLimit,voiceMaxMilliseconds,voiceSampleRate } from "@madrasty/contracts";
import { ApiError } from "@/server/http";

export async function readBoundedMedia(response:Response,bytes:number,limit:number){
  const length=response.headers.get("content-length");
  if(length!==null&&Number(length)!==bytes)throw new ApiError("validation");
  if(!response.body||bytes>limit)throw new ApiError("validation");
  const reader=response.body.getReader();
  const parts:Uint8Array[]=[];
  let received=0;
  try{
    for(;;){
      const {done,value}=await reader.read();
      if(done)break;
      received+=value.byteLength;
      if(received>bytes||received>limit)throw new ApiError("validation");
      parts.push(value);
    }
    if(received!==bytes)throw new ApiError("validation");
    return Buffer.concat(parts,received);
  }finally{
    await reader.cancel().catch(()=>undefined);
    reader.releaseLock();
  }
}

export async function cleanPhoto(raw:Buffer){
  if(raw.length<4||raw[0]!==255||raw[1]!==216||raw[2]!==255)throw new ApiError("validation");
  try{
    const image=sharp(raw,{limitInputPixels:32_000_000,autoOrient:true,failOn:"warning"});
    const metadata=await image.metadata();
    if(metadata.format!=="jpeg"||!metadata.width||!metadata.height)throw new ApiError("validation");
    const buffer=await image.resize({width:2560,height:2560,fit:"inside",withoutEnlargement:true}).jpeg({quality:86}).toBuffer();
    if(buffer.length>photoLimit)throw new ApiError("validation");
    return {buffer,duration:null};
  }catch{throw new ApiError("validation");}
}

export function cleanVoice(raw:Buffer){
  const text=(from:number,to:number)=>raw.toString("ascii",from,to);
  const sampleBytes=2,bytesPerSecond=voiceSampleRate*sampleBytes,dataSize=raw.length-44;
  // Capture uploads canonical mono PCM. Checking the header and the exact frame count validates the decoded duration.
  if(raw.length<46||raw.length>voiceLimit||text(0,4)!=="RIFF"||raw.readUInt32LE(4)!==raw.length-8||
    text(8,12)!=="WAVE"||text(12,16)!=="fmt "||raw.readUInt32LE(16)!==16||raw.readUInt16LE(20)!==1||
    raw.readUInt16LE(22)!==1||raw.readUInt32LE(24)!==voiceSampleRate||raw.readUInt32LE(28)!==bytesPerSecond||
    raw.readUInt16LE(32)!==sampleBytes||raw.readUInt16LE(34)!==16||text(36,40)!=="data"||raw.readUInt32LE(40)!==dataSize||
    dataSize%sampleBytes!==0)throw new ApiError("validation");
  const duration=Math.ceil(dataSize*1000/bytesPerSecond);
  if(duration>voiceMaxMilliseconds)throw new ApiError("validation");
  // The validated format admits exactly one sample chunk, with no place for metadata.
  return {buffer:raw,duration};
}
