package de.madrasty.app.attendance

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
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
import de.madrasty.app.identity.IdentityViewModel
import de.madrasty.app.identity.HttpFailure
import de.madrasty.app.identity.SchoolSession
import de.madrasty.app.school.classLabel
import de.madrasty.app.school.tableRows
import de.madrasty.app.school.timetableObject
import de.madrasty.app.ui.isolate
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.json.JSONObject
import java.time.Instant

@Composable
fun OfflineAttendanceScreen(model:IdentityViewModel,session:SchoolSession,close:(()->Unit)?=null) {
    val lifecycle=LocalLifecycleOwner.current.lifecycle
    val language=LocalConfiguration.current.locales[0].language
    var records by remember(session.actor){mutableStateOf<List<Pair<String,JSONObject>>?>(null)}
    var selected by remember(session.actor){mutableStateOf(model.attendanceResume)}
    var confirm by remember{mutableStateOf(false)}
    var checked by remember(session.actor){mutableStateOf<String?>(null)}
    val deadline=Instant.parse(session.expiresAt).toEpochMilli()
    val offlineOnly=session.offlineOnly
    fun select(slot:String?){selected=slot;checked=null;if(offlineOnly)model.pickAttendanceResume(slot)}

    LaunchedEffect(session.actor){
        records=model.listAttendanceDrafts()
    }
    val itemDeadline=records?.find{it.first==selected}?.second?.optLong("validUntil",deadline)?:deadline
    val currentExpiry=minOf(deadline,itemDeadline)
    LaunchedEffect(currentExpiry,offlineOnly){
        delay((currentExpiry-System.currentTimeMillis()).coerceAtLeast(0))
        if(currentExpiry<deadline){
            select(null)
            records=model.listAttendanceDrafts()
        }else{
            records=emptyList()
            if(offlineOnly)model.endExpiredAttendance()
        }
    }
    LaunchedEffect(selected,model.attendanceNetworkRevision,offlineOnly){
        val slot=selected?:return@LaunchedEffect
        checked=null
        if(offlineOnly||!model.hasValidatedNetwork()){
            checked=slot
            return@LaunchedEffect
        }
        val (kind,id,date)=slot.split('/')
        val path=if(kind=="excuse")"/children/$id/attendance/excuses?date=$date"
            else "/attendance/classes/$id/days/$date"
        try{
            val value=model.timetableObject(path)
            if(kind=="sheet"&&(!value.getBoolean("canMark")||!value.getBoolean("teachingDay")||value.getString("state")!="open")){
                records=records?.map{(key,record)->key to if(key==slot)JSONObject(record.toString()).put("readonly",true) else record}
            }
            checked=slot
        }catch(error:CancellationException){throw error}
        catch(error:HttpFailure){
            if(error.status in listOf(401,403,404)){
                model.purgeAttendanceDrafts("$kind/$id/")
                records=model.listAttendanceDrafts()
                select(null)
            }else checked=slot
        }catch(_:Exception){checked=slot}
    }
    DisposableEffect(lifecycle,offlineOnly){
        val focus=LifecycleEventObserver { _,event->if(event==Lifecycle.Event.ON_RESUME&&offlineOnly)model.reconnectAttendance() }
        lifecycle.addObserver(focus)
        onDispose{lifecycle.removeObserver(focus)}
    }
    BackHandler(enabled=selected!=null||close!=null) {
        if(selected!=null)select(null) else close?.invoke()
    }
    Column(Modifier.fillMaxSize().safeDrawingPadding().imePadding().verticalScroll(rememberScrollState()).padding(20.dp),
        verticalArrangement=Arrangement.spacedBy(8.dp)){
        val items=records
        val target=items?.find{it.first==selected}
        if(close!=null||target!=null)TextButton(onClick={if(target!=null)select(null) else close?.invoke()}) {
            Text(stringResource(R.string.back))
        }
        Text(stringResource(R.string.drafts_on_device),style=MaterialTheme.typography.headlineMedium)
        if(offlineOnly)TextButton(onClick=model::reconnectAttendance) {Text(stringResource(R.string.retry))}
        if(items==null)Text(stringResource(R.string.loading))
        if(items!=null&&items.isEmpty())Text(stringResource(R.string.offline_no_roster))
        if(target!=null&&checked!=target.first)Text(stringResource(R.string.loading))
        if(target!=null&&checked==target.first)key(target.first){
            CachedAttendanceEditor(model,target.first,target.second,language){updated->
                records=records?.map{if(it.first==target.first)it.first to updated else it}
            }
        } else if(target==null) items?.forEach{(slot,entry)->
            val title=if(entry.getString("kind")=="excuse")entry.getJSONObject("child").getString("displayName")
                else classLabel(entry.getJSONObject("classroom"),language)
            TextButton(onClick={select(slot)}){Text(isolate(title)+" · "+isolate(entry.getString("schoolDate")))}
        }
        if(offlineOnly){
            TextButton(onClick={confirm=true}){Text(stringResource(R.string.sign_out))}
            if(confirm)AlertDialog(onDismissRequest={confirm=false},title={Text(stringResource(R.string.offline_purge_confirm))},
                confirmButton={TextButton(onClick={confirm=false;model.signOut(false)}){Text(stringResource(R.string.sign_out))}},
                dismissButton={TextButton(onClick={confirm=false}){Text(stringResource(R.string.cancel))}})
        }
    }
}

