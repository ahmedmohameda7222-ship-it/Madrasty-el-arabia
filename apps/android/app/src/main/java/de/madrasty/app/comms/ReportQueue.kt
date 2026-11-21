package de.madrasty.app.comms

import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import de.madrasty.app.R
import de.madrasty.app.academics.AcademicLongField
import de.madrasty.app.academics.string
import de.madrasty.app.api.decodeData
import de.madrasty.app.identity.HttpFailure
import de.madrasty.app.identity.IdentityViewModel
import de.madrasty.app.ui.AsyncState
import de.madrasty.app.ui.AsyncSurface
import de.madrasty.app.ui.isolate
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

@Composable
internal fun ReportChatMessage(model:IdentityViewModel,thread:String,message:String){
    val coroutine=rememberCoroutineScope()
    var open by remember{mutableStateOf(false)}
    var reason by remember{mutableStateOf("")}
    var requestId by remember{mutableStateOf<String?>(null)}
    var busy by remember{mutableStateOf(false)}
    var sent by remember{mutableStateOf(false)}
    var error by remember{mutableStateOf<Int?>(null)}
    if(sent)Text(stringResource(R.string.chat_report_sent))
    else if(!open)TextButton(onClick={open=true}){Text(stringResource(R.string.chat_report_message))}
    if(open)AlertDialog(
        onDismissRequest={if(!busy)open=false},
        title={Text(stringResource(R.string.chat_report_message))},
        text={Column(verticalArrangement=Arrangement.spacedBy(8.dp)){
            if(!busy)AcademicLongField(R.string.chat_report_reason,reason,500){reason=it;requestId=null}
            else Text(isolate(reason))
            error?.let{Text(stringResource(it))}
        }},
        confirmButton={
            TextButton(enabled=!busy&&reason.isNotBlank(),onClick={
                val id=requestId?:UUID.randomUUID().toString()
                requestId=id;busy=true;error=null
                coroutine.launch{
                    try{
                        val data=JSONObject().put("threadId",thread).put("messageId",message).put("reason",reason.trim())
                        model.schoolRequest("/message-reports",data,"POST",id)
                        open=false;sent=true;reason=""
                    }catch(cancelled:CancellationException){throw cancelled}
                    catch(problem:HttpFailure){
                        error=if(problem.status in listOf(401,403,404))R.string.chat_media_expired else R.string.generic_error
                    }catch(_:Exception){error=R.string.generic_error}
                    finally{busy=false}
                }
            }){Text(stringResource(R.string.chat_report_submit))}
        },
        dismissButton={TextButton(enabled=!busy,onClick={open=false;error=null}){Text(stringResource(R.string.back))}},
    )
}

internal suspend fun IdentityViewModel.mayReviewChatReports()=
    decodeData(schoolRequest("/message-reports/access")){data->(data as JSONObject).getBoolean("allowed")}.data

@Composable
internal fun ReportQueue(model:IdentityViewModel,close:()->Unit){
    val scope=rememberCoroutineScope()
    var items by remember{mutableStateOf<List<JSONObject>?>(null)}
    var cursor by remember{mutableStateOf<String?>(null)}
    var selected by remember{mutableStateOf<String?>(null)}
    var report by remember{mutableStateOf<JSONObject?>(null)}
    var failure by remember{mutableStateOf<Int?>(null)}
    var denied by remember{mutableStateOf(false)}
    var busy by remember{mutableStateOf(false)}
    var reload by remember{mutableIntStateOf(0)}
    fun back(){
        if(selected==null)close()
        else{selected=null;report=null;failure=null}
    }
    BackHandler(enabled=!busy,onBack=::back)
    LaunchedEffect(selected,reload){
        val ref=selected
        try{
            if(ref==null){
                val list=model.reportPage()
                items=list.data;cursor=list.nextCursor
            }else report=model.reportRecord(ref)
            failure=null
        }catch(cancelled:CancellationException){throw cancelled}
        catch(error:HttpFailure){
            if(error.status in listOf(401,403)){items=null;report=null;denied=true}
            else{report=null;failure=R.string.generic_error}
        }catch(_:Exception){failure=R.string.generic_error}
    }
    Column(Modifier.fillMaxSize().safeDrawingPadding().imePadding().verticalScroll(rememberScrollState()).padding(20.dp),
        verticalArrangement=Arrangement.spacedBy(8.dp)){
        TextButton(enabled=!busy,onClick=::back){Text(stringResource(R.string.back))}
        Text(stringResource(R.string.chat_reports),style=MaterialTheme.typography.headlineMedium)
        if(denied){
            AsyncSurface<Unit>(AsyncState.Forbidden(close)){}
            return@Column
        }
        failure?.let{label->
            Text(stringResource(label))
            TextButton(onClick={reload++}){Text(stringResource(R.string.retry))}
        }
        val entry=report
        val page=items
        if(selected!=null){
            if(entry!=null)key(entry.getString("id")){
                MessageReportDetail(model,entry,updated={report=it},scopeLost={report=null;selected=null;items=null;denied=true},
                    updating={busy=it},refresh={reload++})
            }else if(failure==null)AsyncSurface<Unit>(AsyncState.InitialLoading()){}
        }else if(page==null){
            if(failure==null)AsyncSurface<Unit>(AsyncState.InitialLoading()){}
        }else{
            if(page.isEmpty())Text(stringResource(R.string.chat_report_empty))
            page.forEach{item->
                HorizontalDivider()
                Text(stringResource(reportStatus(item.getString("state")))+" · "+isolate(item.getString("createdAt")))
                TextButton(enabled=!busy,onClick={selected=item.getString("id");report=null;failure=null}){
                    Text(stringResource(R.string.chat_report_open))
                }
            }
            val next=cursor
            if(next!=null)TextButton(enabled=!busy,onClick={
                busy=true;failure=null
                scope.launch{
                    try{
                        val result=model.reportPage(next)
                        items=items.orEmpty()+result.data;cursor=result.nextCursor
                    }catch(cancelled:CancellationException){throw cancelled}
                    catch(error:HttpFailure){
                        if(error.status in listOf(401,403)){items=null;denied=true}else failure=R.string.generic_error
                    }catch(_:Exception){failure=R.string.generic_error}
                    finally{busy=false}
                }
            }){Text(stringResource(R.string.chat_report_more))}
        }
    }
}

