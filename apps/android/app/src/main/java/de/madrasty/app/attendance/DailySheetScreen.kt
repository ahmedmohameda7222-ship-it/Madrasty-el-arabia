package de.madrasty.app.attendance

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import de.madrasty.app.R
import de.madrasty.app.api.WirePage
import de.madrasty.app.api.decodeData
import de.madrasty.app.identity.HttpFailure
import de.madrasty.app.identity.IdentityViewModel
import de.madrasty.app.identity.loadAccountSurface
import de.madrasty.app.school.Field
import de.madrasty.app.school.Submit
import de.madrasty.app.school.classLabel
import de.madrasty.app.school.schoolCommand
import de.madrasty.app.school.tableRows
import de.madrasty.app.school.timetableDate
import de.madrasty.app.school.timetableObject
import de.madrasty.app.ui.AsyncState
import de.madrasty.app.ui.AsyncSurface
import de.madrasty.app.ui.isolate
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject

private val marks = mapOf(
    "" to R.string.attendance_unmarked,
    "present" to R.string.attendance_present,
    "late" to R.string.attendance_late,
    "absent_unexcused" to R.string.attendance_absent_unexcused,
    "absent_excused" to R.string.attendance_absent_excused,
)
private val conflictLabels = mapOf(
    "stale" to R.string.attendance_stale,"locked" to R.string.attendance_locked,
    "arrival_confirmed" to R.string.attendance_arrival,"outside_roster" to R.string.attendance_outside,
)

private data class Confirmation(val approval:Boolean,val rows:JSONArray,val approvalRevision:Int?=null)

@Composable
fun SupervisorAttendanceScreen(model:IdentityViewModel,initialClass:String?=null,initialDate:String?=null,openOffline:()->Unit={},close:()->Unit) {
    BackHandler(onBack=close)
    Column(
        Modifier.fillMaxSize().safeDrawingPadding().imePadding().verticalScroll(rememberScrollState()).padding(20.dp),
        verticalArrangement=Arrangement.spacedBy(8.dp),
    ) {
        TextButton(onClick=close) { Text(stringResource(R.string.back)) }
        Text(stringResource(R.string.attendance_review),style=MaterialTheme.typography.headlineMedium)
        DailySheetScreen(model,supervisor=true,initialClass=initialClass,initialDate=initialDate,openOffline=openOffline)
    }
}

@Composable
fun DailySheetScreen(model:IdentityViewModel,supervisor:Boolean=false,initialClass:String?=null,initialDate:String?=null,openOffline:()->Unit={}) {
    val language=if (LocalConfiguration.current.locales[0].language=="de") "de" else "ar"
    var chosen by remember(initialClass) { mutableStateOf(initialClass.orEmpty()) }
    var day by remember(initialDate) { mutableStateOf(initialDate.orEmpty()) }
    var input by remember(initialDate) { mutableStateOf(initialDate.orEmpty()) }
    var refresh by remember { mutableStateOf(0) }
    var retry by remember(day) { mutableStateOf(0) }
    var classes by remember(day) { mutableStateOf<AsyncState<JSONObject>>(AsyncState.InitialLoading()) }
    val lifecycle=LocalLifecycleOwner.current.lifecycle
    DisposableEffect(lifecycle) {
        val observer=LifecycleEventObserver { _,event -> if (event==Lifecycle.Event.ON_RESUME) refresh++ }
        lifecycle.addObserver(observer)
        onDispose { lifecycle.removeObserver(observer) }
    }
    LaunchedEffect(day,refresh,retry,model.attendanceNetworkRevision) {
        val path="/attendance/classes" + if (day.isNotEmpty()) "?date=$day" else ""
        classes=loadAccountSurface({retry++}) {model.timetableObject(path)}
    }
    val known=(classes as? AsyncState.Ready)?.content?.getString("date")
    TextButton(onClick=openOffline){Text(stringResource(R.string.drafts_on_device))}
    Field(R.string.attendance_date,input) { input=it.take(10) }
    TextButton(enabled=timetableDate(input)&&input!=day,onClick={day=input}) { Text(stringResource(R.string.attendance_day_action)) }
    if (day.isNotEmpty()) TextButton(onClick={day="";input=""}) { Text(stringResource(R.string.timetable_current)) }
    if (known != null) Text(isolate(known))
    AsyncSurface(classes) { collection ->
        val date=collection.getString("date")
        val options=collection.getJSONArray("classes").tableRows()
        if (options.isEmpty()) Text(stringResource(R.string.empty))
        else Text(stringResource(R.string.choose_class))
        options.forEach { row ->
            val id=row.getString("id")
            FilterChip(chosen==id,onClick={chosen=id},label={Text(classLabel(row,language))})
        }
        if (supervisor) PendingSheets(model,date,refresh,language) { chosen=it }
        if (options.any { it.getString("id")==chosen }) key(chosen,date) {
            ActiveSheet(model,chosen,date,language,refresh) {refresh++}
        }
    }
}

