package de.madrasty.app.attendance

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
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import de.madrasty.app.R
import de.madrasty.app.identity.HttpFailure
import de.madrasty.app.api.WirePage
import de.madrasty.app.api.decodeData
import de.madrasty.app.comms.StartConversation
import de.madrasty.app.identity.IdentityViewModel
import de.madrasty.app.identity.loadAccountSurface
import de.madrasty.app.school.Field
import de.madrasty.app.school.Submit
import de.madrasty.app.school.records
import de.madrasty.app.school.schoolCommand
import de.madrasty.app.school.timetableDate
import de.madrasty.app.school.timetableObject
import de.madrasty.app.ui.AsyncState
import de.madrasty.app.ui.AsyncSurface
import de.madrasty.app.ui.isolate
import org.json.JSONArray
import org.json.JSONObject

private val historyStatuses=mapOf(
    "present" to R.string.attendance_present,
    "late" to R.string.attendance_late,
    "absent_unexcused" to R.string.attendance_absent_unexcused,
    "absent_excused" to R.string.attendance_absent_excused,
    "cancelled" to R.string.history_cancelled,
)
private val revisionLabels=mapOf(
    "approval" to R.string.history_approval,
    "correction" to R.string.history_correction,
    "calendar_cancellation" to R.string.history_calendar_correction,
)
private data class HistoryFilters(val from:String="",val to:String="",val status:String="") {
    val valid get()=(from.isEmpty()||timetableDate(from))&&(to.isEmpty()||timetableDate(to))&&
        (from.isEmpty()||to.isEmpty()||from<=to)
    fun query(classId:String?)=buildList {
        add("limit=30")
        if(from.isNotEmpty())add("from=$from")
        if(to.isNotEmpty())add("to=$to")
        if(status.isNotEmpty())add("status=$status")
        if(classId!=null)add("classId=$classId")
    }.joinToString("&")
}
private data class HistoryItems(val entries:List<JSONObject>,val preliminary:List<JSONObject>)

@Composable
fun AttendanceHistoryScreen(
    model:IdentityViewModel,initialChild:String?,classId:String?,initialRow:String?,
    openExcuse:(String,String)->Unit,openThread:(String)->Unit,close:()->Unit,
) {
    var row by remember(initialRow){mutableStateOf(initialRow)}
    var child by remember(initialChild){mutableStateOf(initialChild)}
    val back={if(row!=null)row=null else close()}
    BackHandler(onBack=back)
    Column(Modifier.fillMaxSize().safeDrawingPadding().imePadding().verticalScroll(rememberScrollState()).padding(20.dp),
        verticalArrangement=Arrangement.spacedBy(8.dp)){
        TextButton(onClick=back){Text(stringResource(R.string.back))}
        Text(stringResource(R.string.history_title),style=MaterialTheme.typography.headlineMedium)
        val entry=row
        when {
            entry!=null -> key(entry){AttendanceRecordHistory(model,entry)}
            initialChild!=null -> HistoryChildren(model,child,{child=it}){linked->
                key(linked){AttendanceHistoryList(model,linked,null,{},{date->openExcuse(linked,date)},openThread)}
            }
            else -> AttendanceHistoryList(model,null,classId,{row=it},{},openThread)
        }
    }
}

@Composable
private fun HistoryChildren(model:IdentityViewModel,child:String?,pick:(String)->Unit,content:@Composable (String)->Unit){
    var retry by remember{mutableStateOf(0)}
    var values by remember(model.attendanceNetworkRevision){mutableStateOf<AsyncState<List<JSONObject>>>(AsyncState.InitialLoading())}
    LaunchedEffect(retry,model.attendanceNetworkRevision){
        values=loadAccountSurface({retry++}){model.records("/me/children?limit=100")}
    }
    AsyncSurface(values){children->
        children.forEach{value->
            val id=value.getString("id")
            FilterChip(child==id,onClick={pick(id)},label={Text(isolate(value.getString("displayName")))})
        }
        if(child!=null&&children.any{it.getString("id")==child})content(child)
        else AsyncSurface<Unit>(AsyncState.Forbidden()){}
    }
}

