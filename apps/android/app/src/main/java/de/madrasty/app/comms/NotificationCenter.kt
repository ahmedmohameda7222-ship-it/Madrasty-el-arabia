package de.madrasty.app.comms

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import de.madrasty.app.R
import de.madrasty.app.academics.academicPages
import de.madrasty.app.academics.academicRead
import de.madrasty.app.academics.string
import de.madrasty.app.api.decodeData
import de.madrasty.app.identity.HttpFailure
import de.madrasty.app.identity.IdentityViewModel
import de.madrasty.app.identity.SchoolSession
import de.madrasty.app.identity.readPreferences
import de.madrasty.app.school.Submit
import de.madrasty.app.ui.AsyncState
import de.madrasty.app.ui.AsyncSurface
import de.madrasty.app.ui.isolate
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.text.NumberFormat
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Locale

@Composable
internal fun PushSessionBinding(model:IdentityViewModel,session:SchoolSession){
    val context=LocalContext.current.applicationContext
    val lifecycle=LocalLifecycleOwner.current.lifecycle
    var resume by remember(session.actor){mutableIntStateOf(0)}
    DisposableEffect(lifecycle){
        val observer=LifecycleEventObserver{_,event->if(event==Lifecycle.Event.ON_RESUME)resume++}
        lifecycle.addObserver(observer)
        onDispose{lifecycle.removeObserver(observer)}
    }
    LaunchedEffect(session.actor,resume,model.attendanceNetworkRevision){
        try{reconcileAndroidPush(context,model,session.actor)}
        catch(cancelled:CancellationException){throw cancelled}
        catch(_:Exception){ /* In-app notices remain available if the provider is offline. */ }
    }
}

@Composable
internal fun NotificationAction(model:IdentityViewModel,open:()->Unit){
    val actor=model.session?.actor
    val lifecycle=LocalLifecycleOwner.current.lifecycle
    var count by remember(actor){mutableIntStateOf(0)}
    LaunchedEffect(actor,model.attendanceNetworkRevision){
        if(actor==null)return@LaunchedEffect
        while(true){
            if(lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)){
                try{count=model.noticeObject("/notifications/count").getInt("unread")}
                catch(cancelled:CancellationException){throw cancelled}
                catch(problem:HttpFailure){if(problem.status in listOf(401,403))count=0}
                catch(_:Exception){ /* Refresh on the next poll. */ }
            }
            delay(25000)
        }
    }
    val label=if(count>0)stringResource(R.string.notices_count,count)else stringResource(R.string.notices_title)
    IconButton(onClick=open){
        BadgedBox(badge={if(count>0)Badge{Text(if(count>99)"99+" else NumberFormat.getIntegerInstance().format(count))}}){
            Icon(painterResource(R.drawable.ic_bell),contentDescription=label)
        }
    }
}

@Composable
internal fun NotificationCenter(
    model:IdentityViewModel,initial:String?,openTarget:(JSONObject)->Boolean,preferences:()->Unit,close:()->Unit,
){
    val language=if(LocalContext.current.resources.configuration.locales[0].language=="de")"de" else "ar"
    val time=DateTimeFormatter.ofLocalizedDateTime(FormatStyle.SHORT).withLocale(Locale.forLanguageTag(language)).withZone(ZoneId.systemDefault())
    var selected by remember(initial){mutableStateOf(initial)}
    var onlyUnread by remember{mutableStateOf(false)}
    var refresh by remember{mutableIntStateOf(0)}
    var read by remember{mutableStateOf(emptySet<String>())}
    fun back(){
        if(selected==null||initial!=null)close()
        else {selected=null;refresh++}
    }
    BackHandler(onBack=::back)
    Column(Modifier.fillMaxSize().safeDrawingPadding().imePadding().verticalScroll(rememberScrollState()).padding(20.dp),
        verticalArrangement=Arrangement.spacedBy(8.dp)){
        TextButton(onClick=::back){Text(stringResource(R.string.back))}
        Text(stringResource(R.string.notices_title),style=MaterialTheme.typography.headlineMedium)
        val notice=selected
        if(notice!=null){
            key(notice){NoticeDetail(model,notice,openTarget)}
            return@Column
        }
        FlowRow(horizontalArrangement=Arrangement.spacedBy(4.dp)){
            FilterChip(!onlyUnread,onClick={onlyUnread=false},label={Text(stringResource(R.string.notices_all))})
            FilterChip(onlyUnread,onClick={onlyUnread=true},label={Text(stringResource(R.string.notices_unread))})
            TextButton(onClick={refresh++}){Text(stringResource(R.string.broadcast_refresh))}
        }
        academicPages(model,"/notifications?limit=25&locale=$language&unread=$onlyUnread",refresh+model.attendanceNetworkRevision){rows->
            val visible=rows.filter{!onlyUnread||it.getString("id") !in read}
            if(rows.isNotEmpty()&&visible.isEmpty())Text(stringResource(R.string.empty))
            visible.forEach{row->
                val id=row.getString("id")
                key(id){
                    val corrected=row.optBoolean("superseded")
                    val unread=row.isNull("readAt")&&id !in read&&!corrected
                    HorizontalDivider()
                    Text(isolate(row.getString("title")),style=if(unread)MaterialTheme.typography.titleMedium else MaterialTheme.typography.bodyLarge)
                    Text(isolate(time.format(Instant.parse(row.getString("createdAt")))),style=MaterialTheme.typography.bodySmall)
                    if(corrected)Text(stringResource(R.string.notices_corrected))
                    TextButton(onClick={selected=id}){Text(stringResource(R.string.notices_open))}
                    if(unread)Submit(true,R.string.notices_mark,success=null){
                        markNotice(model,id)
                        read=read+id
                    }
                }
            }
        }
        DeviceNotificationSettings(model,language,preferences)
    }
}

