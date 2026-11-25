package de.madrasty.app.comms

import android.net.Uri
import android.content.ClipData
import android.content.ClipboardManager
import android.os.PersistableBundle
import android.os.Build
import androidx.compose.foundation.combinedClickable
import androidx.compose.ui.platform.LocalContext
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.size
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.Icon
import androidx.compose.ui.res.painterResource
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Surface
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.relocation.BringIntoViewRequester
import androidx.compose.foundation.relocation.bringIntoViewRequester
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import de.madrasty.app.R
import de.madrasty.app.academics.AcademicLongField
import de.madrasty.app.academics.string
import de.madrasty.app.api.WirePage
import de.madrasty.app.api.decodeData
import de.madrasty.app.identity.HttpFailure
import de.madrasty.app.identity.IdentityViewModel
import de.madrasty.app.school.Field
import de.madrasty.app.school.Submit
import de.madrasty.app.ui.AsyncState
import de.madrasty.app.ui.AsyncSurface
import de.madrasty.app.ui.isolate
import java.util.UUID
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject

private data class Outgoing(val id:String,val body:String,val replyTo:String?,val media:String?,val pending:Boolean)

@Composable
internal fun Conversation(model:IdentityViewModel,thread:JSONObject,modifier:Modifier=Modifier,changed:()->Unit){
    val id=thread.getString("id")
    val path="/threads/$id"
    var typed by remember(id){mutableStateOf("")}
    var quote by remember(id){mutableStateOf<JSONObject?>(null)}
    var term by remember(id){mutableStateOf("")}
    var search by remember(id){mutableStateOf("")}
    var outgoing by remember(id){mutableStateOf<Outgoing?>(null)}
    var acknowledged by remember(id){mutableStateOf<JSONObject?>(null)}
    var attachment by remember(id){mutableStateOf<String?>(null)}
    var consumed by remember(id){mutableStateOf<String?>(null)}
    var preparing by remember(id){mutableStateOf(false)}
    var forbidden by remember(id){mutableStateOf(false)}
    var archived by remember(id,thread.optBoolean("archived")){mutableStateOf(thread.optBoolean("archived"))}
    val scope=rememberCoroutineScope()
    fun deny(){forbidden=true;typed="";quote=null;outgoing=null;acknowledged=null;attachment=null;changed()}
    fun clearSent(message:Outgoing){
        outgoing=null;typed="";quote=null
        if(message.media!=null){consumed=message.media;attachment=null}
    }
    fun recognize(rows:List<JSONObject>){
        val pending=outgoing?:return
        if(rows.any{it.string("clientMessageId")==pending.id})clearSent(pending)
    }
    if(forbidden){
        AsyncSurface<Unit>(AsyncState.Forbidden()){}
        return
    }
    val failed=outgoing?.pending==false
    var optionsOpen by remember(id){mutableStateOf(false)}
    Column(modifier.fillMaxWidth(),verticalArrangement=Arrangement.spacedBy(6.dp)){
    TextButton(onClick={optionsOpen=!optionsOpen}){Text(stringResource(R.string.chat_search_thread)+" · ⋯")}
    if(optionsOpen){
    Column(Modifier.heightIn(max=150.dp).verticalScroll(rememberScrollState())){
    Submit(true,if(archived)R.string.chat_restore else R.string.chat_archive,success=null){
        try{
            val output=model.chatCommand("$path/state",JSONObject().put("archived",!archived),"PATCH")
            archived=output.getBoolean("archived")
            changed()
        }catch(error:HttpFailure){
            if(error.denied)deny()
            throw error
        }
    }
    if(archived)Text(stringResource(R.string.chat_archived))
    Field(R.string.chat_search_thread,search){search=it.take(120)}
    TextButton(onClick={term=search.trim()}){Text(stringResource(R.string.staff_search))}
    if(term.isNotEmpty())TextButton(onClick={term="";search=""}){Text(stringResource(R.string.clear_filter))}
    }
    }
    val timelineScroll=rememberScrollState()
    var previousExtent by remember(id,term){mutableStateOf(0)}
    val followThreshold=with(androidx.compose.ui.platform.LocalDensity.current){80.dp.roundToPx()}
    LaunchedEffect(id,term,timelineScroll.maxValue){
        val extent=timelineScroll.maxValue
        if(extent!=Int.MAX_VALUE){
            val follow=previousExtent==0||previousExtent-timelineScroll.value<=followThreshold
            previousExtent=extent
            if(follow&&term.isEmpty()&&!timelineScroll.isScrollInProgress)timelineScroll.scrollTo(extent)
        }
    }
    Column(Modifier.weight(1f).fillMaxWidth().verticalScroll(timelineScroll),verticalArrangement=Arrangement.spacedBy(8.dp)){
    key(id,term){
        MessageTimeline(model,thread,term,acknowledged,::deny,::recognize,{archived=it}){message->
            if(outgoing?.pending!=true){quote=message;outgoing=null}
        }
    }
    outgoing?.let{message->
        Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.End){
            Surface(shape=RoundedCornerShape(18.dp),color=MaterialTheme.colorScheme.primaryContainer){
                Column(Modifier.padding(12.dp)){
                    if(message.body.isNotEmpty())Text(isolate(message.body))
                    Text(stringResource(if(message.pending)R.string.chat_sending else R.string.chat_failed),style=MaterialTheme.typography.labelSmall)
                }
            }
        }
    }
    }
    if(!thread.optBoolean("canReply")){
        Text(stringResource(R.string.chat_read_only))
        return@Column
    }
    Column(Modifier.fillMaxWidth().heightIn(max=200.dp).verticalScroll(rememberScrollState()),verticalArrangement=Arrangement.spacedBy(4.dp)){
    val quoted=quote
    if(quoted!=null){
        Text(stringResource(R.string.chat_reply)+" · "+chatAuthor(quoted))
        quoted.string("body")?.let{Text(isolate(it.take(140)))}
        TextButton(enabled=outgoing?.pending!=true,onClick={quote=null;outgoing=null}){Text(stringResource(R.string.chat_cancel_reply))}
    }
    MediaComposer(model,id,locked=outgoing?.pending==true,consumed=consumed,onReady={
        if(attachment!=it&&outgoing?.pending!=true)outgoing=null
        attachment=it
    },onBusy={preparing=it}){
    ChatInputField(typed,outgoing?.pending!=true){typed=it;outgoing=null}
    ChatSendAction(enabled=(typed.isNotBlank()||attachment!=null)&&!preparing&&outgoing?.pending!=true,failed=failed,onClick={
        val sending=outgoing?.copy(pending=true)?:Outgoing(UUID.randomUUID().toString(),typed.trim(),quoted?.getString("id"),attachment,true)
        outgoing=sending
        scope.launch{
            try{
                val body=JSONObject().put("clientMessageId",sending.id)
                if(sending.body.isNotEmpty())body.put("body",sending.body)
                sending.media?.let{body.put("attachmentIds",JSONArray(listOf(it)))}
                sending.replyTo?.let{body.put("replyToId",it)}
                val result=model.chatCommand("$path/messages",body,"POST",sending.id)
                if(!forbidden){
                    acknowledged=result
                    if(outgoing?.id==sending.id)clearSent(sending)
                }
            }catch(error:CancellationException){throw error}
            catch(error:HttpFailure){
                if(error.denied)deny()
                else if(outgoing?.id==sending.id){outgoing=sending.copy(pending=false);if(error.status==409)changed()}
            }
            catch(_:Exception){if(outgoing?.id==sending.id)outgoing=sending.copy(pending=false)}
        }
    })
    }
    }
    }
}