private val localMarks=mapOf(
    "" to R.string.attendance_unmarked,"present" to R.string.attendance_present,"late" to R.string.attendance_late,
    "absent_unexcused" to R.string.attendance_absent_unexcused,"absent_excused" to R.string.attendance_absent_excused,
)

@Composable
internal fun CachedAttendanceEditor(model:IdentityViewModel,slot:String,initial:JSONObject,language:String,
    changed:(JSONObject)->Unit={}){
    var entry by remember(slot){mutableStateOf(initial)}
    var failure by remember(slot){mutableStateOf(false)}
    val coroutine=rememberCoroutineScope()
    val writes=remember(slot){Mutex()}
    fun change(value:JSONObject){
        entry=value
        changed(value)
        coroutine.launch{writes.withLock{failure=!model.saveAttendanceDraft(slot,value)}}
    }
    Text(stringResource(R.string.offline_copy))
    Text(stringResource(R.string.offline_confirmed)+" · "+isolate(entry.getString("confirmedAt")))
    if(failure)Text(stringResource(R.string.offline_storage_failed))
    if(entry.getString("kind")=="excuse"){
        Text(isolate(entry.getJSONObject("child").getString("displayName")),style=MaterialTheme.typography.titleLarge)
        Text(isolate(entry.getString("schoolDate")))
        if(entry.getBoolean("teachingDay")){
            Text(stringResource(R.string.excuse_draft))
            OutlinedTextField(entry.getString("reason"),{reason->
                change(JSONObject(entry.toString()).put("reason",reason.take(500)))
            },Modifier.fillMaxWidth(),label={Text(stringResource(R.string.excuse_reason))},minLines=3,maxLines=5)
        }else Text(stringResource(R.string.excuse_closed))
        return
    }
    Text(classLabel(entry.getJSONObject("classroom"),language),style=MaterialTheme.typography.titleLarge)
    Text(isolate(entry.getString("schoolDate")))
    val readOnly=entry.getBoolean("readonly")
    val drafts=entry.draftEdits()
    Text(stringResource(R.string.offline_unsent,drafts.size))
    if(readOnly)Text(stringResource(R.string.read_only))
    for(row in entry.getJSONArray("rows").tableRows()){
        val id=row.getString("id")
        val status=row.optString("status").takeUnless{row.isNull("status")}
        HorizontalDivider()
        Text(isolate(row.getString("displayName")))
        Text(isolate(row.getString("studentNumber")))
        if(readOnly||row.getBoolean("locked")||row.getBoolean("arrival")){
            Text(stringResource(localMarks.getValue(status.orEmpty())))
            if(row.getBoolean("locked"))Text(stringResource(R.string.attendance_locked))
            if(row.getBoolean("arrival"))Text(stringResource(R.string.attendance_arrival))
        }else{
            val selected=if(id in drafts)drafts[id]?.status else status
            for((option,label) in localMarks){
                val value=option.takeIf(String::isNotEmpty)
                FilterChip(selected==value,onClick={
                    val next=if(value==status)drafts-id else drafts+(id to DraftChange(value,row.getInt("revision")))
                    change(JSONObject(entry.toString()).put("drafts",encodeDrafts(next)).put("sync",true))
                },label={Text(stringResource(label))})
            }
        }
    }
}
