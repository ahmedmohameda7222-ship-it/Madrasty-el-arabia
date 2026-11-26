package de.madrasty.app.comms

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.MediaDataSource
import android.media.MediaPlayer
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.height
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.IconButton
import androidx.compose.material3.Icon
import androidx.compose.ui.Alignment
import androidx.compose.ui.res.painterResource
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import de.madrasty.app.R
import de.madrasty.app.identity.HttpFailure
import de.madrasty.app.identity.IdentityViewModel
import de.madrasty.app.ui.isolate
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.io.IOException
import java.util.concurrent.atomic.AtomicBoolean

private class PreparedChatMedia {
    var camera:File?=null
    var recording:Job?=null
    var capture:Job?=null
    var sending:Job?=null
}

internal fun expireChatCameraFiles(context:Context){
    val directory=File(context.cacheDir,"chat-camera")
    val cutoff=System.currentTimeMillis()-24*60*60*1000
    directory.listFiles()?.filter{it.isFile&&it.name.startsWith("capture-")&&it.lastModified()<cutoff}
        ?.forEach{it.delete()}
}

@Composable
internal fun MediaComposer(
    model:IdentityViewModel,thread:String,locked:Boolean,consumed:String?,onReady:(String?)->Unit,onBusy:(Boolean)->Unit,
    initialMenuOpen:Boolean=false,
    rowContent:@Composable RowScope.()->Unit={},
){
    val context=LocalContext.current
    val lifecycle=LocalLifecycleOwner.current.lifecycle
    val scope=rememberCoroutineScope()
    val resources=remember(thread){PreparedChatMedia()}
    val stopping=remember(thread){AtomicBoolean()}
    var draft by remember(thread){mutableStateOf<ChatMediaDraft?>(null)}
    var ready by remember(thread){mutableStateOf<String?>(null)}
    var capturing by remember(thread){mutableStateOf(false)}
    var recording by remember(thread){mutableStateOf(false)}
    var uploading by remember(thread){mutableStateOf(false)}
    var error by remember(thread){mutableStateOf<Int?>(null)}
    var elapsed by remember(thread){mutableIntStateOf(0)}
    var progress by remember(thread){mutableIntStateOf(0)}
    var menuOpen by remember(thread){mutableStateOf(initialMenuOpen)}
    LaunchedEffect(locked,capturing,recording,draft){if(locked||capturing||recording||draft!=null)menuOpen=false}

    LaunchedEffect(capturing,recording,uploading,draft,ready){
        onBusy(capturing||recording||uploading||(draft!=null&&ready==null))
    }
    LaunchedEffect(consumed){
        if(consumed!=null&&ready==consumed){draft=null;ready=null;progress=0;error=null}
    }
    DisposableEffect(resources,lifecycle){
        val observer=LifecycleEventObserver{_,event->
            if(event==Lifecycle.Event.ON_STOP){
                resources.recording?.cancel()
                recording=false
            }
        }
        lifecycle.addObserver(observer)
        onDispose{
            lifecycle.removeObserver(observer)
            resources.recording?.cancel()
            resources.capture?.cancel()
            resources.sending?.cancel()
            resources.camera?.delete()
        }
    }

    fun photo(uri:Uri,temporary:File?=null){
        capturing=true;error=null
        resources.capture=scope.launch{
            try{draft=ChatMediaDraft(ChatMediaKind.Photo,convertChatPhoto(context.contentResolver,uri))}
            catch(cancelled:CancellationException){throw cancelled}
            catch(_:Exception){error=R.string.chat_media_unsupported}
            finally{capturing=false;temporary?.delete()}
        }
    }
    fun startVoice(){
        if(recording||draft!=null||capturing||locked)return
        stopping.set(false);elapsed=0;recording=true;error=null
        resources.recording=scope.launch{
            try{
                val bytes=captureChatVoice(stopping){value->withContext(Dispatchers.Main){elapsed=value}}
                draft=ChatMediaDraft(ChatMediaKind.Voice,bytes)
            }catch(cancelled:CancellationException){throw cancelled}
            catch(_:SecurityException){error=R.string.chat_media_permission}
            catch(_:Exception){error=R.string.chat_media_unsupported}
            finally{recording=false}
        }
    }
    val permission=rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()){granted->
        if(granted)startVoice()else error=R.string.chat_media_permission
    }
    val gallery=rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()){uri->if(uri!=null)photo(uri)}
    val camera=rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()){saved->
        val file=resources.camera
        resources.camera=null
        if(file!=null&&saved)photo(cameraUri(context,file),file)
        else file?.delete()
    }

    Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(4.dp),verticalAlignment=Alignment.CenterVertically){
        if(draft==null&&!recording)Box{
            IconButton(enabled=!locked&&!capturing,onClick={menuOpen=true},modifier=Modifier.size(48.dp)){
                Icon(painterResource(R.drawable.ic_comms_add),contentDescription=stringResource(R.string.comms_first_media))
            }
            DropdownMenu(expanded=menuOpen,onDismissRequest={menuOpen=false}){
                DropdownMenuItem(text={Text(stringResource(R.string.chat_media_gallery))},enabled=!locked&&!capturing,onClick={
                    menuOpen=false
                    try{gallery.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))}
                    catch(_:Exception){error=R.string.chat_media_unsupported}
                })
                DropdownMenuItem(text={Text(stringResource(R.string.chat_media_camera))},enabled=!locked&&!capturing,onClick={
                    menuOpen=false
                    try{
                        val path=File(context.cacheDir,"chat-camera")
                        check(path.isDirectory||path.mkdirs())
                        val file=File.createTempFile("capture-",".jpg",path)
                        resources.camera?.delete()
                        resources.camera=file
                        camera.launch(cameraUri(context,file))
                    }catch(_:Exception){
                        resources.camera?.delete();resources.camera=null;error=R.string.chat_media_unsupported
                    }
                })
                DropdownMenuItem(text={Text(stringResource(R.string.chat_media_record))},enabled=!locked&&!capturing,onClick={
                    menuOpen=false
                    if(context.checkSelfPermission(Manifest.permission.RECORD_AUDIO)==PackageManager.PERMISSION_GRANTED)startVoice()
                    else permission.launch(Manifest.permission.RECORD_AUDIO)
                })
            }
        }
        rowContent()
    }
    if(recording){
        Text(stringResource(R.string.chat_media_recording)+" · "+isolate("%d:%02d".format(elapsed/60,elapsed%60)))
        FlowRow(horizontalArrangement=Arrangement.spacedBy(4.dp)){
            TextButton(onClick={stopping.set(true)}){Text(stringResource(R.string.chat_media_stop))}
            TextButton(onClick={resources.recording?.cancel();recording=false}){Text(stringResource(R.string.chat_media_cancel_recording))}
        }
    }
    val entry=draft
    if(entry!=null){
        ChatMediaPreview(entry.kind,entry.bytes)
        if(ready!=null)Text(stringResource(R.string.chat_media_ready))
        FlowRow(horizontalArrangement=Arrangement.spacedBy(4.dp)){
            if(ready==null)TextButton(enabled=!locked&&!uploading,onClick={
                uploading=true;error=null;progress=0
                resources.sending=scope.launch{
                    try{
                        val id=uploadChatMedia(model,thread,entry){percent->
                            scope.launch{if(draft===entry&&uploading)progress=percent}
                        }
                        if(draft===entry){ready=id;onReady(id)}
                    }catch(cancelled:CancellationException){throw cancelled}
                    catch(_:UnsupportedChatMedia){if(draft===entry)error=R.string.chat_media_unsupported}
                    catch(failure:HttpFailure){
                        if(draft===entry)error=if(failure.status in listOf(401,403,404))R.string.chat_media_expired else R.string.chat_media_upload_error
                    }catch(_:Exception){if(draft===entry)error=R.string.chat_media_upload_error}
                    finally{if(draft===entry)uploading=false}
                }
            }){Text(stringResource(if(error==R.string.chat_media_upload_error)R.string.retry else R.string.chat_media_upload))}
            TextButton(enabled=!locked,onClick={
                resources.sending?.cancel()
                draft=null;ready=null;progress=0;uploading=false;error=null;onReady(null)
                val id=entry.uploadId
                if(id!=null)scope.launch{runCatching{cancelChatMedia(model,thread,id)}}
            }){Text(stringResource(R.string.chat_media_discard))}
        }
    }
    if(capturing)Text(stringResource(R.string.chat_media_preparing))
    if(uploading)LinearProgressIndicator(progress={progress/100f},modifier=Modifier.fillMaxWidth())
    error?.let{Text(stringResource(it))}
}