@Composable
private fun AttendanceHistoryList(model:IdentityViewModel,child:String?,classId:String?,openRow:(String)->Unit,openExcuse:(String)->Unit,openThread:(String)->Unit){
    var draft by remember{mutableStateOf(HistoryFilters())}
    var active by remember{mutableStateOf(HistoryFilters())}
    val path=(if(child==null)"/attendance/history" else "/children/$child/attendance")+"?"+active.query(classId)
    var retry by remember{mutableStateOf(0)}
    var state by remember(path,model.attendanceNetworkRevision){
        mutableStateOf<AsyncState<WirePage<HistoryItems>>>(AsyncState.InitialLoading())
    }
    LaunchedEffect(path,retry,model.attendanceNetworkRevision){state=loadAccountSurface({retry++}){historyPage(model,path,child!=null)}}
    Field(R.string.history_from,draft.from){draft=draft.copy(from=it.take(10))}
    Field(R.string.history_to,draft.to){draft=draft.copy(to=it.take(10))}
    if(child==null){
        FilterChip(draft.status.isEmpty(),{draft=draft.copy(status="")},label={Text(stringResource(R.string.history_all))})
        historyStatuses.forEach{(status,label)->
            FilterChip(draft.status==status,{draft=draft.copy(status=status)},label={Text(stringResource(label))})
        }
    }
    TextButton(enabled=draft.valid,onClick={active=draft;retry++}){Text(stringResource(R.string.history_filter))}
    val language=LocalConfiguration.current.locales[0].language
    AsyncSurface(state){page->
        if(page.data.preliminary.isNotEmpty()){
            Text(stringResource(R.string.history_preliminary),style=MaterialTheme.typography.titleMedium)
            page.data.preliminary.forEach{item->
                val date=item.getString("schoolDate")
                TextButton(onClick={openExcuse(date)}){Text(isolate(date))}
            }
        }
        if(page.data.entries.isEmpty())Text(stringResource(R.string.empty))
        page.data.entries.forEach{value->
            HorizontalDivider()
            val title=isolate(value.getString("studentName"))+" · "+isolate(value.getString("schoolDate"))
            val schoolClass=isolate(value.getString("classCode"))+" · "+
                isolate(value.getString(if(language=="de")"classNameDe" else "classNameAr"))
            val status=if(value.getBoolean("cancelled"))"cancelled" else value.optString("status")
            Text(title,style=MaterialTheme.typography.titleMedium)
            Text(schoolClass)
            Text(stringResource(historyStatuses[status]?:R.string.attendance_unmarked))
            if(child!=null&&status in setOf("absent_excused","absent_unexcused")){
                StartConversation(model,"office","student_affairs","attendance",value.getString("id"),R.string.conversation_attendance,openThread)
            }
            if(child==null)TextButton(onClick={openRow(value.getString("id"))}){Text(stringResource(R.string.history_detail))}
        }
        page.nextCursor?.let{cursor->
            Submit(true,R.string.staff_more,success=null){
                try{
                    val more=historyPage(model,"$path&cursor=${Uri.encode(cursor)}",child!=null)
                    if((state as? AsyncState.Ready)?.content==page){
                        state=AsyncState.Ready(WirePage(HistoryItems(page.data.entries+more.data.entries,page.data.preliminary),more.nextCursor))
                    }
                }catch(error:HttpFailure){
                    if(error.status in listOf(401,403,404))state=AsyncState.Forbidden()
                    throw error
                }
            }
        }
    }
}

private suspend fun historyPage(model:IdentityViewModel,path:String,guardian:Boolean)=decodeData(model.schoolRequest(path)){data->
    if(!guardian)HistoryItems((data as JSONArray).historyObjects(),emptyList())
    else (data as JSONObject).let{HistoryItems(it.getJSONArray("entries").historyObjects(),it.getJSONArray("ownPreliminary").historyObjects())}
}

private enum class HistoryEdit{Correction,CancelDay}
private data class ReviewedHistoryEdit(val body:JSONObject,val label:Int,val endpoint:String)