@Composable
internal fun RowScope.ChatInputField(value:String,enabled:Boolean,change:(String)->Unit){
    OutlinedTextField(value=value,onValueChange={change(it.take(4000))},enabled=enabled,
        modifier=Modifier.weight(1f),shape=RoundedCornerShape(28.dp),minLines=1,maxLines=4,
        placeholder={Text(stringResource(R.string.comms_first_message),maxLines=1)})
}

@Composable
internal fun ChatSendAction(enabled:Boolean,failed:Boolean,onClick:()->Unit){
    FilledIconButton(enabled=enabled,onClick=onClick,modifier=Modifier.size(48.dp)){
        Icon(painterResource(if(failed)R.drawable.ic_comms_retry else R.drawable.ic_comms_send),
            contentDescription=stringResource(if(failed)R.string.chat_retry else R.string.chat_send))
    }
}

@Composable
private fun MessageTimeline(
    model:IdentityViewModel,thread:JSONObject,term:String,ack:JSONObject?,deny:()->Unit,recognize:(List<JSONObject>)->Unit,
    updateArchive:(Boolean)->Unit,reply:(JSONObject)->Unit,
){
    val id=thread.getString("id")
    val path="/threads/$id/messages?limit=30"+if(term.isEmpty())"" else "&q=${Uri.encode(term)}"
    val lifecycle=LocalLifecycleOwner.current.lifecycle
    val coroutine=rememberCoroutineScope()
    val denied by rememberUpdatedState(deny)
    val recognizeLatest by rememberUpdatedState(recognize)
    val archiveChanged by rememberUpdatedState(updateArchive)
    var records by remember{mutableStateOf<List<JSONObject>?>(null)}
    var before by remember{mutableStateOf<String?>(null)}
    var read by remember{mutableStateOf(thread.getString("readThroughSeq").toLong())}
    var expanded by remember{mutableStateOf(false)}
    var needsRetry by remember{mutableStateOf(false)}
    var retry by remember{mutableStateOf(0)}
    var focus by remember{mutableStateOf<String?>(null)}
    var highest by remember{mutableStateOf<Long?>(null)}

    LaunchedEffect(ack){
        if(ack!=null&&term.isEmpty())records=mergeChat(records.orEmpty(),listOf(ack))
    }
    LaunchedEffect(path,retry,model.attendanceNetworkRevision){
        do{
            if(lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)){
                try{
                    val page=model.chatPage(path)
                    val newest=page.data.firstOrNull()?.getString("sequence")?.toLong()
                    val oldest=page.data.lastOrNull()?.getString("sequence")?.toLong()
                    val previous=highest
                    if(term.isEmpty()&&previous!=null&&oldest!=null&&newest!=null&&oldest>previous+1){
                        var after:Long=previous
                        while(after<newest){
                            val gap=model.chatPage("/threads/$id/messages?limit=100&after=$after")
                            val last=gap.data.lastOrNull()?.getString("sequence")?.toLong()?:break
                            if(last<=after)break
                            records=mergeChat(records.orEmpty(),gap.data)
                            recognizeLatest(gap.data)
                            after=last
                        }
                    }
                    if(newest!=null&&(previous==null||newest>previous))highest=newest
                    records=mergeChat(records.orEmpty(),page.data)
                    recognizeLatest(page.data)
                    if(!expanded)before=page.nextCursor
                    needsRetry=false
                    if(term.isEmpty()&&newest!=null&&newest>read){
                        val result=model.chatCommand("/threads/$id/state",JSONObject().put("readThroughSeq",newest.toString()),"PATCH")
                        read=result.getString("readThroughSeq").toLong()
                        archiveChanged(result.getBoolean("archived"))
                    }
                }catch(error:CancellationException){throw error}
                catch(error:HttpFailure){
                    if(error.denied){records=null;denied();return@LaunchedEffect}
                    needsRetry=true
                }catch(_:Exception){needsRetry=true}
            }
            delay(5000)
        }while(true)
    }
    if(needsRetry){
        Text(stringResource(R.string.generic_error))
        TextButton(onClick={retry++}){Text(stringResource(R.string.retry))}
    }
    val rows=records
    if(rows==null){
        if(!needsRetry)AsyncSurface<Unit>(AsyncState.InitialLoading()){}
        return
    }
    val cursor=before
    if(cursor!=null)Submit(true,R.string.chat_older,success=null){
        try{
            val page=model.chatPage("$path&before=$cursor")
            records=mergeChat(records.orEmpty(),page.data);before=page.nextCursor;expanded=true;needsRetry=false
        }catch(error:HttpFailure){
            if(error.denied)deny()
            throw error
        }
    }
    if(rows.isEmpty())Text(stringResource(R.string.empty))
    for(message in rows){
        val messageId=message.getString("id")
        key(messageId){
            ChatMessageItem(model,thread,message,messageId==focus,reply,{target->
                coroutine.launch{
                    try{
                        val quoted=target.getString("id")
                        if(records.orEmpty().none{it.getString("id")==quoted}){
                            val seq=target.getString("sequence").toLong()
                            if(seq<Long.MAX_VALUE){
                                val page=model.chatPage("/threads/$id/messages?limit=20&before=${seq+1}")
                                records=mergeChat(records.orEmpty(),page.data)
                            }
                        }
                        focus=quoted
                    }catch(error:CancellationException){throw error}
                    catch(error:HttpFailure){if(error.denied)deny() else needsRetry=true}
                    catch(_:Exception){needsRetry=true}
                }
            },deny){latest->
                records=records?.map{if(it.getString("id")==messageId)JSONObject(it.toString()).put("reactions",latest) else it}
            }
        }
    }
}

