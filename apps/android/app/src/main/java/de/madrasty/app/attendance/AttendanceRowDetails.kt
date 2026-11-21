package de.madrasty.app.attendance

import androidx.compose.foundation.layout.Column
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.repeatOnLifecycle
import de.madrasty.app.R
import de.madrasty.app.identity.HttpFailure
import de.madrasty.app.identity.IdentityViewModel
import de.madrasty.app.school.Submit
import de.madrasty.app.school.scheduleRead
import de.madrasty.app.school.schoolCommand
import de.madrasty.app.school.tableRows
import de.madrasty.app.school.timetableObject
import de.madrasty.app.ui.AsyncSurface
import de.madrasty.app.ui.isolate
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import org.json.JSONObject

@Composable
internal fun AttendanceRowDetails(model:IdentityViewModel,id:String,markable:Boolean,revision:Int,changed:(JSONObject)->Unit){
    val attempts=remember(id){mutableMapOf<String,Pair<String,String>>()}
    var open by remember(id){mutableStateOf(false)}
    var picked by remember(id){mutableStateOf<String?>(null)}
    var review by remember(id,revision){mutableStateOf<Int?>(null)}
    var reload by remember(id){mutableStateOf(0)}
    var stale by remember(id){mutableStateOf(false)}
    val path="/attendance/rows/$id"
    val detail=scheduleRead(if(open)"$path?detail=private" else null,reload,model::timetableObject)
    LaunchedEffect(revision){if(open)reload++}
    if(!open)TextButton(onClick={open=true}){Text(stringResource(R.string.attendance_row_details))}
    else Column{
        TextButton(onClick={open=false;picked=null;review=null;stale=false}){Text(stringResource(R.string.close))}
        AsyncSurface(detail){ data->
            val row=data.getJSONObject("row")
            val current=row.getInt("revision")
            if(!data.isNull("excuseReason")){
                Text(stringResource(R.string.excuse_reason),style=MaterialTheme.typography.titleMedium)
                Text(isolate(data.getString("excuseReason")))
            }
            if(markable&&row.isNull("confirmedArrivalAt")){
                Text(stringResource(R.string.attendance_actual),style=MaterialTheme.typography.titleMedium)
                listOf("present" to R.string.attendance_actual_present,"late" to R.string.attendance_actual_late).forEach{(option,label)->
                    FilterChip(option==picked,onClick={picked=option;review=null},label={Text(stringResource(label))})
                }
                val option=picked
                if(option!=null){
                    if(review!=current) TextButton(onClick={review=current;stale=false}){Text(stringResource(R.string.attendance_actual))}
                    else Submit(true,R.string.attendance_actual_save,success=null){
                        try{
                            val result=model.schoolCommand(attempts,"$path/confirm-arrival","POST",
                                JSONObject().put("status",option).put("revision",current).put("confirm",true))
                            changed(result.getJSONObject("row"))
                            reload++
                        }catch(error:HttpFailure){
                            if(error.code!="stale_revision")throw error
                            stale=true
                            reload++
                        }finally{review=null}
                    }
                }
            }
            if(stale)Text(stringResource(R.string.attendance_arrival_retry))
            if(!row.isNull("confirmedArrivalAt"))Text(stringResource(R.string.attendance_arrival))
        }
    }
}

@Composable
internal fun WatchAttendance(model:IdentityViewModel,path:String,sheetId:String?,patch:(List<JSONObject>)->Unit,refresh:()->Unit){
    val lifecycle=LocalLifecycleOwner.current.lifecycle
    val update by rememberUpdatedState(patch)
    val reload by rememberUpdatedState(refresh)
    LaunchedEffect(model,path,sheetId,lifecycle){
        if(sheetId==null)return@LaunchedEffect
        lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED){
            var cursor:String?=null
            suspend fun process(packet:JSONObject){
                val baseline=cursor==null
                val position=packet.getString("cursor")
                cursor=maxOf(cursor?.toLongOrNull()?:0L,position.toLong()).toString()
                val ids=packet.getJSONArray("rows").tableRows().filter{it.getString("sheetId")==sheetId}
                    .map{it.getString("rowId")}.distinct()
                if(baseline||ids.isEmpty()||ids.size>8)reload()
                else {
                    try {
                        val replies=ids.map{model.timetableObject("/attendance/rows/$it")}
                        if(replies.any{it.getString("sheetId")!=sheetId})reload()
                        else update(replies.map{it.getJSONObject("row")})
                    }catch(error:CancellationException){throw error}
                    catch(_:Exception){reload()}
                }
            }
            try{
                while(isActive){
                    model.attendanceNoticeStream(path,cursor).collect{process(it)}
                    delay(300)
                }
            }catch(error:CancellationException){throw error}
            catch(error:HttpFailure){
                if(error.status in listOf(403,404)){reload();return@repeatOnLifecycle}
            }catch(_:Exception){ /* Authenticated conditional polling handles temporary stream failures. */ }
            var ticks=0
            while(isActive){
                try{
                    val packet=model.timetableObject("$path/changes"+(cursor?.let{"?after=$it"} ?: ""))
                    val baseline=cursor==null
                    cursor=packet.getString("cursor")
                    val ids=packet.getJSONArray("rows").tableRows().filter{it.getString("sheetId")==sheetId}
                        .map{it.getString("rowId")}.distinct()
                    if(baseline||ids.size>8||ticks%5==0)reload()
                    else if(ids.isNotEmpty()){
                        val replies=ids.map{model.timetableObject("/attendance/rows/$it")}
                        if(replies.any{it.getString("sheetId")!=sheetId})reload()
                        else update(replies.map{it.getJSONObject("row")})
                    }
                }catch(error:CancellationException){throw error}
                catch(error:HttpFailure){
                    if(error.status in listOf(401,403,404)){reload();break}
                    reload()
                }catch(_:Exception){ /* The next poll retries while this sheet remains active. */ }
                ticks++
                delay(3_500)
            }
        }
    }
}
