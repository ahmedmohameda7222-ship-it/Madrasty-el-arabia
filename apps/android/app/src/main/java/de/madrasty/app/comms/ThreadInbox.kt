package de.madrasty.app.comms

import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.runtime.LaunchedEffect
import kotlinx.coroutines.delay
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import de.madrasty.app.R
import de.madrasty.app.academics.ReportTarget
import de.madrasty.app.academics.academicPages
import de.madrasty.app.academics.academicRead
import de.madrasty.app.academics.string
import de.madrasty.app.identity.HttpFailure
import de.madrasty.app.identity.IdentityViewModel
import de.madrasty.app.school.Field
import de.madrasty.app.school.Submit
import de.madrasty.app.school.schoolCommand
import de.madrasty.app.school.timetableObject
import de.madrasty.app.ui.AsyncSurface
import de.madrasty.app.ui.isolate
import org.json.JSONObject

private val officeTitles=mapOf("student_affairs" to R.string.conversation_student_affairs,"accounts" to R.string.conversation_accounts)
private val caseLabels=mapOf(
    "open" to R.string.conversation_case_open,
    "in_progress" to R.string.conversation_case_in_progress,
    "closed" to R.string.conversation_case_closed,
)
@Composable
internal fun ThreadInbox(model:IdentityViewModel,directory:()->Unit,open:(String)->Unit){
    val version=threadRefreshVersion()
    var filter by remember{mutableStateOf("all")}
    var search by remember{mutableStateOf("")}
    var queryTerm by remember{mutableStateOf("")}
    LaunchedEffect(search){delay(250);queryTerm=search.trim()}
    Button(onClick=directory,modifier=Modifier.fillMaxWidth()){Text(stringResource(R.string.comms_new_message))}
    Field(R.string.chat_search_inbox,search){search=it.take(120)}
    FlowRow(horizontalArrangement=Arrangement.spacedBy(4.dp)){
        FilterChip(filter=="all",onClick={filter="all"},label={Text(stringResource(R.string.directory_all))})
        FilterChip(filter=="unread",onClick={filter="unread"},label={Text(stringResource(R.string.comms_unread))})
        FilterChip(filter=="archive",onClick={filter="archive"},label={Text(stringResource(R.string.chat_archive_filter))})
    }
    val term=queryTerm.takeIf(String::isNotEmpty)?.let{"&q=${Uri.encode(it)}"}.orEmpty()
    academicPages(model,"/threads?limit=30&includeEmpty=false&archived=${filter=="archive"}&unread=${filter=="unread"}$term",version+model.attendanceNetworkRevision){threads->
        for(thread in threads){
            TextButton(onClick={open(thread.getString("id"))},modifier=Modifier.fillMaxWidth()){
                Column(Modifier.fillMaxWidth(),verticalArrangement=Arrangement.spacedBy(4.dp)){
                    Text(threadTitle(thread),style=MaterialTheme.typography.titleMedium)
                    thread.string("latestPreview")?.let{Text(isolate(it),maxLines=2)}
                    if(thread.getInt("unread")>0)Text(stringResource(R.string.chat_unread)+" · "+thread.getInt("unread"),color=MaterialTheme.colorScheme.primary)
                }
            }
            HorizontalDivider()
        }
    }
}

@Composable
internal fun ThreadScreen(model:IdentityViewModel,id:String,openReference:(ReportTarget)->Unit,close:()->Unit){
    var changed by remember{mutableStateOf(0)}
    var showDetails by remember(id){mutableStateOf(false)}
    val revision=threadRefreshVersion()+changed
    val thread=academicRead("/threads/$id",revision){model.timetableObject(it)}
    BackHandler(onBack=close)
    Column(Modifier.fillMaxSize().safeDrawingPadding().imePadding().padding(12.dp),
        verticalArrangement=Arrangement.spacedBy(8.dp)){
        TextButton(onClick=close){Text(stringResource(R.string.back))}
        AsyncSurface(thread){value->
            Text(threadTitle(value),style=MaterialTheme.typography.titleLarge,maxLines=2)
            value.string("inbox")?.let{officeTitles[it]}?.let{
                if(value.string("contactName")!=null)Text(stringResource(it))
            }
            val officeCase=value.string("caseId")
            if(value.getJSONArray("references").length()>0||officeCase!=null){
                TextButton(onClick={showDetails=!showDetails}){Text(stringResource(R.string.conversation_references))}
                if(showDetails){
                    Column(Modifier.heightIn(max=180.dp).verticalScroll(rememberScrollState())){
                    value.string("caseStatus")?.let{caseLabels[it]}?.let{Text(stringResource(it))}
                    ReferencedRecords(value,openReference)
                    if(value.optBoolean("canManageCase")&&officeCase!=null)OfficeCaseEditor(model,officeCase,revision){changed++}
                    }
                }
            }
            Conversation(model,value,Modifier.weight(1f)){changed++}
        }
    }
}