@Composable
internal fun ChatMessageItem(
    model:IdentityViewModel,thread:JSONObject,message:JSONObject,focused:Boolean,reply:(JSONObject)->Unit,jump:(JSONObject)->Unit,
    deny:()->Unit,replaceReactions:(JSONArray)->Unit,
){
    val location=remember{BringIntoViewRequester()}
    LaunchedEffect(focused){if(focused)location.bringIntoView()}
    val own=message.optBoolean("own")
    var actions by remember(message.getString("id")){mutableStateOf(false)}
    val context=LocalContext.current
    var copyFailed by remember(message.getString("id")){mutableStateOf(false)}
    Row(Modifier.fillMaxWidth().bringIntoViewRequester(location),horizontalArrangement=if(own)Arrangement.End else Arrangement.Start){
    CommunicationBubble(own){
    if(!own)Text(chatAuthor(message),style=MaterialTheme.typography.labelMedium)
    message.optJSONObject("reply")?.let{quote->
        TextButton(onClick={jump(quote)}){
            Text(stringResource(R.string.chat_quoted)+" · "+chatAuthor(quote)+
                (quote.string("preview")?.let{" · "+isolate(it)}?:""))
        }
    }
    message.string("body")?.let{body->
        Text(isolate(body),modifier=Modifier.combinedClickable(onClick={},onLongClick={actions=true}))
    }
    val media=message.getJSONArray("attachments")
    val threadId=thread.getString("id")
    for(index in 0 until media.length()){
        val attachment=media.getJSONObject(index)
        val attachmentId=attachment.getString("id")
        key(attachmentId){PrivateChatMedia(model,"/threads/$threadId/media/$attachmentId",ChatMediaKind.read(attachment.getString("kind")))}
    }
    val hasContent=message.string("body")!=null||media.length()>0
    if(!hasContent&&message.getString("source")=="human")Text(stringResource(R.string.chat_message_redacted))
    Text(isolate(message.getString("createdAt").replace("T"," ").take(16))+(if(own)" · "+stringResource(if(message.optBoolean("counterpartRead"))R.string.chat_read else R.string.chat_sent) else ""),style=MaterialTheme.typography.labelSmall)
    TextButton(onClick={actions=!actions}){Text(stringResource(R.string.chat_reactions)+" · ⋯")}
    if(actions){
    if(message.optBoolean("replyable")&&thread.optBoolean("canReply")){
        TextButton(onClick={reply(message)}){Text(stringResource(R.string.chat_reply))}
    }
    message.string("body")?.let{body->
        TextButton(onClick={
            copyFailed=runCatching{
                val clip=ClipData.newPlainText("",body)
                if(Build.VERSION.SDK_INT>=33)clip.description.extras=PersistableBundle().apply{putBoolean("android.content.extra.IS_SENSITIVE",true)}
                val clipboard=requireNotNull(context.getSystemService(ClipboardManager::class.java))
                clipboard.setPrimaryClip(clip)
            }.isFailure
            if(!copyFailed)actions=false
        }){Text(stringResource(R.string.chat_copy_text))}
        if(copyFailed)Text(stringResource(R.string.generic_error))
    }
    if(hasContent)ReportChatMessage(model,threadId,message.getString("id"))
    }
    if(hasContent||message.getString("source")=="system")ChatReactions(model,threadId,message,deny,replaceReactions,showPicker=actions)
    }
    }
}

