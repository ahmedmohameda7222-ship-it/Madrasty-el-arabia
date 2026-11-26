// The recorder writes canonical 16-bit mono PCM WAV. No network or audio decoding is needed.
export function voiceWaveform(buffer:ArrayBuffer,barCount=40){
  const view=new DataView(buffer);
  const mark=(at:number,word:string)=>[...word].every((letter,i)=>view.getUint8(at+i)===letter.charCodeAt(0));
  if(view.byteLength<46||!mark(0,"RIFF")||!mark(8,"WAVE")||!mark(12,"fmt ")||!mark(36,"data")||
    view.getUint16(20,true)!==1||view.getUint16(22,true)!==1||view.getUint16(34,true)!==16)return undefined;
  const rate=view.getUint32(24,true),bytes=view.getUint32(40,true);
  if(!rate||bytes%2||bytes>view.byteLength-44||!bytes)return undefined;
  const count=bytes/2,bars=Array.from({length:Math.min(count,Math.max(1,Math.floor(barCount)))},()=>0);
  for(let i=0;i<count;i++){
    const bin=Math.min(bars.length-1,Math.floor(i*bars.length/count));
    bars[bin]=Math.max(bars[bin],Math.abs(view.getInt16(44+i*2,true))/32768);
  }
  return {bars,duration:count/rate};
}
export function voiceTime(seconds:number){
  const total=Math.max(0,Math.floor(seconds));
  return Math.floor(total/60)+":"+String(total%60).padStart(2,"0");
}
