package de.madrasty.app.comms

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextDirection
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import de.madrasty.app.R
import de.madrasty.app.academics.academicPages
import de.madrasty.app.academics.academicRead
import de.madrasty.app.api.decodeData
import de.madrasty.app.identity.HttpFailure
import de.madrasty.app.identity.IdentityViewModel
import de.madrasty.app.ui.AsyncState
import de.madrasty.app.ui.AsyncSurface
import de.madrasty.app.ui.Persona
import de.madrasty.app.ui.isolate
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.text.NumberFormat
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Locale
import java.util.UUID

private enum class BroadcastAudience(val wire:String,val label:Int){
    AllGuardians("all_guardians",R.string.broadcast_all_guardians),
    AllTeachers("all_teachers",R.string.broadcast_all_teachers),
    ClassGuardians("class_guardians",R.string.broadcast_class_guardians);
    companion object{
        fun read(value:String)=entries.first{it.wire==value}
    }
}
private data class BroadcastClass(val id:String,val label:String)
private data class BroadcastOptions(val schoolWide:Boolean,val classes:List<BroadcastClass>){
    val kinds get()=buildList{
        if(schoolWide)addAll(listOf(BroadcastAudience.AllGuardians,BroadcastAudience.AllTeachers))
        if(classes.isNotEmpty())add(BroadcastAudience.ClassGuardians)
    }
}
private data class BroadcastText(val title:String="",val body:String=""){
    fun json()=JSONObject().put("title",title.trim()).put("body",body.trim())
    val complete get()=title.isNotBlank()&&body.isNotBlank()
    companion object{
        fun read(row:JSONObject)=BroadcastText(row.getString("title"),row.getString("body"))
    }
}
private data class BroadcastReview(
    val id:String,val kind:BroadcastAudience,val classLabel:String?,val ar:BroadcastText,val de:BroadcastText,
    val arCount:Int,val deCount:Int,val expiresAt:String,
){
    val total get()=arCount+deCount
}
private class BroadcastFormState(language:String){
    var audience by mutableStateOf<BroadcastAudience?>(null)
    var selectedClass by mutableStateOf<String?>(null)
    var activeLanguage by mutableStateOf(language)
    var ar by mutableStateOf(BroadcastText())
    var de by mutableStateOf(BroadcastText())
}
private enum class BroadcastTab(val label:Int){
    Inbox(R.string.broadcast_inbox),Compose(R.string.broadcast_new),History(R.string.broadcast_history),
}