private fun cameraUri(context:Context,file:File):Uri=
    FileProvider.getUriForFile(context,"${context.packageName}.chat-camera",file)

@Composable
internal fun PrivateChatMedia(model:IdentityViewModel,path:String,kind:ChatMediaKind){
    val scope=rememberCoroutineScope()
    var opened by remember(path){mutableStateOf<ByteArray?>(null)}
    var busy by remember(path){mutableStateOf(false)}
    var failure by remember(path){mutableStateOf<Int?>(null)}
    val file=opened
    if(file==null){
        TextButton(enabled=!busy,onClick={
            busy=true;failure=null
            scope.launch{
                try{opened=model.schoolPrivateMedia(path,kind.mime,kind.limit)}
                catch(cancelled:CancellationException){throw cancelled}
                catch(problem:HttpFailure){
                    failure=if(problem.status in listOf(401,403,404))R.string.chat_media_expired else R.string.chat_media_read_error
                }catch(_:Exception){failure=R.string.chat_media_read_error}
                finally{busy=false}
            }
        }){Text(stringResource(if(kind==ChatMediaKind.Photo)R.string.chat_media_open_photo else R.string.chat_media_open_voice))}
        if(busy)Text(stringResource(R.string.chat_media_preparing))
    }else{
        ChatMediaPreview(kind,file)
        TextButton(onClick={opened=null;failure=null}){Text(stringResource(R.string.chat_media_close))}
    }
    failure?.let{Text(stringResource(it))}
}

