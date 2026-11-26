"use client";
import {useEffect,useState} from "react";
import {voiceTime,voiceWaveform} from "./voice-waveform";
export function VoiceDraftPreview({file,src,label}:{file:Blob;src:string;label:string}){
  const [wave,setWave]=useState<ReturnType<typeof voiceWaveform>>();
  const [position,setPosition]=useState(0);
  useEffect(()=>{
    let current=true;setWave(undefined);setPosition(0);
    void file.arrayBuffer().then(buffer=>{if(current)setWave(voiceWaveform(buffer));}).catch(()=>undefined);
    return ()=>{current=false;};
  },[file]);
  return <div className="chat-voice-preview">
    {wave&&<><div className="chat-voice-wave" dir="ltr" aria-hidden="true">
      {wave.bars.map((bar,i)=><span key={i} data-played={i/wave.bars.length<position/wave.duration} style={{height:Math.max(3,bar*36)+"px"}}/>)}
    </div><span className="chat-voice-time" dir="ltr">{voiceTime(position)} / {voiceTime(wave.duration)}</span></>}
    <audio controls aria-label={label} src={src} onTimeUpdate={event=>setPosition(event.currentTarget.currentTime)} onEnded={()=>setPosition(0)} style={{maxWidth:"100%"}}/>
  </div>;
}
