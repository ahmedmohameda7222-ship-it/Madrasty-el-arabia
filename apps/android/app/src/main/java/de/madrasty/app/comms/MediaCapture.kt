package de.madrasty.app.comms

import android.annotation.SuppressLint
import android.content.ContentResolver
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageDecoder
import android.graphics.Matrix
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.ExifInterface
import android.media.MediaRecorder
import android.net.Uri
import android.os.Build
import kotlinx.coroutines.delay
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.runInterruptible
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.atomic.AtomicBoolean

internal const val PHOTO_LIMIT=10*1024*1024
internal const val VOICE_LIMIT=8*1024*1024
internal const val VOICE_SECONDS=180
private const val PHOTO_SOURCE_LIMIT=40*1024*1024
private const val SAMPLE_RATE=16000
private const val MAX_SIDE=2560

internal suspend fun convertChatPhoto(resolver:ContentResolver,uri:Uri):ByteArray=runInterruptible(Dispatchers.IO){
    val input=resolver.openInputStream(uri)?:throw IOException("Photo unavailable")
    val original=input.use{stream->
        val bytes=ByteArrayOutputStream()
        val chunk=ByteArray(65536)
        while(true){
            if(Thread.interrupted())throw InterruptedException()
            val count=stream.read(chunk)
            if(count<0)break
            if(bytes.size()+count>PHOTO_SOURCE_LIMIT)throw IOException("Photo size")
            bytes.write(chunk,0,count)
        }
        bytes.toByteArray()
    }
    val picture=if(Build.VERSION.SDK_INT>=28){
        ImageDecoder.decodeBitmap(ImageDecoder.createSource(ByteBuffer.wrap(original))){ decoder,info,_->
            val width=info.size.width
            val height=info.size.height
            requirePhotoSize(width,height)
            val scale=minOf(1.0,MAX_SIDE.toDouble()/maxOf(width,height))
            decoder.setTargetSize(maxOf(1,(width*scale).toInt()),maxOf(1,(height*scale).toInt()))
            decoder.allocator=ImageDecoder.ALLOCATOR_SOFTWARE
        }
    }else{
        val options=BitmapFactory.Options().apply{inJustDecodeBounds=true}
        BitmapFactory.decodeByteArray(original,0,original.size,options)
        requirePhotoSize(options.outWidth,options.outHeight)
        options.inJustDecodeBounds=false
        options.inSampleSize=1
        while(maxOf(options.outWidth,options.outHeight)/options.inSampleSize>MAX_SIDE*2)options.inSampleSize*=2
        val decoded=BitmapFactory.decodeByteArray(original,0,original.size,options)?:throw IOException("Photo format")
        resizeLegacyPhoto(decoded,original)
    }
    try{
        val output=ByteArrayOutputStream()
        if(!picture.compress(Bitmap.CompressFormat.JPEG,90,output)||output.size() !in 1..PHOTO_LIMIT)throw IOException("Photo output")
        output.toByteArray()
    }finally{picture.recycle()}
}

private fun requirePhotoSize(width:Int,height:Int){
    if(width<1||height<1||width.toLong()*height>80_000_000)throw IOException("Photo dimensions")
}

private fun resizeLegacyPhoto(bitmap:Bitmap,original:ByteArray):Bitmap{
    val orientation=runCatching{
        ExifInterface(ByteArrayInputStream(original)).getAttributeInt(ExifInterface.TAG_ORIENTATION,ExifInterface.ORIENTATION_NORMAL)
    }.getOrDefault(ExifInterface.ORIENTATION_NORMAL)
    val transform=Matrix()
    val scale=minOf(1f,MAX_SIDE.toFloat()/maxOf(bitmap.width,bitmap.height))
    transform.postScale(scale,scale)
    when(orientation){
        ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> transform.postScale(-1f,1f)
        ExifInterface.ORIENTATION_ROTATE_180 -> transform.postRotate(180f)
        ExifInterface.ORIENTATION_FLIP_VERTICAL -> transform.postScale(1f,-1f)
        ExifInterface.ORIENTATION_TRANSPOSE -> {transform.postRotate(90f);transform.postScale(-1f,1f)}
        ExifInterface.ORIENTATION_ROTATE_90 -> transform.postRotate(90f)
        ExifInterface.ORIENTATION_TRANSVERSE -> {transform.postRotate(-90f);transform.postScale(-1f,1f)}
        ExifInterface.ORIENTATION_ROTATE_270 -> transform.postRotate(-90f)
    }
    return Bitmap.createBitmap(bitmap,0,0,bitmap.width,bitmap.height,transform,true).also{if(it!==bitmap)bitmap.recycle()}
}

@SuppressLint("MissingPermission")
internal suspend fun captureChatVoice(stopping:AtomicBoolean,elapsed:suspend (Int)->Unit):ByteArray=withContext(Dispatchers.IO){
    val channels=AudioFormat.CHANNEL_IN_MONO
    val encoding=AudioFormat.ENCODING_PCM_16BIT
    val minimum=AudioRecord.getMinBufferSize(SAMPLE_RATE,channels,encoding)
    if(minimum<=0)throw IOException("Microphone unavailable")
    val device=AudioRecord(MediaRecorder.AudioSource.MIC,SAMPLE_RATE,channels,encoding,maxOf(minimum,8192))
    try{
        if(device.state!=AudioRecord.STATE_INITIALIZED)throw IOException("Microphone unavailable")
        device.startRecording()
        if(device.recordingState!=AudioRecord.RECORDSTATE_RECORDING)throw IOException("Microphone unavailable")
        val buffer=ShortArray(2048)
        val sound=ByteBuffer.allocate(44+SAMPLE_RATE*VOICE_SECONDS*2).order(ByteOrder.LITTLE_ENDIAN)
        sound.position(44)
        var lastSecond=-1
        while(!stopping.get()&&sound.remaining()>0){
            ensureActive()
            val read=device.read(buffer,0,minOf(buffer.size,sound.remaining()/2),AudioRecord.READ_NON_BLOCKING)
            if(read<0)throw IOException("Microphone unavailable")
            if(read==0){delay(15);continue}
            for(index in 0 until read)sound.putShort(buffer[index])
            val second=(sound.position()-44)/2/SAMPLE_RATE
            if(second!=lastSecond){elapsed(second);lastSecond=second}
        }
        val length=sound.position()-44
        if(length<2)throw IOException("Empty recording")
        sound.position(0)
        fun field(value:String){sound.put(value.toByteArray(Charsets.US_ASCII))}
        field("RIFF");sound.putInt(length+36);field("WAVE");field("fmt ")
        sound.putInt(16);sound.putShort(1);sound.putShort(1);sound.putInt(SAMPLE_RATE)
        sound.putInt(SAMPLE_RATE*2);sound.putShort(2);sound.putShort(16);field("data");sound.putInt(length)
        sound.array().copyOf(length+44)
    }finally{
        if(device.recordingState==AudioRecord.RECORDSTATE_RECORDING)runCatching{device.stop()}
        device.release()
    }
}