@Composable
private fun ChatMediaPreview(kind:ChatMediaKind,bytes:ByteArray){
    if(kind==ChatMediaKind.Photo){
        var loaded by remember(bytes){mutableStateOf<Bitmap?>(null)}
        var failed by remember(bytes){mutableStateOf(false)}
        LaunchedEffect(bytes){
            loaded=withContext(Dispatchers.IO){BitmapFactory.decodeByteArray(bytes,0,bytes.size)}
            failed=loaded==null
        }
        if(failed)Text(stringResource(R.string.chat_media_read_error))
        loaded?.let{bitmap->
            Image(bitmap.asImageBitmap(),contentDescription=stringResource(R.string.chat_photo),
                modifier=Modifier.fillMaxWidth().heightIn(max=280.dp),contentScale=ContentScale.Fit)
        }
    }else VoicePreview(bytes)
}

private class VoicePlayer {
    var device:MediaPlayer?=null
    fun stop(){device?.release();device=null}
}

@Composable
private fun VoicePreview(bytes:ByteArray){
    val player=remember(bytes){VoicePlayer()}
    var waveform by remember(bytes){mutableStateOf<VoiceWaveform?>(null)}
    LaunchedEffect(bytes){waveform=withContext(Dispatchers.Default){voiceWaveform(bytes)}}
    val lifecycle=LocalLifecycleOwner.current.lifecycle
    var playing by remember(bytes){mutableStateOf(false)}
    var failed by remember(bytes){mutableStateOf(false)}
    DisposableEffect(player,lifecycle){
        val observer=LifecycleEventObserver{_,event->
            if(event==Lifecycle.Event.ON_STOP){player.stop();playing=false}
        }
        lifecycle.addObserver(observer)
        onDispose{lifecycle.removeObserver(observer);player.stop()}
    }
    waveform?.let{wave->
        val color=MaterialTheme.colorScheme.primary
        Canvas(Modifier.fillMaxWidth().height(40.dp)){
            val step=size.width/wave.bars.size
            wave.bars.forEachIndexed{index,level->
                val h=maxOf(2.dp.toPx(),level*size.height*.9f)
                val x=(index+.5f)*step
                drawLine(color,Offset(x,(size.height-h)/2),Offset(x,(size.height+h)/2),strokeWidth=minOf(3.dp.toPx(),step*.65f),cap=StrokeCap.Round)
            }
        }
        Text(isolate(voiceTime(wave.duration)),style=MaterialTheme.typography.labelSmall)
    }
    TextButton(onClick={
        if(playing){player.stop();playing=false}
        else{
            failed=false
            try{
                val device=MediaPlayer()
                player.device=device
                device.setDataSource(object:MediaDataSource(){
                    override fun readAt(position:Long,buffer:ByteArray,offset:Int,size:Int):Int{
                        if(position<0||position>=bytes.size)return -1
                        val start=position.toInt()
                        val count=minOf(size,bytes.size-start)
                        bytes.copyInto(buffer,offset,start,start+count)
                        return count
                    }
                    override fun getSize()=bytes.size.toLong()
                    override fun close()=Unit
                })
                device.setOnPreparedListener{if(player.device===it)it.start()}
                device.setOnCompletionListener{if(player.device===it){player.stop();playing=false}}
                device.setOnErrorListener{failedPlayer,_,_->
                    if(player.device===failedPlayer){player.stop();playing=false;failed=true}
                    true
                }
                device.prepareAsync()
                playing=true
            }catch(_:Exception){player.stop();playing=false;failed=true}
        }
    }){Text(stringResource(if(playing)R.string.chat_media_stop_playback else R.string.chat_media_play))}
    if(failed)Text(stringResource(R.string.chat_media_read_error))
}
