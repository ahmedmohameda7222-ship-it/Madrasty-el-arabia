package de.madrasty.app.comms

import de.madrasty.app.identity.IdentityViewModel
import de.madrasty.app.api.decodeData
import kotlinx.coroutines.delay
import kotlinx.coroutines.suspendCancellableCoroutine
import okhttp3.Call
import okhttp3.Callback
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.Response
import okio.BufferedSink
import org.json.JSONObject
import java.io.IOException
import java.net.URI
import java.time.Instant
import java.util.UUID
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

internal enum class ChatMediaKind(val wire:String,val mime:String,val limit:Int,val bucket:String){
    Photo("photo","image/jpeg",PHOTO_LIMIT,"madrasty-chat-photo-staging"),
    Voice("voice","audio/wav",VOICE_LIMIT,"madrasty-chat-voice-staging");
    companion object{
        fun read(value:String)=entries.firstOrNull{it.wire==value}?:throw IOException("Unknown media")
    }
}

internal class ChatMediaDraft(val kind:ChatMediaKind,val bytes:ByteArray){
    var key=UUID.randomUUID().toString()
    var uploadId:String?=null
    var mayHaveUploaded=false
    internal var authority:UploadAuthority?=null
    fun reset(){
        key=UUID.randomUUID().toString();uploadId=null;mayHaveUploaded=false;authority=null
    }
}
internal data class UploadAuthority(val id:String,val url:String,val expiresAt:Instant)
internal class UnsupportedChatMedia:IOException()

private val storageClient=OkHttpClient.Builder().followRedirects(false).followSslRedirects(false)
    .retryOnConnectionFailure(false).connectTimeout(10,TimeUnit.SECONDS).callTimeout(85,TimeUnit.SECONDS).build()

private suspend fun putChatMedia(authority:UploadAuthority,expectedOrigin:String,draft:ChatMediaDraft,progress:(Int)->Unit) =
    suspendCancellableCoroutine<Boolean>{ continuation->
        val url=URI(authority.url)
        val origin=URI(expectedOrigin)
        val extension=if(draft.kind==ChatMediaKind.Photo)"jpeg" else "wav"
        require(url.scheme=="https"&&url.rawAuthority==origin.rawAuthority&&url.rawUserInfo==null&&url.rawFragment==null&&
            url.rawPath=="/storage/v1/object/upload/sign/${draft.kind.bucket}/${authority.id}.$extension"&&
            url.rawQuery?.startsWith("token=")==true)
        val payload=object:RequestBody(){
            override fun contentType()=draft.kind.mime.toMediaType()
            override fun contentLength()=draft.bytes.size.toLong()
            override fun writeTo(sink:BufferedSink){
                var sent=0
                while(sent<draft.bytes.size){
                    val count=minOf(65536,draft.bytes.size-sent)
                    sink.write(draft.bytes,sent,count)
                    sent+=count
                    progress(sent*100/draft.bytes.size)
                }
            }
        }
        val call=storageClient.newCall(Request.Builder().url(authority.url).put(payload).build())
        continuation.invokeOnCancellation{call.cancel()}
        call.enqueue(object:Callback{
            override fun onFailure(call:Call,e:IOException){continuation.resumeWithException(e)}
            override fun onResponse(call:Call,response:Response){response.use{continuation.resume(it.isSuccessful)}}
        })
    }

internal suspend fun uploadChatMedia(model:IdentityViewModel,thread:String,draft:ChatMediaDraft,progress:(Int)->Unit):String{
    val root="/threads/$thread/uploads"
    suspend fun finish(id:String)=decodeData(model.schoolRequest("$root/$id",JSONObject().put("action","finalize"),"POST",id)){it as JSONObject}.data
    fun ready(result:JSONObject):String?=when(result.getString("state")){
        "ready" -> result.getString("mediaId")
        "failed" -> throw UnsupportedChatMedia()
        else -> null
    }
    if(draft.mayHaveUploaded){
        val prior=finish(checkNotNull(draft.uploadId))
        ready(prior)?.let{return it}
        when(prior.getString("state")){
            "staged"->draft.mayHaveUploaded=false
            "cancelled"->draft.reset()
        }
    }
    if(!draft.mayHaveUploaded||draft.authority==null){
        val input=JSONObject().put("mediaKind",draft.kind.wire).put("mime",draft.kind.mime).put("bytes",draft.bytes.size)
        val result=decodeData(model.schoolRequest(root,input,"POST",draft.key)){it as JSONObject}.data
        if(draft.bytes.size>result.getInt("maxBytes")||
            (draft.kind==ChatMediaKind.Voice&&result.getInt("maxDurationMs")!=VOICE_SECONDS*1000))throw UnsupportedChatMedia()
        val id=UUID.fromString(result.getString("uploadId")).toString()
        draft.uploadId=id
        draft.authority=UploadAuthority(id,result.getString("url"),Instant.parse(result.getString("expiresAt")))
    }
    val authority=checkNotNull(draft.authority)
    if(!draft.mayHaveUploaded){
        if(authority.expiresAt<=Instant.now()){draft.reset();throw IOException("Upload expired")}
        val origin=model.schoolStorageOrigin()
        val delivered=try{putChatMedia(authority,origin,draft,progress)}catch(_:IOException){false}
        draft.mayHaveUploaded=true
        val result=finish(authority.id)
        ready(result)?.let{return it}
        draft.mayHaveUploaded=delivered||result.getString("state")=="processing"
        if(!draft.mayHaveUploaded)throw IOException("Upload not received")
    }
    repeat(5){
        delay(850)
        val result=finish(authority.id)
        ready(result)?.let{return it}
        if(result.getString("state")=="cancelled"){draft.reset();throw IOException("Upload cancelled")}
    }
    draft.mayHaveUploaded=false
    throw IOException("Upload still pending")
}

internal suspend fun cancelChatMedia(model:IdentityViewModel,thread:String,id:String){
    model.schoolRequest("/threads/$thread/uploads/$id",JSONObject().put("action","cancel"),"POST")
}