@Composable
private fun PendingSheets(model:IdentityViewModel,day:String,refresh:Int,language:String,open:(String)->Unit) {
    val path="/attendance/sheets?date=$day"
    var retry by remember(day) { mutableStateOf(0) }
    var results by remember(day,refresh) { mutableStateOf<AsyncState<WirePage<JSONObject>>>(AsyncState.InitialLoading()) }
    LaunchedEffect(day,refresh,retry,model.attendanceNetworkRevision) { results=loadAccountSurface({retry++}) {model.attendancePage(path)} }
    Text(stringResource(R.string.attendance_pending_sheets),style=MaterialTheme.typography.titleLarge)
    AsyncSurface(results) { page ->
        val rows=page.data.getJSONArray("items").tableRows()
        if (rows.isEmpty()) Text(stringResource(R.string.attendance_no_pending))
        rows.forEach { row ->
            TextButton(onClick={open(row.getString("classId"))}) {
                Text(isolate(row.getString("classCode"))+" · "+isolate(row.getString(if(language=="de")"nameDe" else "nameAr")))
            }
        }
        page.nextCursor?.let { cursor ->
            Submit(true,R.string.staff_more,success=null) {
                val next=model.attendancePage("$path&cursor=$cursor")
                if ((results as? AsyncState.Ready)?.content==page) {
                    val merged=JSONArray(rows+next.data.getJSONArray("items").tableRows())
                    results=AsyncState.Ready(WirePage(JSONObject().put("date",day).put("items",merged),next.nextCursor))
                }
            }
        }
    }
}

private suspend fun IdentityViewModel.attendancePage(path:String)=decodeData(schoolRequest(path)) { it as JSONObject }