@Composable
private fun ReferencedRecords(value:JSONObject,open:(ReportTarget)->Unit){
    val references=value.getJSONArray("references")
    if(references.length()==0)return
    Text(stringResource(R.string.conversation_references),style=MaterialTheme.typography.titleMedium)
    for(index in 0 until references.length()){
        val item=references.getJSONObject(index)
        val kind=item.getString("kind")
        val id=item.getString("id")
        val child=item.string("childId")
        when(kind){
            "homework"->TextButton(onClick={open(ReportTarget(kind,id,child))}){Text(stringResource(R.string.homework_title))}
            "attendance"->TextButton(onClick={open(ReportTarget(kind,id,child))}){Text(stringResource(R.string.report_attendance))}
            "invoice"->TextButton(onClick={open(ReportTarget(kind,id,child))}){Text(stringResource(R.string.conversation_invoice))}
        }
    }
}

@Composable
private fun OfficeCaseEditor(model:IdentityViewModel,id:String,version:Int,changed:()->Unit){
    val view=academicRead("/office-cases/$id",version){model.timetableObject(it)}
    AsyncSurface(view){data->
        if(data.optBoolean("canManage"))key(data.getInt("revision")){
            OfficeCaseForm(model,id,data,changed)
        }
    }
}

@Composable
private fun OfficeCaseForm(model:IdentityViewModel,id:String,data:JSONObject,changed:()->Unit){
    var status by remember{mutableStateOf(data.getString("status"))}
    var assignee by remember{mutableStateOf(data.string("assigneeId"))}
    val attempts=remember{mutableMapOf<String,Pair<String,String>>()}
    val people=data.getJSONArray("delegates")
    Text(stringResource(R.string.conversation_case),style=MaterialTheme.typography.titleMedium)
    for((key,label) in caseLabels){
        FilterChip(status==key,onClick={status=key},label={Text(stringResource(label))})
    }
    Text(stringResource(R.string.conversation_assignee))
    FilterChip(assignee==null,onClick={assignee=null},label={Text(stringResource(R.string.conversation_unassigned))})
    for(index in 0 until people.length()){
        val person=people.getJSONObject(index)
        val account=person.getString("accountId")
        FilterChip(assignee==account,onClick={assignee=account},label={Text(isolate(person.getString("displayName")))})
    }
    val dirty=status!=data.getString("status")||assignee!=data.string("assigneeId")
    Submit(dirty){
        val input=JSONObject().put("revision",data.getInt("revision")).put("status",status).put("assigneeId",assignee?:JSONObject.NULL)
        try{
            model.schoolCommand(attempts,"/office-cases/$id","PATCH",input)
            changed()
        }catch(error:HttpFailure){
            if(error.status in listOf(401,403,404,409))changed()
            throw error
        }
    }
}

@Composable
private fun threadTitle(thread:JSONObject):String{
    val name=thread.string("contactName")
    val office=thread.string("inbox")?.let{officeTitles[it]}
    return name?.let(::isolate)?:stringResource(office?:R.string.conversation_direct)
}

@Composable
private fun threadRefreshVersion():Int{
    var version by remember{mutableStateOf(0)}
    val lifecycle=LocalLifecycleOwner.current.lifecycle
    DisposableEffect(lifecycle){
        val observer=LifecycleEventObserver{_,event->if(event==Lifecycle.Event.ON_RESUME)version++}
        lifecycle.addObserver(observer)
        onDispose{lifecycle.removeObserver(observer)}
    }
    return version
}
