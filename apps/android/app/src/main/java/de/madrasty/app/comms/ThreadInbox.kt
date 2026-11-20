package de.madrasty.app.comms

import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
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
private val inboxFilters=listOf(
    "" to R.string.directory_all,"kind=direct" to R.string.conversation_direct,"kind=office" to R.string.conversation_office,
    "inbox=student_affairs" to R.string.conversation_student_affairs,"inbox=accounts" to R.string.conversation_accounts,
)

@Composable
internal fun ThreadInbox(model:IdentityViewModel,directory:()->Unit,open:(String)->Unit){
    val version=threadRefreshVersion()
    var filter by remember{mutableStateOf("")}
    var search by remember{mutableStateOf("")}
    var queryTerm by remember{mutableStateOf("")}
    var archived by remember{mutableStateOf(false)}
    TextButton(onClick=directory){Text(stringResource(R.string.directory_title))}
    FilterChip(archived,onClick={archived=!archived},label={Text(stringResource(R.string.chat_archive_filter))})
    Field(R.string.chat_search_inbox,search){search=it.take(120)}
    TextButton(onClick={queryTerm=search.trim()}){Text(stringResource(R.string.staff_search))}
    for((key,label) in inboxFilters){
        FilterChip(filter==key,onClick={filter=key},label={Text(stringResource(label))})
    }
    val query=filter.takeIf(String::isNotEmpty)?.let{"&$it"}.orEmpty()
    val term=queryTerm.takeIf(String::isNotEmpty)?.let{"&q=${Uri.encode(it)}"}.orEmpty()
    academicPages(model,"/threads?limit=30$query&archived=$archived$term",version+model.attendanceNetworkRevision){threads->
        for(thread in threads){
            TextButton(onClick={open(thread.getString("id"))}){
                Column {
                    Text(threadTitle(thread))
                    thread.string("caseStatus")?.let{caseLabels[it]}?.let{Text(stringResource(it))}
                    thread.string("latestPreview")?.let{Text(isolate(it))}
                    if(thread.getInt("unread")>0)Text(stringResource(R.string.chat_unread)+" · "+thread.getInt("unread"))
                }
            }
        }
    }
}

@Composable
internal fun ThreadScreen(model:IdentityViewModel,id:String,openReference:(ReportTarget)->Unit,close:()->Unit){
    var changed by remember{mutableStateOf(0)}
    val revision=threadRefreshVersion()+changed
    val thread=academicRead("/threads/$id",revision){model.timetableObject(it)}
    BackHandler(onBack=close)
    Column(Modifier.fillMaxSize().safeDrawingPadding().imePadding().verticalScroll(rememberScrollState()).padding(20.dp),
        verticalArrangement=Arrangement.spacedBy(8.dp)){
        TextButton(onClick=close){Text(stringResource(R.string.back))}
        AsyncSurface(thread){value->
            Text(threadTitle(value),style=MaterialTheme.typography.headlineMedium)
            value.string("inbox")?.let{officeTitles[it]}?.let{
                if(value.string("contactName")!=null)Text(stringResource(it))
            }
            value.string("caseStatus")?.let{caseLabels[it]}?.let{Text(stringResource(it))}
            ReferencedRecords(value,openReference)
            val officeCase=value.string("caseId")
            if(value.optBoolean("canManageCase")&&officeCase!=null)OfficeCaseEditor(model,officeCase,revision){changed++}
            Conversation(model,value){changed++}
            TextButton(onClick={changed++}){Text(stringResource(R.string.curriculum_refresh))}
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
            "invoice"->Text(stringResource(R.string.conversation_invoice))
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
