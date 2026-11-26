package de.madrasty.app.comms
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.abs

internal data class VoiceWaveform(val bars:FloatArray,val duration:Double)
internal fun voiceWaveform(bytes:ByteArray,barCount:Int=40):VoiceWaveform?{
    if(bytes.size<46)return null
    val view=ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
    fun mark(at:Int,word:String)=word.indices.all{bytes[at+it].toInt()==word[it].code}
    if(!mark(0,"RIFF")||!mark(8,"WAVE")||!mark(12,"fmt ")||!mark(36,"data")||
        view.getShort(20).toInt()!=1||view.getShort(22).toInt()!=1||view.getShort(34).toInt()!=16)return null
    val rate=view.getInt(24)
    val length=view.getInt(40)
    if(rate<=0||length<=0||length%2!=0||length>bytes.size-44)return null
    val count=length/2
    val bars=FloatArray(minOf(count,maxOf(1,barCount)))
    for(i in 0 until count){
        val bin=minOf(bars.lastIndex,(i.toLong()*bars.size/count).toInt())
        bars[bin]=maxOf(bars[bin],abs(view.getShort(44+i*2).toInt())/32768f)
    }
    return VoiceWaveform(bars,count.toDouble()/rate)
}
internal fun voiceTime(seconds:Double):String{
    val total=seconds.toInt().coerceAtLeast(0)
    return "${total/60}:${(total%60).toString().padStart(2,'0')}"
}