@Composable
private fun ActiveSheet(model:IdentityViewModel,classId:String,day:String,language:String,refresh:Int,reload:()->Unit) {
    val path="/attendance/classes/$classId/days/$day"
    val attempts=remember { mutableMapOf<String,Pair<String,String>>() }
    val slot=teacherDraftSlot(classId,day)
    val local=remember(slot){AttendanceDraftController(model,slot)}
    val coroutine=rememberCoroutineScope()
    val drafts=local.drafts
    LaunchedEffect(slot){local.load()}
    var conflicts by remember { mutableStateOf(emptyMap<String,String>()) }
    var feedback by remember { mutableStateOf<AttendanceFeedback?>(null) }
    var confirmation by remember { mutableStateOf<Confirmation?>(null) }
    var busy by remember { mutableStateOf(false) }
    var sheet by remember(path) { mutableStateOf<AsyncState<JSONObject>>(AsyncState.InitialLoading()) }
    var patches by remember(path) { mutableStateOf(emptyMap<String,JSONObject>()) }
    var retry by remember(path) { mutableStateOf(0) }
    fun patch(rows:List<JSONObject>){
        val known=(sheet as? AsyncState.Ready)?.content?.getJSONArray("rows")?.tableRows()?.map{it.getString("id")}?.toSet()
        if(known==null||rows.any{it.getString("id") !in known}){reload();return}
        val updates=rows.filter{(patches[it.getString("id")]?.getInt("revision")?:0)<it.getInt("revision")}
        patches=patches+updates.associateBy{it.getString("id")}
    }
    val opened=(sheet as? AsyncState.Ready)?.content?.takeIf{it.getString("state")=="open"}?.getString("id")
    WatchAttendance(model,path,opened,::patch,reload)
    LaunchedEffect(sheet is AsyncState.Forbidden) {
        if (sheet is AsyncState.Forbidden) { local.purge();patches=emptyMap();conflicts=emptyMap();confirmation=null }
    }
    fun discard(id:String) { coroutine.launch{local.edit{it-id}};conflicts=conflicts-id }
    fun select(row:JSONObject,status:String?) {
        val id=row.getString("id")
        if (row.status()==status) discard(id)
        else {
            coroutine.launch{local.edit{it+(id to DraftChange(status,row.getInt("revision")))}}
            conflicts=conflicts-id
        }
    }
    suspend fun submit(action:suspend ()->Unit) {
        if (busy) return
        busy=true
        feedback=null
        try { action() }
        catch (error:CancellationException) { throw error }
        catch (error:HttpFailure) {
            if (error.status in listOf(401,403,404,409)) reload()
            feedback=AttendanceFeedback(when(error.code){
                "closed_day" -> R.string.attendance_closed
                "attendance_incomplete" -> R.string.attendance_incomplete
                "stale_revision","conflict" -> R.string.conflict
                else -> R.string.generic_error
            })
        }
        catch (_:Exception) { feedback=AttendanceFeedback(R.string.generic_error) }
        finally {confirmation=null;busy=false}
    }
    fun apply(response:JSONObject){
        conflicts=response.getJSONArray("conflicts").tableRows().associate{it.getString("rowId") to it.getString("reason")}
        val locked=response.getJSONArray("skippedLocked").length()
        feedback=when {
            conflicts.isNotEmpty()->AttendanceFeedback(R.string.attendance_conflicts)
            locked>0->AttendanceFeedback(R.string.attendance_skipped,locked)
            else->AttendanceFeedback(R.string.saved)
        }
        reload()
    }

    LaunchedEffect(path,refresh,retry,local.ready,model.attendanceNetworkRevision){
        if(!local.ready)return@LaunchedEffect
        val read=loadAccountSurface({retry++}) {model.timetableObject(path)}
        sheet=read
        if(read is AsyncState.Ready){
            local.baseline(read.content)
            if(local.cached?.optBoolean("sync")==true&&!busy){
                submit {
                    val delivered=local.send(read.content,true)
                    delivered.changes?.let(::apply)
                    if(delivered.queued)feedback=AttendanceFeedback(R.string.offline_queued)
                }
            }
        }
    }

    val cached=local.cached
    if(sheet is AsyncState.Error && cached!=null){
        CachedAttendanceEditor(model,slot,cached,language,local::updatedOffline)
        return
    }

    AsyncSurface(sheet) { value ->
        val room=value.getJSONObject("classroom")
        HorizontalDivider()
        Text(classLabel(room,language),style=MaterialTheme.typography.titleLarge)
        Text(isolate(day))
        TextButton(onClick=reload) { Text(stringResource(R.string.attendance_refresh)) }
        val state=value.getString("state")
        val teaching=value.getBoolean("teachingDay")
        val canMark=value.getBoolean("canMark")
        val canApprove=value.getBoolean("canApprove")
        if (!teaching) {
            Text(stringResource(R.string.attendance_closed))
            if(!value.isNull("closedReason"))Text(isolate(value.getString("closedReason")))
        }
        if (state=="unstarted") {
            Text(stringResource(R.string.attendance_unstarted))
            if (canMark||canApprove) Submit(!busy,R.string.attendance_open,success=null) {
                submit { model.schoolCommand(attempts,"$path/open","POST",JSONObject());reload() }
            }
        }
        if (state!="unstarted") {
            val id=value.getString("id")
            val editable=state=="open"&&canMark
            Text(stringResource(if(state=="approved")R.string.attendance_approved else R.string.attendance_draft),style=MaterialTheme.typography.titleLarge)
            if(!editable&&drafts.isNotEmpty())Text(stringResource(R.string.offline_closed_drafts))
            if(local.failed)Text(stringResource(R.string.offline_storage_failed))
            if (state=="approved"&&!value.isNull("approvedAt")) Text(isolate(value.getString("approvedAt")))
            if (state=="open"&&teaching&&!canMark&&!canApprove) Text(stringResource(R.string.read_only))
            val rows=value.getJSONArray("rows").tableRows().map { row ->
                patches[row.getString("id")]?.takeIf{it.getInt("revision")>row.getInt("revision")}?:row
            }
            val counts=rows.groupingBy{it.status().orEmpty()}.eachCount()
            marks.forEach { (status,label) -> Text("${stringResource(label)} · ${counts[status]?:0}") }
            val bulk=rows.filter { it.status()==null&&it.getString("id") !in drafts&&it.isNull("confirmedArrivalAt") }
            val missing=drafts.keys-rows.map{it.getString("id")}.toSet()
            rows.forEach { row ->
                val rowId=row.getString("id")
                val draft=drafts[rowId]
                val reason=conflicts[rowId] ?: if (draft!=null&&draft.revision!=row.getInt("revision")) "stale" else null
                val locked=row.getBoolean("locked")
                val arrived=!row.isNull("confirmedArrivalAt")
                HorizontalDivider()
                Text(isolate(row.getString("displayName")),style=MaterialTheme.typography.titleMedium)
                Text(isolate(row.getString("studentNumber")))
                if(editable&&!locked&&!arrived){
                    val selected=if(draft==null)row.status() else draft.status
                    marks.forEach { (status,label) ->
                        val requested=status.takeIf(String::isNotEmpty)
                        FilterChip(selected==requested,enabled=!busy&&local.ready,onClick={select(row,requested)},label={Text(stringResource(label))})
                    }
                }else Text(stringResource(marks.getValue(row.status().orEmpty())))
                if(locked)Text(stringResource(R.string.attendance_locked))
                if(arrived)Text(stringResource(R.string.attendance_arrival))
                if(locked||editable&&!arrived)key(rowId) {
                    AttendanceRowDetails(model,rowId,editable,row.getInt("revision")) { changed ->
                        discard(rowId)
                        patch(listOf(changed))
                        reload()
                    }
                }
                if(reason!=null){
                    Text(stringResource(conflictLabels.getValue(reason))+" · "+stringResource(marks.getValue(row.status().orEmpty())))
                    TextButton(enabled=!busy,onClick={discard(rowId)}) {Text(stringResource(R.string.attendance_use_server))}
                    if(draft!=null&&editable&&!locked&&!arrived)TextButton(enabled=!busy,onClick={select(row,draft.status)}) {
                        Text(stringResource(R.string.attendance_reapply))
                    }
                }
            }
            missing.forEach { rowId ->
                Text(stringResource(R.string.attendance_outside))
                TextButton(enabled=!busy,onClick={discard(rowId)}) {Text(stringResource(R.string.attendance_use_server))}
            }
            if(editable){
                Submit(!busy&&drafts.isNotEmpty(),R.string.attendance_save,success=null) {
                    submit {
                        val delivered=local.send(value,false)
                        delivered.changes?.let(::apply)
                        if(delivered.queued)feedback=AttendanceFeedback(R.string.offline_queued)
                    }
                }
                TextButton(enabled=!busy&&bulk.isNotEmpty(),onClick={confirmation=Confirmation(false,reviewedRows(bulk))}) {
                    Text(stringResource(R.string.attendance_mark_all))
                }
            }
            if(canApprove){
                TextButton(enabled=!busy&&(counts[""]?:0)==0&&drafts.isEmpty(),onClick={
                    confirmation=Confirmation(true,reviewedRows(rows),value.getInt("approvalRevision"))
                }) {Text(stringResource(R.string.attendance_approve))}
            }
            confirmation?.let { request ->
                val label=if(request.approval)R.string.attendance_confirm_approval else R.string.attendance_confirm_bulk
                AlertDialog(
                    onDismissRequest={confirmation=null},
                    title={Text(stringResource(label))},
                    confirmButton={Submit(!busy,label,success=null){
                        submit {
                            if(request.approval){
                                val payload=JSONObject().put("approvalRevision",request.approvalRevision).put("expectedRows",request.rows)
                                model.schoolCommand(attempts,"/attendance/sheets/$id/approve","POST",payload)
                                feedback=AttendanceFeedback(R.string.attendance_approved)
                                reload()
                            }else{
                                val payload=JSONObject().put("rows",request.rows)
                                apply(model.schoolCommand(attempts,"/attendance/sheets/$id/mark-present","POST",payload))
                            }
                        }
                    }},
                    dismissButton={TextButton(enabled=!busy,onClick={confirmation=null}) {Text(stringResource(R.string.cancel))}},
                )
            }
        }
    }
    feedback?.let { result ->
        Text(result.count?.let{stringResource(result.label,it)}?:stringResource(result.label))
    }
}
private data class AttendanceFeedback(val label:Int,val count:Int?=null)
private fun reviewedRows(rows:List<JSONObject>)=JSONArray(rows.map{
    JSONObject().put("rowId",it.getString("id")).put("revision",it.getInt("revision"))
})
private fun JSONObject.status()=if(isNull("status"))null else getString("status")
