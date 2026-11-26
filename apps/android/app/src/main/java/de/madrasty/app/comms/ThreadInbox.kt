package de.madrasty.app.comms

import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.IconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.ui.res.painterResource
import androidx.compose.runtime.rememberCoroutineScope
import de.madrasty.app.ui.InterfaceSettingsAction
import kotlinx.coroutines.launch
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.clickable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.ui.Alignment
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.material3.Surface
import androidx.compose.material3.Badge
import androidx.compose.material3.ListItem
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
import de.madrasty.app.ui.AsyncState
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import de.madrasty.app.ui.isolate
import org.json.JSONObject

private val officeTitles=mapOf("student_affairs" to R.string.conversation_student_affairs,"accounts" to R.string.conversation_accounts)
private val caseLabels=mapOf(
    "open" to R.string.conversation_case_open,
    "in_progress" to R.string.conversation_case_in_progress,
    "closed" to R.string.conversation_case_closed,
)
// SchoolNavigation is recreated for each account/session/persona.
internal class ThreadInboxState {
    var filter by mutableStateOf("all")
    var search by mutableStateOf("")
    val list=LazyListState()
}
@Composable
internal fun ThreadInbox(model:IdentityViewModel,state:ThreadInboxState,open:(String)->Unit){
    val version=threadRefreshVersion(poll=true)
    val scope=rememberCoroutineScope()
    var queryTerm by remember{mutableStateOf(state.search.trim())}
    LaunchedEffect(state.search){delay(250);val next=state.search.trim();if(next!=queryTerm){queryTerm=next;state.list.scrollToItem(0)}}
    Column(Modifier.fillMaxSize(),verticalArrangement=Arrangement.spacedBy(8.dp)){
        OutlinedTextField(value=state.search,onValueChange={state.search=it.take(120)},modifier=Modifier.fillMaxWidth(),
            singleLine=true,placeholder={Text(stringResource(R.string.chat_search_inbox))},
            leadingIcon={Icon(painterResource(R.drawable.ic_comms_search),contentDescription=null)})
        FlowRow(horizontalArrangement=Arrangement.spacedBy(4.dp)){
            for((filter,label) in listOf("all" to R.string.directory_all,"unread" to R.string.comms_unread,"archive" to R.string.chat_archive_filter)){
                FilterChip(state.filter==filter,onClick={if(state.filter!=filter){state.filter=filter;scope.launch{state.list.scrollToItem(0)}}},label={Text(stringResource(label))})
            }
        }
        val term=queryTerm.takeIf(String::isNotEmpty)?.let{"&q=${Uri.encode(it)}"}.orEmpty()
        academicPages(model,"/threads?limit=30&includeEmpty=false&archived=${state.filter=="archive"}&unread=${state.filter=="unread"}$term",version+model.attendanceNetworkRevision){threads->
            ThreadRows(threads,state.list,Modifier.weight(1f),open)
        }
    }
}

@Composable
internal fun ThreadRows(threads:List<JSONObject>,state:LazyListState,modifier:Modifier=Modifier,open:(String)->Unit){
    LazyColumn(modifier.fillMaxWidth(),state=state,contentPadding=PaddingValues(bottom=84.dp)){
        items(threads.distinctBy{it.getString("id")},key={it.getString("id")}){thread->
            ListItem(modifier=Modifier.fillMaxWidth().clickable{open(thread.getString("id"))},
                headlineContent={Text(threadTitle(thread),maxLines=2,overflow=TextOverflow.Ellipsis)},
                supportingContent={thread.string("latestPreview")?.let{Text(isolate(it),maxLines=2,overflow=TextOverflow.Ellipsis)}},
                leadingContent={ThreadAvatar(thread)},
                trailingContent={
                    Column(horizontalAlignment=Alignment.End,verticalArrangement=Arrangement.spacedBy(4.dp)){
                        thread.string("activityAt")?.let{stamp->
                            val locale=java.util.Locale.forLanguageTag(androidx.compose.ui.platform.LocalConfiguration.current.locales[0].language)
                            val date=runCatching{java.time.Instant.parse(stamp).atZone(java.time.ZoneId.systemDefault())}.getOrNull()
                            if(date!=null){
                                val format=if(date.toLocalDate()==java.time.LocalDate.now())java.time.format.DateTimeFormatter.ofLocalizedTime(java.time.format.FormatStyle.SHORT) else java.time.format.DateTimeFormatter.ofPattern("d MMM",locale)
                                Text(date.format(format.withLocale(locale)),style=MaterialTheme.typography.labelSmall)
                            }
                        }
                        if(thread.optInt("unread")>0){val label=stringResource(R.string.chat_unread)+" "+thread.optInt("unread");Badge(Modifier.semantics{contentDescription=label}){Text(thread.optInt("unread").toString())}}
                    }
                })
            HorizontalDivider()
        }
    }
}

@Composable
private fun ThreadBack(close:()->Unit){
    IconButton(onClick=close,modifier=Modifier.size(48.dp)){
        Icon(painterResource(R.drawable.ic_comms_back),contentDescription=stringResource(R.string.back))
    }
}
@Composable
internal fun ThreadScreen(model:IdentityViewModel,id:String,drafts:NativeChatDrafts,openReference:(ReportTarget)->Unit,close:()->Unit){
    var changed by remember{mutableStateOf(0)}
    var showDetails by remember(id){mutableStateOf(false)}
    val revision=threadRefreshVersion()+changed
    val thread=academicRead("/threads/$id",revision){model.timetableObject(it)}
    BackHandler(onBack=close)
    Column(Modifier.fillMaxSize().safeDrawingPadding().imePadding().padding(12.dp),
        verticalArrangement=Arrangement.spacedBy(8.dp)){
        if(thread is AsyncState.InitialLoading||thread is AsyncState.Error||thread is AsyncState.Offline||thread is AsyncState.Forbidden)Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween){ThreadBack(close);InterfaceSettingsAction()}
        AsyncSurface(thread){value->
            Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(8.dp)){
                ThreadBack(close)
                ThreadAvatar(value)
                Text(threadTitle(value),modifier=Modifier.weight(1f),style=MaterialTheme.typography.titleMedium,maxLines=2,overflow=TextOverflow.Ellipsis)
                InterfaceSettingsAction()
            }
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
            Conversation(model,value,Modifier.weight(1f),drafts){changed++}
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
private fun ThreadAvatar(thread:JSONObject){
    val name=thread.string("contactName")?.trim().orEmpty()
    Surface(Modifier.size(44.dp),shape=CircleShape,color=MaterialTheme.colorScheme.secondaryContainer){
        Box(contentAlignment=Alignment.Center){Text(name.firstOrNull()?.uppercase()?: "•",style=MaterialTheme.typography.titleMedium)}
    }
}

@Composable
private fun threadRefreshVersion(poll:Boolean=false):Int{
    var version by remember{mutableStateOf(0)}
    val lifecycle=LocalLifecycleOwner.current.lifecycle
    LaunchedEffect(lifecycle,poll){if(poll)while(true){delay(15000);if(lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED))version++}}
    DisposableEffect(lifecycle){
        val observer=LifecycleEventObserver{_,event->if(event==Lifecycle.Event.ON_RESUME)version++}
        lifecycle.addObserver(observer)
        onDispose{lifecycle.removeObserver(observer)}
    }
    return version
}