@Composable
internal fun CommunicationBubble(own:Boolean,content:@Composable ()->Unit){
    Surface(modifier=Modifier.widthIn(max=320.dp),shape=RoundedCornerShape(18.dp),
        color=if(own)MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceVariant){
        Column(Modifier.padding(12.dp),verticalArrangement=Arrangement.spacedBy(4.dp)){content()}
    }
}

private val availableEmojis=listOf("👍","❤️","😂","😮","😢","🙏")

@Composable
private fun ChatReactions(model:IdentityViewModel,thread:String,message:JSONObject,deny:()->Unit,received:(JSONArray)->Unit,showPicker:Boolean){
    var expanded by remember(showPicker){mutableStateOf(false)}
    var busy by remember{mutableStateOf(false)}
    var error by remember{mutableStateOf(false)}
    val reactions=message.getJSONArray("reactions")
    var optimisticChoice by remember{mutableStateOf<String?>(null)}
    val counts=List(reactions.length(),reactions::getJSONObject).associateBy{it.getString("emoji")}
    val projected=if(!busy)counts else buildMap<String,JSONObject>{
        for((emoji,entry) in counts){
            val amount=entry.getInt("count")-(if(entry.optBoolean("mine"))1 else 0)
            if(amount>0)put(emoji,JSONObject().put("emoji",emoji).put("count",amount).put("mine",false))
        }
        optimisticChoice?.let{choice->
            put(choice,JSONObject().put("emoji",choice).put("count",(get(choice)?.getInt("count")?:0)+1).put("mine",true))
        }
    }
    val scope=rememberCoroutineScope()
    if(showPicker)TextButton(onClick={expanded=!expanded}){Text(stringResource(R.string.chat_reactions))}
    if(error)Text(stringResource(R.string.generic_error))
    if(expanded||projected.isNotEmpty())FlowRow(horizontalArrangement=Arrangement.spacedBy(4.dp)){
        val options=if(expanded)availableEmojis else availableEmojis.filter{projected.containsKey(it)}
        for(emoji in options){
            val reaction=projected[emoji]
            val mine=reaction?.optBoolean("mine")==true
            val amount=reaction?.getInt("count")
            FilterChip(selected=mine,enabled=!busy,onClick={
                val choice=if(mine)null else emoji
                optimisticChoice=choice;busy=true;error=false
                scope.launch{
                    try{
                        val endpoint="/threads/$thread/messages/${message.getString("id")}/reaction"
                        val changed=model.schoolRequest(endpoint,JSONObject().put("emoji",choice?:JSONObject.NULL),"PUT")
                        val rows=decodeData(changed){it as JSONArray}.data
                        received(rows)
                    }catch(failure:CancellationException){throw failure}
                    catch(failure:HttpFailure){if(failure.denied)deny()else error=true}
                    catch(_:Exception){error=true}
                    finally{busy=false;optimisticChoice=null}
                }
            },label={Text(if(amount==null)emoji else "$emoji $amount")})
        }
    }
}
@Composable
private fun chatAuthor(message:JSONObject)=message.string("authorName")?.let(::isolate)?:stringResource(R.string.chat_school)
private val HttpFailure.denied get()=status in listOf(401,403,404)
private suspend fun IdentityViewModel.chatCommand(path:String,body:JSONObject,method:String,requestId:String?=null)=
    decodeData(schoolRequest(path,body,method,requestId)){it as JSONObject}.data
private suspend fun IdentityViewModel.chatPage(path:String):WirePage<List<JSONObject>> =
    decodeData(schoolRequest(path)){payload->(payload as JSONArray).let{records->List(records.length(),records::getJSONObject)}}
private fun mergeChat(existing:List<JSONObject>,fresh:List<JSONObject>)=
    (existing+fresh).associateBy{it.getString("id")}.values.sortedBy{it.getString("sequence").toLong()}
