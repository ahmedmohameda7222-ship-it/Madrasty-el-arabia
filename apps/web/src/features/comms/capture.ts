import {photoLimit,voiceMaxMilliseconds,voiceSampleRate} from "@madrasty/contracts";

export async function convertPhoto(file:File){
  if(!file.size||file.size>40*1024*1024)throw new Error("photo size");
  const url=URL.createObjectURL(file);
  try{
    const image=new Image();
    image.src=url;
    await image.decode();
    if(!image.naturalWidth||!image.naturalHeight||image.naturalWidth*image.naturalHeight>80_000_000)throw new Error("photo dimensions");
    const factor=Math.min(1,2560/Math.max(image.naturalWidth,image.naturalHeight));
    const canvas=document.createElement("canvas");
    canvas.width=Math.max(1,Math.round(image.naturalWidth*factor));
    canvas.height=Math.max(1,Math.round(image.naturalHeight*factor));
    const graphics=canvas.getContext("2d",{alpha:false});
    if(!graphics)throw new Error("photo conversion");
    graphics.fillStyle="white";
    graphics.fillRect(0,0,canvas.width,canvas.height);
    graphics.drawImage(image,0,0,canvas.width,canvas.height);
    const jpeg=await new Promise<Blob|null>((resolve)=>canvas.toBlob(resolve,"image/jpeg",0.9));
    if(!jpeg||jpeg.size>photoLimit)throw new Error("photo format");
    return jpeg;
  }finally{URL.revokeObjectURL(url);}
}

function encodeVoice(frames:Float32Array[],count:number,rate:number){
  const seconds=voiceMaxMilliseconds/1000;
  const length=Math.min(seconds*voiceSampleRate,Math.floor(count*voiceSampleRate/rate));
  if(!length)throw new Error("empty recording");
  const samples=new Float32Array(count);
  let offset=0;
  for(const frame of frames){samples.set(frame,offset);offset+=frame.length;}
  const buffer=new ArrayBuffer(44+length*2),wav=new DataView(buffer);
  const mark=(offset:number,value:string)=>[...value].forEach((letter,index)=>wav.setUint8(offset+index,letter.charCodeAt(0)));
  mark(0,"RIFF");wav.setUint32(4,buffer.byteLength-8,true);mark(8,"WAVE");
  mark(12,"fmt ");wav.setUint32(16,16,true);wav.setUint16(20,1,true);wav.setUint16(22,1,true);
  wav.setUint32(24,voiceSampleRate,true);wav.setUint32(28,voiceSampleRate*2,true);
  wav.setUint16(32,2,true);wav.setUint16(34,16,true);mark(36,"data");wav.setUint32(40,length*2,true);
  const step=rate/voiceSampleRate;
  for(let index=0;index<length;index++){
    const from=Math.floor(index*step),until=Math.max(from+1,Math.floor((index+1)*step));
    let total=0;
    for(let sample=from;sample<until;sample++)total+=samples[sample];
    const value=Math.max(-1,Math.min(1,total/(until-from)));
    wav.setInt16(44+index*2,Math.round(value*(value<0?32768:32767)),true);
  }
  return new Blob([buffer],{type:"audio/wav"});
}

export function voiceCapture(onLimit:()=>void){
  if(!window.AudioContext||!navigator.mediaDevices?.getUserMedia)throw new Error("recording unavailable");
  const context=new AudioContext();
  let stream:MediaStream|undefined,worklet:AudioWorkletNode|undefined,source:MediaStreamAudioSourceNode|undefined;
  let stopped=false,limitReached=false,count=0,flush:(()=>void)|undefined;
  let frames:Float32Array[]=[];
  const limit=Math.floor(context.sampleRate*voiceMaxMilliseconds/1000);
  const close=()=>{
    if(stopped)return;
    stopped=true;
    stream?.getTracks().forEach((track)=>track.stop());
    source?.disconnect();
    worklet?.disconnect();
    worklet?.port.close();
    frames=[];
    flush?.();
    void context.close().catch(()=>undefined);
  };
  const start=async()=>{
    const resume=context.resume();
    void resume.catch(()=>undefined);
    try{
      const microphone=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1},video:false});
      if(stopped){microphone.getTracks().forEach((track)=>track.stop());return;}
      stream=microphone;
      await context.audioWorklet.addModule("/media/voice-capture.js");
      await resume;
      if(stopped)return;
      source=context.createMediaStreamSource(stream);
      worklet=new AudioWorkletNode(context,"madrasty-voice",{channelCount:1,channelCountMode:"explicit"});
      const mute=context.createGain();
      mute.gain.value=0;
      worklet.port.onmessage=({data})=>{
        if(stopped)return;
        if(data==="finished"){flush?.();return;}
        if(!(data instanceof Float32Array)||limitReached)return;
        const frame=data.length>limit-count?data.slice(0,limit-count):data;
        frames.push(frame);count+=frame.length;
        if(count>=limit){limitReached=true;onLimit();}
      };
      source.connect(worklet).connect(mute).connect(context.destination);
    }catch(error){close();throw error;}
  };
  const finish=async()=>{
    if(!worklet||stopped)throw new Error("recording unavailable");
    if(!limitReached){
      await new Promise<void>((resolve)=>{
        const timer=window.setTimeout(()=>resolve(),300);
        flush=()=>{window.clearTimeout(timer);resolve();};
        worklet?.port.postMessage("finish");
      });
    }
    if(stopped)throw new Error("recording cancelled");
    try{return encodeVoice(frames,count,context.sampleRate);}
    finally{close();}
  };
  return {start,finish,close};
}