@Composable
private fun NoticeDetail(model:IdentityViewModel,id:String,open:(JSONObject)->Boolean){
    var unavailable by remember(id){mutableStateOf(false)}
    val detail=academicRead("/notifications/$id",0){path->
        val opened=model.noticeObject(path)
        try{markNotice(model,id)}
        catch(cancelled:CancellationException){throw cancelled}
        catch(error:HttpFailure){
            if(error.status!=404&&error.status!=403)throw error
            return@academicRead JSONObject().put("state","unavailable")
        }
        opened
    }
    AsyncSurface(detail){item->
        val targets=item.optJSONArray("targets")
        if(item.getString("state")!="open"||targets==null||targets.length()==0||unavailable){
            Text(stringResource(R.string.notices_unavailable))
        }else if(targets.length()==1){
            val target=targets.getJSONObject(0)
            LaunchedEffect(id){if(!open(target))unavailable=true}
        }else for(index in 0 until targets.length()){
            val target=targets.getJSONObject(index)
            val label=targetLabel(target.getString("kind"))
            if(label!=null)TextButton(onClick={if(!open(target))unavailable=true}){
                val order=if(targets.length()>1)" "+isolate(NumberFormat.getIntegerInstance().format(index+1))else ""
                Text(stringResource(label)+order)
            }
        }
    }
}

private fun targetLabel(kind:String):Int?=when(kind){
    "thread"->R.string.nav_messages
    "broadcast"->R.string.broadcast_title
    "child"->R.string.nav_children
    "attendance"->R.string.nav_attendance
    "homework"->R.string.homework_title
    "evaluation"->R.string.evaluation_title
    "exam"->R.string.exam_title
    "activity"->R.string.academic_work
    "invoice"->R.string.fee_invoices
    "receipt"->R.string.receipt_title
    "fee_stop"->R.string.stop_title
    else->null
}

@Composable
private fun DeviceNotificationSettings(model:IdentityViewModel,locale:String,preferences:()->Unit){
    val context=LocalContext.current.applicationContext
    val actor=model.session?.actor?:return
    val scope=rememberCoroutineScope()
    val options=academicRead("/me/push-subscriptions",model.attendanceNetworkRevision){androidPushSettings(model)}
    val correspondence=academicRead("/account/preferences?locale=$locale",model.attendanceNetworkRevision){model.readPreferences(locale)}
    var enabled by remember(actor){mutableStateOf(false)}
    var denied by remember(actor){mutableStateOf(false)}
    var busy by remember(actor){mutableStateOf(false)}
    var error by remember(actor){mutableStateOf(false)}
    LaunchedEffect(actor,model.attendanceNetworkRevision){
        try{enabled=reconcileAndroidPush(context,model,actor)}
        catch(cancelled:CancellationException){throw cancelled}
        catch(_:Exception){enabled=false}
    }
    val provided=(options as? AsyncState.Ready)?.content
    fun bind(){
        if(provided==null||busy)return
        if(!androidPushAllowed(context)){denied=true;return}
        busy=true;denied=false;error=false
        scope.launch{
            try{bindAndroidPush(context,model,actor,provided);enabled=true}
            catch(cancelled:CancellationException){throw cancelled}
            catch(_:Exception){error=true}
            finally{busy=false}
        }
    }
    val request=rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()){approved->
        if(approved)bind()else denied=true
    }
    HorizontalDivider()
    Text(stringResource(R.string.notices_device),style=MaterialTheme.typography.titleLarge)
    val language=(correspondence as? AsyncState.Ready)?.content?.correspondenceLocale
    if(language!=null)Text(stringResource(R.string.notices_correspondence)+" · "+
        stringResource(if(language=="de")R.string.broadcast_german else R.string.broadcast_arabic))
    TextButton(onClick=preferences){Text(stringResource(R.string.account_preferences))}
    if(denied)Text(stringResource(R.string.notices_permission))
    if(error)Text(stringResource(R.string.generic_error))
    if(enabled)Text(stringResource(R.string.notices_device_enabled))
    AsyncSurface(options){configured->
        if(configured==null)Text(stringResource(R.string.notices_push_unavailable))
        else TextButton(enabled=!busy,onClick={
            if(enabled){
                busy=true;error=false;enabled=false
                scope.launch{
                    try{disableAndroidPush(context,model)}
                    catch(cancelled:CancellationException){throw cancelled}
                    catch(_:Exception){error=true}
                    finally{busy=false}
                }
            }else if(Build.VERSION.SDK_INT>=33&&context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED){
                request.launch(Manifest.permission.POST_NOTIFICATIONS)
            }else bind()
        }){Text(stringResource(if(enabled)R.string.notices_device_disable else R.string.notices_device_enable))}
    }
}
private suspend fun IdentityViewModel.noticeObject(path:String,body:JSONObject?=null,method:String="GET")=
    decodeData(schoolRequest(path,body,method)){it as JSONObject}.data
private suspend fun markNotice(model:IdentityViewModel,id:String)=
    model.noticeObject("/notifications/$id",JSONObject().put("read",true),"PATCH")