@Composable
internal fun BroadcastHub(model:IdentityViewModel,persona:Persona,initial:String?,close:()->Unit){
    val language=if(LocalContext.current.resources.configuration.locales[0].language=="de")"de" else "ar"
    val locale=Locale.forLanguageTag(language)
    var selected by remember(initial){mutableStateOf(initial)}
    var tab by remember(persona){mutableStateOf(if(persona==Persona.Admin)BroadcastTab.Compose else BroadcastTab.Inbox)}
    var refresh by remember{mutableIntStateOf(0)}
    val draft=remember(model.session?.actor){BroadcastFormState(language)}
    val version=refresh+model.attendanceNetworkRevision
    val options=if(persona==Persona.Guardian)AsyncState.Ready(BroadcastOptions(false,emptyList())) else
        academicRead("/broadcasts/options",version){path->
            val data=model.broadcastRecord(path)
            val classes=data.getJSONArray("classes")
            BroadcastOptions(data.getBoolean("schoolWide"),List(classes.length()){index->
                val classRow=classes.getJSONObject(index)
                val name=classRow.getString(if(language=="de")"nameDe" else "nameAr")
                BroadcastClass(classRow.getString("id"),isolate(classRow.getString("code"))+" · "+isolate(name))
            })
        }
    val allowed=(options as? AsyncState.Ready)?.content?.kinds?.isNotEmpty()==true
    fun back(){
        if(selected==null||initial!=null)close()
        else selected=null
    }
    BackHandler(onBack=::back)
    Column(Modifier.fillMaxSize().safeDrawingPadding().imePadding().verticalScroll(rememberScrollState()).padding(20.dp),
        verticalArrangement=Arrangement.spacedBy(8.dp)){
        TextButton(onClick=::back){Text(stringResource(R.string.back))}
        Text(stringResource(R.string.broadcast_title),style=MaterialTheme.typography.headlineMedium)
        val opened=selected
        if(opened!=null){
            val item=academicRead("/broadcasts/inbox/$opened?locale=$language",version){model.broadcastRecord(it)}
            AsyncSurface(item){
                BroadcastCard(language,BroadcastText.read(it),time=localizedTime(it.getString("publishedAt"),locale))
            }
            return@Column
        }
        FlowRow(horizontalArrangement=Arrangement.spacedBy(4.dp)){
            for(option in BroadcastTab.entries){
                if(option==BroadcastTab.Inbox||allowed)FilterChip(selected=tab==option,onClick={tab=option},label={Text(stringResource(option.label))})
            }
            TextButton(onClick={refresh++}){Text(stringResource(R.string.broadcast_refresh))}
        }
        when(tab){
            BroadcastTab.Inbox->academicPages(model,"/broadcasts/inbox?limit=25&locale=$language",version){rows->
                rows.forEach{row->
                    HorizontalDivider()
                    Text(isolate(row.getString("title")),style=MaterialTheme.typography.titleMedium)
                    Text(isolate(localizedTime(row.getString("publishedAt"),locale)))
                    TextButton(onClick={selected=row.getString("id")}){Text(stringResource(R.string.broadcast_open))}
                }
            }
            BroadcastTab.Compose->AsyncSurface(options){value->
                if(value.kinds.isEmpty())Text(stringResource(R.string.broadcast_no_recipients))
                else BroadcastComposer(model,value,locale,draft){refresh++}
            }
            BroadcastTab.History->if(allowed)BroadcastHistory(model,locale,version)
        }
    }
}

