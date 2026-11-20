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
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import de.madrasty.app.R
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
import org.json.JSONObject

private val outcomes=mapOf("pending" to R.string.excuse_received,"withdrawn" to R.string.excuse_withdrawn,"superseded" to R.string.attendance_arrival)

@Composable
fun FamilyExcuseScreen(model:IdentityViewModel,child:String,close:()->Unit) {
    val lifecycle=LocalLifecycleOwner.current.lifecycle
    val attempts=remember(child) { mutableMapOf<String,Pair<String,String>>() }
    var day by remember(child){mutableStateOf("")}
    var input by remember(child){mutableStateOf("")}
    var drafts by remember(child){mutableStateOf(emptyMap<String,String>())}
    var withdraw by remember(child,day){mutableStateOf<JSONObject?>(null)}
    var refresh by remember(child){mutableStateOf(0)}
    val base="/children/$child/attendance/excuses"
    val result=scheduleRead(base+if(day.isEmpty())"" else "?date=$day",refresh,model::timetableObject)
    LaunchedEffect(result is AsyncState.Forbidden) { if(result is AsyncState.Forbidden)drafts=emptyMap() }
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
        AsyncSurface(result){ data->
            val date=data.getString("schoolDate")
            val reason=drafts[date].orEmpty()
            val receipts=data.getJSONArray("receipts").tableRows()
            val teaching=data.getBoolean("teachingDay")
            Text(isolate(data.getJSONObject("child").getString("displayName")),style=MaterialTheme.typography.titleLarge)
            Text(isolate(date))
            if(!teaching)Text(stringResource(R.string.excuse_closed))
            if(teaching && receipts.none {it.getString("state")=="pending"}){
                OutlinedTextField(reason,{drafts=drafts+(date to it.take(500))},Modifier.fillMaxWidth(),
                    label={Text(stringResource(R.string.excuse_reason))},minLines=3,maxLines=5)
                if(reason.isNotEmpty())Text(stringResource(R.string.excuse_draft))
                Submit(reason.isNotBlank(),R.string.excuse_send,success=null){
                    model.schoolCommand(attempts,base,"POST",JSONObject().put("schoolDate",date).put("reason",reason.trim()))
                    drafts=drafts-date
                    refresh++
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
