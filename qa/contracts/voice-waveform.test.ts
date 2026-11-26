import assert from "node:assert/strict";
import {test} from "node:test";
import {voiceWaveform,voiceTime} from "../../apps/web/src/features/comms/voice-waveform";
test("voice waveform represents actual PCM peaks and exact duration",()=>{
  const buffer=new ArrayBuffer(52),view=new DataView(buffer);
  for(const [offset,label] of [[0,"RIFF"],[8,"WAVE"],[12,"fmt "],[36,"data"]] as const)
    [...label].forEach((letter,index)=>view.setUint8(offset+index,letter.charCodeAt(0)));
  view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint16(34,16,true);
  view.setUint32(24,2,true);view.setUint32(40,8,true);
  [0,16384,-32768,8192].forEach((value,i)=>view.setInt16(44+i*2,value,true));
  assert.deepEqual(voiceWaveform(buffer,2),{bars:[.5,1],duration:2});
  assert.equal(voiceTime(65.8),"1:05");
  view.setUint32(40,100,true);assert.equal(voiceWaveform(buffer),undefined);
});