@Composable
private fun BroadcastComposer(model:IdentityViewModel,options:BroadcastOptions,locale:Locale,draft:BroadcastFormState,published:()->Unit){
    val labels=NumberFormat.getIntegerInstance(locale)
    val scope=rememberCoroutineScope()
    var audience by draft::audience
    val kind=audience?.takeIf{it in options.kinds}
    var selectedClass by draft::selectedClass
    val targetClass=options.classes.firstOrNull{it.id==selectedClass}
    var activeLanguage by draft::activeLanguage
    var ar by draft::ar
    var de by draft::de
    var review by remember{mutableStateOf<BroadcastReview?>(null)}
    var receipt by remember{mutableStateOf<Int?>(null)}
    var key by remember{mutableStateOf<String?>(null)}
    var busy by remember{mutableStateOf(false)}
    var error by remember{mutableStateOf<Int?>(null)}
    fun preview(){
        if(busy||!ar.complete||!de.complete||kind==null||(kind==BroadcastAudience.ClassGuardians&&targetClass==null))return
        val chosenKind=kind
        busy=true;receipt=null;error=null
        scope.launch{
            try{
                val target=JSONObject().put("kind",chosenKind.wire)
                if(kind==BroadcastAudience.ClassGuardians)target.put("classId",checkNotNull(targetClass).id)
                val body=JSONObject().put("audience",target).put("copy",JSONObject().put("ar",ar.json()).put("de",de.json()))
                val value=model.broadcastRecord("/broadcasts/preview",body)
                val counts=value.getJSONObject("counts")
                val copy=value.getJSONObject("copy")
                review=BroadcastReview(value.getString("previewId"),chosenKind,
                    if(kind==BroadcastAudience.ClassGuardians)targetClass?.label else null,
                    BroadcastText.read(copy.getJSONObject("ar")),BroadcastText.read(copy.getJSONObject("de")),
                    counts.getInt("ar"),counts.getInt("de"),value.getString("expiresAt"))
                key=UUID.randomUUID().toString()
            }catch(cancelled:CancellationException){throw cancelled}
            catch(problem:HttpFailure){error=if(problem.status in listOf(401,403,404))R.string.chat_media_expired else R.string.generic_error}
            catch(_:Exception){error=R.string.generic_error}
            finally{busy=false}
        }
    }
    fun send(current:BroadcastReview){
        if(busy||current.total<1)return
        busy=true;error=null
        scope.launch{
            try{
                val result=model.broadcastRecord("/broadcasts",JSONObject().put("previewId",current.id),checkNotNull(key))
                receipt=result.getInt("recipientCount")
                review=null;ar=BroadcastText();de=BroadcastText();key=null;audience=null;selectedClass=null
                published()
            }catch(cancelled:CancellationException){throw cancelled}
            catch(problem:HttpFailure){
                if(problem.status in listOf(404,409)){review=null;key=null;error=R.string.broadcast_stale}
                else error=if(problem.status in listOf(401,403))R.string.chat_media_expired else R.string.generic_error
            }catch(_:Exception){error=R.string.generic_error}
            finally{busy=false}
        }
    }
    error?.let{Text(stringResource(it))}
    receipt?.let{count->
        Text(stringResource(R.string.broadcast_published)+" · "+stringResource(R.string.broadcast_count)+" "+isolate(labels.format(count)))
    }
    val active=review
    if(active!=null){
        Text(stringResource(R.string.broadcast_preview),style=MaterialTheme.typography.titleLarge)
        Text(stringResource(active.kind.label)+(active.classLabel?.let{" · $it"}?:""))
        Text(stringResource(R.string.broadcast_count)+" · "+isolate(labels.format(active.total)))
        Text(stringResource(R.string.broadcast_expires)+" · "+isolate(localizedTime(active.expiresAt,locale)))
        BroadcastCard("ar",active.ar,stringResource(R.string.broadcast_arabic)+" · "+isolate(labels.format(active.arCount)))
        BroadcastCard("de",active.de,stringResource(R.string.broadcast_german)+" · "+isolate(labels.format(active.deCount)))
        if(active.total==0)Text(stringResource(R.string.broadcast_no_recipients))
        Button(enabled=!busy&&active.total>0,onClick={send(active)}){
            Text(stringResource(if(busy)R.string.pending else R.string.broadcast_confirm))
        }
        TextButton(enabled=!busy,onClick={review=null;key=null;error=null}){Text(stringResource(R.string.broadcast_edit))}
        return
    }
    Text(stringResource(R.string.broadcast_audience),style=MaterialTheme.typography.titleMedium)
    FlowRow(horizontalArrangement=Arrangement.spacedBy(4.dp)){
        for(value in options.kinds)FilterChip(selected=kind==value,enabled=!busy,onClick={audience=value;selectedClass=null},label={Text(stringResource(value.label))})
    }
    if(kind==BroadcastAudience.ClassGuardians){
        Text(stringResource(R.string.broadcast_class),style=MaterialTheme.typography.titleMedium)
        FlowRow(horizontalArrangement=Arrangement.spacedBy(4.dp)){
            for(value in options.classes)FilterChip(selected=targetClass?.id==value.id,enabled=!busy,onClick={selectedClass=value.id},label={Text(value.label)})
        }
    }
    FlowRow(horizontalArrangement=Arrangement.spacedBy(4.dp)){
        FilterChip(selected=activeLanguage=="ar",enabled=!busy,onClick={activeLanguage="ar"},label={Text(stringResource(R.string.broadcast_arabic)+(if(ar.complete)" ✓" else ""))})
        FilterChip(selected=activeLanguage=="de",enabled=!busy,onClick={activeLanguage="de"},label={Text(stringResource(R.string.broadcast_german)+(if(de.complete)" ✓" else ""))})
    }
    if(activeLanguage=="ar")BroadcastFields(R.string.broadcast_arabic,"ar",ar,!busy){ar=it}
    else BroadcastFields(R.string.broadcast_german,"de",de,!busy){de=it}
    Button(enabled=!busy&&ar.complete&&de.complete&&kind!=null&&(kind!=BroadcastAudience.ClassGuardians||targetClass!=null),onClick=::preview){
        Text(stringResource(if(busy)R.string.pending else R.string.broadcast_preview))
    }
}

