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
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import de.madrasty.app.R
import de.madrasty.app.api.decodeData
import de.madrasty.app.identity.HttpFailure
import de.madrasty.app.identity.IdentityViewModel
import de.madrasty.app.school.Field
import de.madrasty.app.school.Submit
import de.madrasty.app.school.scheduleRead
import de.madrasty.app.school.schoolCommand
import de.madrasty.app.school.tableRows
import de.madrasty.app.school.timetableDate
import de.madrasty.app.school.timetableObject
import de.madrasty.app.ui.AsyncState
import de.madrasty.app.ui.AsyncSurface
import de.madrasty.app.ui.isolate
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.json.JSONObject
import java.time.Instant
import java.util.UUID

private val outcomes=mapOf("pending" to R.string.excuse_received,"withdrawn" to R.string.excuse_withdrawn,"superseded" to R.string.attendance_arrival)

@Composable
fun FamilyExcuseScreen(model:IdentityViewModel,child:String,initialDate:String?=null,close:()->Unit) {
    val lifecycle=LocalLifecycleOwner.current.lifecycle
    val attempts=remember(child) { mutableMapOf<String,Pair<String,String>>() }
    var day by remember(child,initialDate){mutableStateOf(initialDate.orEmpty())}
    var input by remember(child,initialDate){mutableStateOf(initialDate.orEmpty())}
    val coroutine=rememberCoroutineScope()
    val writes=remember(child){Mutex()}
    var records by remember(child){mutableStateOf(emptyMap<String,JSONObject>())}
    var storageFailed by remember(child){mutableStateOf(false)}
    var withdraw by remember(child,day){mutableStateOf<JSONObject?>(null)}
    var refresh by remember(child){mutableStateOf(0)}
    val base="/children/$child/attendance/excuses"
    val result=scheduleRead(base+if(day.isEmpty())"" else "?date=$day",refresh+model.attendanceNetworkRevision,model::timetableObject)
    val confirmed=(result as? AsyncState.Ready)?.content
    val language=androidx.compose.ui.platform.LocalConfiguration.current.locales[0].language
    suspend fun persist(record:JSONObject){
        val date=record.getString("schoolDate")
        records=records+(date to record)
        storageFailed=!writes.withLock{model.saveAttendanceDraft(familyDraftSlot(child,date),record)}
    }
    LaunchedEffect(confirmed){
        if(confirmed!=null){
            val date=confirmed.getString("schoolDate")
            val current=records[date]?:model.readAttendanceDraft(familyDraftSlot(child,date))
            val attempt=current?.optJSONObject("inFlight")
            val sent=attempt!=null&&confirmed.getJSONArray("receipts").tableRows().any{
                it.getString("state")=="pending"&&it.getString("reason")==attempt.getString("reason")
            }
            val expiry=model.session?.expiresAt?.let{Instant.parse(it).toEpochMilli()}?:return@LaunchedEffect
            val value=JSONObject().put("kind","excuse").put("child",confirmed.getJSONObject("child")).put("schoolDate",date)
                .put("validUntil",expiry).put("confirmedAt",Instant.now().toString()).put("teachingDay",confirmed.getBoolean("teachingDay"))
                .put("reason",if(sent)"" else current?.optString("reason").orEmpty()).putOpt("inFlight",if(sent)null else attempt)
            persist(value)
        }
    }
    LaunchedEffect(result is AsyncState.Forbidden) {
        if(result is AsyncState.Forbidden){
            records=emptyMap()
            writes.withLock{model.purgeAttendanceDrafts("excuse/$child/")}
        }
    }
    var fallback by remember(child,day){mutableStateOf<JSONObject?>(null)}
    LaunchedEffect(result is AsyncState.Error,day){
        if(result is AsyncState.Error){
            fallback=if(day.isNotEmpty())model.readAttendanceDraft(familyDraftSlot(child,day))
            else model.listAttendanceDrafts().firstOrNull{it.first.startsWith("excuse/$child/")}?.second
        }
    }
    DisposableEffect(lifecycle) {
        val observer=LifecycleEventObserver { _,event -> if(event==Lifecycle.Event.ON_RESUME)refresh++ }
        lifecycle.addObserver(observer)
        onDispose { lifecycle.removeObserver(observer) }
    }
    BackHandler(onBack=close)
    Column(Modifier.fillMaxSize().safeDrawingPadding().imePadding().verticalScroll(rememberScrollState()).padding(20.dp),
        verticalArrangement=Arrangement.spacedBy(8.dp)) {
        TextButton(onClick=close){Text(stringResource(R.string.back))}
        Text(stringResource(R.string.excuse_title),style=MaterialTheme.typography.headlineMedium)
        Field(R.string.excuse_date,input){input=it.take(10)}
        TextButton(enabled=timetableDate(input)&&day!=input,onClick={day=input}) {Text(stringResource(R.string.attendance_day_action))}
        val cached=fallback
        if(result is AsyncState.Error&&cached!=null){
            val date=cached.getString("schoolDate")
            CachedAttendanceEditor(model,familyDraftSlot(child,date),cached,language){updated->records=records+(date to updated)}
        }else AsyncSurface(result){ data->
            val date=data.getString("schoolDate")
            val current=records[date]
            val reason=current?.optString("reason").orEmpty()
            val receipts=data.getJSONArray("receipts").tableRows()
            val teaching=data.getBoolean("teachingDay")
            Text(isolate(data.getJSONObject("child").getString("displayName")),style=MaterialTheme.typography.titleLarge)
            Text(isolate(date))
            if(storageFailed)Text(stringResource(R.string.offline_storage_failed))
            if(!teaching)Text(stringResource(R.string.excuse_closed))
            if(current!=null && teaching && receipts.none {it.getString("state")=="pending"}){
                OutlinedTextField(reason,{updated->
                    coroutine.launch{persist(JSONObject(current.toString()).put("reason",updated.take(500)))}
                },Modifier.fillMaxWidth(),
                    label={Text(stringResource(R.string.excuse_reason))},minLines=3,maxLines=5)
                if(reason.isNotEmpty())Text(stringResource(R.string.excuse_draft))
                Submit(reason.isNotBlank(),R.string.excuse_send,success=null){
                    val sentReason=reason.trim()
                    val previous=current.optJSONObject("inFlight")
                    val candidate=previous?.takeIf{it.getString("reason")==sentReason}
                        ?: JSONObject().put("key",UUID.randomUUID().toString()).put("reason",sentReason)
                    persist(JSONObject(current.toString()).put("inFlight",candidate))
                    val body=JSONObject().put("schoolDate",date).put("reason",sentReason)
                    try{
                        val response=model.schoolRequest(base,body,"POST",candidate.getString("key"))
                        decodeData(response){it as JSONObject}
                        persist(JSONObject(current.toString()).put("reason","").apply{remove("inFlight")})
                        refresh++
                    }catch(error:HttpFailure){
                        if(error.status<500)refresh++
                        throw error
                    }
                }
            }
            if(receipts.isNotEmpty())Text(stringResource(R.string.excuse_history),style=MaterialTheme.typography.titleLarge)
            receipts.forEach{ row->
                HorizontalDivider()
                Text(stringResource(outcomes.getValue(row.getString("state"))),style=MaterialTheme.typography.titleMedium)
                Text(isolate(row.getString("reason")))
                if(row.getBoolean("withdrawable"))TextButton(onClick={withdraw=row}){Text(stringResource(R.string.excuse_withdraw))}
            }
            withdraw?.let { item->
                AlertDialog(onDismissRequest={withdraw=null},title={Text(stringResource(R.string.excuse_withdraw_confirm))},
                    confirmButton={
                        Submit(true,R.string.excuse_withdraw_confirm,success=null){
                            model.schoolCommand(attempts,"$base/${item.getString("id")}/withdraw","POST",
                                JSONObject().put("revision",item.getInt("revision")))
                            withdraw=null
                            refresh++
                        }
                    },
                    dismissButton={TextButton(onClick={withdraw=null}){Text(stringResource(R.string.cancel))}})
            }
        }
    }
}