@Composable
private fun MessageReportDetail(
    model:IdentityViewModel,report:JSONObject,updated:(JSONObject)->Unit,scopeLost:()->Unit,updating:(Boolean)->Unit,refresh:()->Unit,
){
    val scope=rememberCoroutineScope()
    val id=report.getString("id")
    val revision=report.getInt("revision")
    val state=report.getString("state")
    var busy by remember(id){mutableStateOf(false)}
    var confirmation by remember(id){mutableStateOf(false)}
    var command by remember(id){mutableStateOf<Pair<String,String>?>(null)}
    var failure by remember(id){mutableStateOf<Int?>(null)}
    fun change(next:String,redact:Boolean=false){
        val intent="$revision/$next/$redact"
        val requestId=command?.takeIf{it.first==intent}?.second?:UUID.randomUUID().toString()
        command=intent to requestId
        busy=true;updating(true);failure=null
        scope.launch{
            try{
                val body=JSONObject().put("state",next).put("revision",revision)
                if(redact)body.put("action","redact")
                val result=model.schoolRequest("/message-reports/$id",body,"PATCH",requestId)
                updated(decodeData(result){it as JSONObject}.data);command=null
            }catch(cancelled:CancellationException){throw cancelled}
            catch(error:HttpFailure){
                if(error.status in listOf(401,403,404))scopeLost()
                else{
                    failure=R.string.generic_error
                    if(error.code=="stale_revision")refresh()
                }
            }catch(_:Exception){failure=R.string.generic_error}
            finally{busy=false;updating(false)}
        }
    }
    Text(stringResource(reportStatus(state)))
    Text(stringResource(R.string.chat_report_reason),style=MaterialTheme.typography.titleMedium)
    Text(isolate(report.getString("reason")))
    Text((report.string("authorName")?.let(::isolate)?:stringResource(R.string.chat_school))+" · "+isolate(report.getString("messageCreatedAt")))
    report.string("messageBody")?.let{Text(isolate(it))}
    val attachments=report.getJSONArray("attachments")
    for(index in 0 until attachments.length()){
        val item=attachments.getJSONObject(index)
        val mediaId=item.getString("id")
        key(mediaId){PrivateChatMedia(model,"/message-reports/$id/media/$mediaId",ChatMediaKind.read(item.getString("kind")))}
    }
    if(state in listOf("pending","in_review"))FlowRow(horizontalArrangement=Arrangement.spacedBy(4.dp)){
        if(state=="pending")TextButton(enabled=!busy,onClick={change("in_review")}){Text(stringResource(R.string.chat_report_review))}
        TextButton(enabled=!busy,onClick={change("resolved")}){Text(stringResource(R.string.chat_report_close))}
        TextButton(enabled=!busy,onClick={change("dismissed")}){Text(stringResource(R.string.chat_report_dismiss))}
        TextButton(enabled=!busy,onClick={confirmation=true}){Text(stringResource(R.string.chat_report_redact))}
    }
    if(confirmation)AlertDialog(
        onDismissRequest={confirmation=false},
        title={Text(stringResource(R.string.chat_report_confirm_redact))},
        confirmButton={TextButton(onClick={confirmation=false;change("resolved",true)}){Text(stringResource(R.string.chat_report_redact))}},
        dismissButton={TextButton(onClick={confirmation=false}){Text(stringResource(R.string.back))}},
    )
    failure?.let{Text(stringResource(it))}
}

private fun reportStatus(state:String)=when(state){
    "pending"->R.string.chat_report_pending
    "in_review"->R.string.chat_report_in_review
    "resolved"->R.string.chat_report_resolved
    else->R.string.chat_report_dismissed
}
private suspend fun IdentityViewModel.reportRecord(id:String)=decodeData(schoolRequest("/message-reports/$id")){it as JSONObject}.data
private suspend fun IdentityViewModel.reportPage(cursor:String?=null)=decodeData(
    schoolRequest("/message-reports?limit=24"+(cursor?.let{"&cursor=${Uri.encode(it)}"}?:"")),
){(it as JSONArray).let{records->List(records.length(),records::getJSONObject)}}