@Composable
private fun AttendanceRecordHistory(model:IdentityViewModel,id:String){
    val path="/attendance/rows/$id"
    var reload by remember{mutableStateOf(0)}
    var state by remember(model.attendanceNetworkRevision){mutableStateOf<AsyncState<JSONObject>>(AsyncState.InitialLoading())}
    LaunchedEffect(reload,model.attendanceNetworkRevision){state=loadAccountSurface({reload++}){model.timetableObject("$path/history")}}
    AsyncSurface(state){value->
        val row=value.getJSONObject("row")
        Text(isolate(row.getString("displayName")),style=MaterialTheme.typography.titleLarge)
        Text(isolate(value.getString("schoolDate")))
        val cancelled=value.getBoolean("calendarCancelled")
        if(cancelled)Text(stringResource(R.string.history_cancelled))
        Text(stringResource(historyStatuses[row.optString("status")]?:R.string.attendance_unmarked))
        value.getJSONArray("revisions").historyObjects().forEach{item->
            HorizontalDivider()
            Text(stringResource(revisionLabels.getValue(item.getString("kind"))),style=MaterialTheme.typography.titleMedium)
            Text(isolate(item.getString("occurredAt")))
            if(!item.isNull("actorName"))Text(isolate(item.getString("actorName")))
            val previous=historyStatuses[item.optString("priorStatus")]
            if(previous!=null)Text(stringResource(R.string.history_previous)+" · "+stringResource(previous))
            Text(stringResource(historyStatuses.getValue(item.getString("status"))))
            if(!item.isNull("reason"))Text(isolate(item.getString("reason")))
        }
        if(value.getBoolean("canCorrect")||value.getBoolean("canCancel")){
            HistoryCorrectionEditor(model,path,value,row,cancelled){reload++}
        }
    }
}

@Composable
private fun HistoryCorrectionEditor(model:IdentityViewModel,path:String,value:JSONObject,row:JSONObject,cancelled:Boolean,changed:()->Unit){
    var mode by remember{mutableStateOf<HistoryEdit?>(null)}
    var selection by remember{mutableStateOf("")}
    var reason by remember{mutableStateOf("")}
    var preview by remember{mutableStateOf<ReviewedHistoryEdit?>(null)}
    val attempts=remember{mutableMapOf<String,Pair<String,String>>()}
    fun start(edit:HistoryEdit){mode=edit;selection="";reason="";preview=null}
    if(value.getBoolean("canCorrect"))TextButton(onClick={start(HistoryEdit.Correction)}){Text(stringResource(R.string.history_correct))}
    if(value.getBoolean("canCancel"))TextButton(onClick={start(HistoryEdit.CancelDay)}){Text(stringResource(R.string.history_cancel_day))}
    val active=mode?:return
    if(active==HistoryEdit.Correction){
        historyStatuses.filterKeys{it!="cancelled"&&it!=row.optString("status")&&(!cancelled||it!="absent_unexcused")}.forEach{(status,label)->
            FilterChip(selection==status,onClick={selection=status;preview=null},label={Text(stringResource(label))})
        }
    }else Text(stringResource(R.string.history_cancel_explain))
    Field(R.string.history_reason,reason){reason=it.take(500);preview=null}
    TextButton(enabled=reason.isNotBlank()&&(active==HistoryEdit.CancelDay||selection.isNotEmpty()),onClick={
        val body=JSONObject().put("reason",reason.trim())
        preview=if(active==HistoryEdit.Correction)ReviewedHistoryEdit(
            body.put("status",selection).put("revision",row.getInt("revision")),R.string.history_confirm,"$path/corrections",
        )else ReviewedHistoryEdit(body.put("approvalRevision",value.getInt("approvalRevision")),R.string.history_confirm_cancel,
            "/attendance/sheets/${value.getString("sheetId")}/cancel-for-calendar")
    }){Text(stringResource(R.string.history_preview))}
    preview?.let{review->
        Text(isolate(review.body.getString("reason")))
        historyStatuses[review.body.optString("status")]?.let{Text(stringResource(it))}
        Submit(true,review.label){
            try{
                model.schoolCommand(attempts,review.endpoint,"POST",review.body)
                mode=null;reason="";selection="";preview=null
                changed()
            }catch(error:HttpFailure){
                if(error.status in listOf(401,403,404,409)){preview=null;changed()}
                throw error
            }
        }
    }
}
private fun JSONArray.historyObjects()=List(length(),::getJSONObject)