@Composable
private fun BroadcastFields(languageLabel:Int,language:String,content:BroadcastText,editable:Boolean,change:(BroadcastText)->Unit){
    val direction=if(language=="ar")TextDirection.ContentOrRtl else TextDirection.ContentOrLtr
    Text(stringResource(languageLabel),style=MaterialTheme.typography.titleMedium)
    OutlinedTextField(content.title,{change(content.copy(title=it.take(180)))},Modifier.fillMaxWidth(),
        textStyle=TextStyle(textDirection=direction),label={Text(stringResource(R.string.broadcast_subject))},singleLine=true,enabled=editable)
    OutlinedTextField(content.body,{change(content.copy(body=it.take(4000)))},Modifier.fillMaxWidth(),
        textStyle=TextStyle(textDirection=direction),label={Text(stringResource(R.string.broadcast_body))},minLines=3,enabled=editable)
}

@Composable
private fun BroadcastHistory(model:IdentityViewModel,locale:Locale,refresh:Int){
    val numbers=NumberFormat.getIntegerInstance(locale)
    academicPages(model,"/broadcasts?limit=25",refresh){rows->
        rows.forEach{row->
            val id=row.getString("id")
            androidx.compose.runtime.key(id){
                var expanded by remember{mutableStateOf(false)}
                val audience=BroadcastAudience.read(row.getJSONObject("audience").getString("kind"))
                val copy=row.getJSONObject("copy")
                val local=if(locale.language=="de")"de" else "ar"
                HorizontalDivider()
                TextButton(onClick={expanded=!expanded}){
                    Text(isolate(copy.getJSONObject(local).getString("title"))+" · "+isolate(localizedTime(row.getString("publishedAt"),locale)))
                }
                if(expanded){
                    Text(stringResource(audience.label)+(if(audience==BroadcastAudience.ClassGuardians)" · "+isolate(row.getString(if(local=="de")"classDe" else "classAr")) else ""))
                    Text(stringResource(R.string.broadcast_count)+" · "+isolate(numbers.format(row.getInt("recipientCount"))))
                    val dispatch=row.getJSONObject("dispatch")
                    for((field,label) in listOf("pending" to R.string.broadcast_pending,"queued" to R.string.broadcast_queued,"suppressed" to R.string.broadcast_suppressed)){
                        Text(stringResource(label)+" · "+isolate(numbers.format(dispatch.getInt(field))))
                    }
                    Text(stringResource(R.string.email),style=MaterialTheme.typography.titleSmall)
                    val email=row.getJSONObject("emailDelivery")
                    val emailStates=listOf("pending" to R.string.delivery_queued,"accepted" to R.string.delivery_accepted,
                        "delivered" to R.string.delivery_delivered,"unresolved" to R.string.delivery_needs_attention)
                    for((field,label) in emailStates)Text(stringResource(label)+" · "+isolate(numbers.format(email.getInt(field))))
                    BroadcastCard("ar",BroadcastText.read(copy.getJSONObject("ar")),stringResource(R.string.broadcast_arabic))
                    BroadcastCard("de",BroadcastText.read(copy.getJSONObject("de")),stringResource(R.string.broadcast_german))
                }
            }
        }
    }
}

@Composable
private fun BroadcastCard(language:String,copy:BroadcastText,heading:String?=null,time:String?=null){
    heading?.let{Text(it,style=MaterialTheme.typography.labelLarge)}
    CompositionLocalProvider(LocalLayoutDirection provides if(language=="ar")LayoutDirection.Rtl else LayoutDirection.Ltr){
        Column(Modifier.fillMaxWidth()){
            Text(isolate(copy.title),style=MaterialTheme.typography.titleMedium)
            time?.let{Text(isolate(it),style=MaterialTheme.typography.labelMedium)}
            Text(isolate(copy.body))
        }
    }
}
private fun localizedTime(value:String,locale:Locale)=DateTimeFormatter.ofLocalizedDateTime(FormatStyle.SHORT)
    .withLocale(locale).withZone(ZoneId.systemDefault()).format(Instant.parse(value))

private suspend fun IdentityViewModel.broadcastRecord(path:String,body:JSONObject?=null,idempotency:String?=null)=decodeData(
    schoolRequest(path,body,if(body==null)"GET" else "POST",idempotency),
){it as JSONObject}.data
