package de.madrasty.app.comms

import android.app.DatePickerDialog
import android.app.TimePickerDialog
import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextDirection
import androidx.compose.ui.unit.dp
import de.madrasty.app.R
import de.madrasty.app.academics.academicPages
import de.madrasty.app.academics.academicRead
import de.madrasty.app.academics.string
import de.madrasty.app.api.decodeData
import de.madrasty.app.identity.HttpFailure
import de.madrasty.app.identity.IdentityViewModel
import de.madrasty.app.ui.AsyncSurface
import de.madrasty.app.ui.isolate
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.text.NumberFormat
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.LocalTime
import java.time.YearMonth
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.time.format.TextStyle as DayNameStyle
import java.util.Locale
import java.util.UUID

internal enum class PublicationSection(val endpoint:String,val heading:Int,val newLabel:Int){
    News("/news",R.string.school_news,R.string.publish_new_news),
    Events("/events",R.string.school_events,R.string.publish_new_event),
}
private data class PublishingClass(val id:String,val name:String,val canWrite:Boolean)
private data class PublishingCalendar(val date:LocalDate,val timezone:String,val schoolWide:Boolean,val classes:List<PublishingClass>){
    val canCompose get()=schoolWide||classes.any{it.canWrite}
}
private class PublicationFeedState(today:LocalDate){
    var month by mutableStateOf(YearMonth.from(today))
    var day by mutableStateOf<LocalDate?>(null)
    var managed by mutableStateOf(false)
    var classId by mutableStateOf("")
}

@Composable
internal fun SchoolPublicationScreen(model:IdentityViewModel,section:PublicationSection,initial:String?,close:()->Unit,initialCreate:Boolean=false,embedded:Boolean=false){
    val language=LocalContext.current.resources.configuration.locales[0].language.let{if(it=="de")"de" else "ar"}
    val locale=Locale.forLanguageTag(language)
    var selected by remember(initial){mutableStateOf(initial)}
    var editing by remember{mutableStateOf(false)}
    var creating by remember(initialCreate){mutableStateOf(initialCreate)}
    var refresh by remember{mutableIntStateOf(0)}
    val version=refresh+model.attendanceNetworkRevision
    val calendar=academicRead("/school/publishing-options",version){path->
        val data=model.publishingObject(path)
        val choices=data.getJSONArray("classes")
        PublishingCalendar(LocalDate.parse(data.getString("schoolDate")),data.getString("timezone"),data.getBoolean("schoolWide"),
            List(choices.length()){i->
                val record=choices.getJSONObject(i)
                PublishingClass(record.getString("id"),isolate(record.getString("code"))+" · "+
                    isolate(record.getString(if(language=="de")"nameDe" else "nameAr")),record.getBoolean("canWrite"))
            })
    }
    fun back(){
        if(editing||creating){editing=false;creating=false;refresh++}
        else if(selected!=null&&initial==null){selected=null;refresh++}
        else close()
    }
    BackHandler(onBack=::back)
    val frame=if(embedded)Modifier.fillMaxWidth() else Modifier.fillMaxSize().safeDrawingPadding().imePadding().verticalScroll(rememberScrollState()).padding(20.dp)
    Column(frame,
        verticalArrangement=Arrangement.spacedBy(8.dp)){
        if(!embedded||selected!=null||creating||editing)TextButton(onClick=::back){Text(stringResource(R.string.back))}
        if(!embedded)Text(stringResource(section.heading),style=MaterialTheme.typography.headlineMedium)
        AsyncSurface(calendar){options->
            val filter=remember(section){PublicationFeedState(options.date)}
            val id=selected
            when{
                id!=null->{
                    val detail=academicRead("${section.endpoint}/$id",version){model.publishingObject(it)}
                    AsyncSurface(detail){entry->
                        if(editing)key(id){PublicationEditor(model,section,options,language,entry,::back)}
                        else{
                            PublicationCard(entry,language,detail=true)
                            if(entry.getBoolean("canEdit"))TextButton(onClick={editing=true}){Text(stringResource(R.string.publish_edit))}
                        }
                    }
                }
                creating&&options.canCompose->PublicationEditor(model,section,options,language,null){filter.managed=true;back()}
                else->PublicationFeed(model,section,options,locale,version,filter,open={selected=it},compose={creating=true})
            }
        }
    }
}

@Composable
private fun PublicationFeed(
    model:IdentityViewModel,section:PublicationSection,options:PublishingCalendar,locale:Locale,version:Int,
    filter:PublicationFeedState,open:(String)->Unit,compose:()->Unit,
){
    var month by filter::month
    var day by filter::day
    var managed by filter::managed
    var classId by filter::classId
    if(options.canCompose)FlowRow(horizontalArrangement=Arrangement.spacedBy(4.dp)){
        FilterChip(!managed,onClick={managed=false},label={Text(stringResource(R.string.publish_feed))})
        FilterChip(managed,onClick={managed=true},label={Text(stringResource(R.string.publish_managed))})
        TextButton(onClick=compose){Text(stringResource(section.newLabel))}
    }
    if(options.classes.isNotEmpty())FlowRow(horizontalArrangement=Arrangement.spacedBy(4.dp)){
        FilterChip(classId.isEmpty(),onClick={classId=""},label={Text(stringResource(R.string.publish_all_classes))})
        for(option in options.classes)FilterChip(classId==option.id,onClick={classId=option.id},label={Text(option.name)})
    }
    if(section==PublicationSection.Events){
        Text(month.format(DateTimeFormatter.ofPattern("LLLL yyyy",locale)),style=MaterialTheme.typography.titleLarge)
        FlowRow(horizontalArrangement=Arrangement.spacedBy(4.dp)){
            TextButton(enabled=month.year>1||month.monthValue>1,onClick={month=month.minusMonths(1);day=null}){
                Text(stringResource(R.string.publish_previous_month))
            }
            TextButton(enabled=month.year<9999||month.monthValue<12,onClick={month=month.plusMonths(1);day=null}){
                Text(stringResource(R.string.publish_next_month))
            }
            TextButton(onClick={month=YearMonth.from(options.date);day=options.date}){Text(stringResource(R.string.publish_today))}
            if(day!=null)TextButton(onClick={day=null}){Text(stringResource(R.string.publish_this_month))}
        }
    }
    val page="${section.endpoint}?limit=60&view="+(if(managed)"managed" else "feed")+
        (if(classId.isEmpty())"" else "&classId=${Uri.encode(classId)}")+(if(section==PublicationSection.Events)"&month=$month"+(day?.let{"&day=$it"}?:"") else "")
    if(section==PublicationSection.Events){
        val summary=academicRead("/comms/calendar?month=$month&view="+(if(managed)"managed" else "feed")+(if(classId.isEmpty())"" else "&classId=${Uri.encode(classId)}"),version){path->
            decodeData(model.schoolRequest(path)){it as org.json.JSONArray}.data
        }
        AsyncSurface(summary){days->MonthGrid(locale,month,day,days){day=it}}
    }
    academicPages(model,page,version){items->
        val selected=day
        val visible=if(selected==null)items else items.filter{eventOn(it,selected)}
        if(selected!=null&&items.isNotEmpty()&&visible.isEmpty())Text(stringResource(R.string.publish_empty_day))
        for(item in visible)key(item.getString("id")){
            HorizontalDivider()
            PublicationCard(item,locale.language)
            TextButton(onClick={open(item.getString("id"))}){Text(stringResource(R.string.publish_open))}
        }
    }
}

@Composable
private fun MonthGrid(locale:Locale,month:YearMonth,day:LocalDate?,days:org.json.JSONArray,pick:(LocalDate)->Unit){
    val calendar=DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM).withLocale(locale)
    val numbers=NumberFormat.getIntegerInstance(locale)
    val offset=month.atDay(1).dayOfWeek.value-1
    val weeks=(offset+month.lengthOfMonth()+6)/7
    Row(Modifier.fillMaxWidth()){
        for(weekday in DayOfWeek.entries)Column(Modifier.weight(1f),horizontalAlignment=Alignment.CenterHorizontally){
            Text(weekday.getDisplayName(DayNameStyle.NARROW,locale),style=MaterialTheme.typography.labelSmall)
        }
    }
    repeat(weeks){week->
        Row(Modifier.fillMaxWidth()){
            for(column in 0..6){
                val index=week*7+column-offset+1
                if(index !in 1..month.lengthOfMonth())Spacer(Modifier.weight(1f))
                else {
                    val date=month.atDay(index)
                    val info=(0 until days.length()).map{days.getJSONObject(it)}.firstOrNull{it.getString("date")==date.toString()}
                    val amount=info?.optInt("events")?:0
                    val teaching=info?.let{if(it.isNull("teaching"))null else it.getBoolean("teaching")}
                    val description=date.format(calendar)+(if(teaching==null)"" else " · "+stringResource(if(teaching)R.string.comms_teaching_day else R.string.comms_free_day))+(if(amount>0)" · "+numbers.format(amount) else "")
                    TextButton(modifier=Modifier.weight(1f).semantics{
                        contentDescription=description
                        selected=day==date
                    },onClick={pick(date)},contentPadding=PaddingValues(0.dp)){
                        Column(horizontalAlignment=Alignment.CenterHorizontally){
                            Text(numbers.format(index),color=if(teaching==true)MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant)
                            if(amount>0)Text("●",style=MaterialTheme.typography.labelSmall)
                        }
                    }
                }
            }
        }
    }
}

private fun eventOn(record:JSONObject,day:LocalDate):Boolean{
    val timing=record.optJSONObject("timing")?:return false
    val start=LocalDate.parse(timing.getJSONObject("start").getString("date"))
    if(start==day)return true
    val end=timing.optJSONObject("end")?:return false
    val until=LocalDate.parse(end.getString("date"))
    return day>start&&(day<until||day==until&&!timing.getBoolean("allDay")&&end.string("time")!="00:00")
}

@Composable
private fun PublicationCard(entry:JSONObject,language:String,detail:Boolean=false){
    val copy=entry.getJSONObject("copy")
    val text=copy.optJSONObject(language)?:copy.getJSONObject(entry.getString("sourceLocale"))
    Text(isolate(text.getString("title")),style=MaterialTheme.typography.titleMedium)
    val audience=entry.getJSONObject("audience")
    if(audience.getString("kind")=="school")Text(stringResource(R.string.publish_whole_school))
    else entry.string(if(language=="de")"classDe" else "classAr")?.let{Text(isolate(it))}
    val state=entry.getString("state")
    if(state!="published")Text(stringResource(publicationState(state)))
    entry.optJSONObject("timing")?.let{EventTimingLine(it,entry.getString("timezone"),language)}
    if(detail)Text(isolate(text.getString("body")))
}

@Composable
private fun EventTimingLine(timing:JSONObject,timezone:String,language:String){
    val format=DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM).withLocale(Locale.forLanguageTag(language))
    fun label(moment:JSONObject)=LocalDate.parse(moment.getString("date")).format(format)+(moment.string("time")?.let{" · $it"}?:"")
    val first=label(timing.getJSONObject("start"))
    val end=timing.optJSONObject("end")?.let{if(timing.getBoolean("allDay"))LocalDate.parse(it.getString("date")).minusDays(1).format(format) else label(it)}
    Text(isolate(first)+(end?.let{" – "+isolate(it)}?:"")+
        " · "+(if(timing.getBoolean("allDay"))stringResource(R.string.publish_all_day)else isolate(timezone)))
}

private fun publicationState(value:String)=when(value){
    "published"->R.string.publish_published
    "withdrawn"->R.string.publish_withdrawn
    else->R.string.publish_draft
}


private data class ContentFields(val title:String="",val body:String=""){
    val empty get()=title.isBlank()&&body.isBlank()
    val complete get()=title.isNotBlank()&&body.isNotBlank()
    fun json()=JSONObject().put("title",title.trim()).put("body",body.trim())
    companion object{
        fun read(value:JSONObject?)=ContentFields(value?.optString("title").orEmpty(),value?.optString("body").orEmpty())
    }
}
private data class SavedCommand(val path:String,val body:String,val id:String)
private fun localDate(value:String)=runCatching{LocalDate.parse(value)}.getOrNull()
private fun localTime(value:String)=runCatching{LocalTime.parse(value)}.getOrNull()
private fun moment(date:String,time:String,allDay:Boolean)=JSONObject().put("date",date)
    .put("time",if(allDay)JSONObject.NULL else time)
private fun nextDate(value:String)=localDate(value)?.plusDays(1)?.toString().orEmpty()

@Composable
private fun PublicationEditor(
    model:IdentityViewModel,section:PublicationSection,calendar:PublishingCalendar,language:String,record:JSONObject?,dismiss:()->Unit,
){
    val scope=rememberCoroutineScope()
    val options=calendar.classes.filter{it.canWrite}
    val existingClass=record?.optJSONObject("audience")?.string("classId")
    val initial=existingClass?:if(record?.optJSONObject("audience")?.optString("kind")=="school")"school" else null
    val initialTime=record?.optJSONObject("timing")
    val arValue=record?.optJSONObject("copy")?.optJSONObject("ar")
    val deValue=record?.optJSONObject("copy")?.optJSONObject("de")
    var original by remember{mutableStateOf(record?.optString("sourceLocale")?:language)}
    var editingLanguage by remember{mutableStateOf(language)}
    var classKey by remember{mutableStateOf(initial)}
    var ar by remember{mutableStateOf(ContentFields.read(arValue))}
    var de by remember{mutableStateOf(ContentFields.read(deValue))}
    var allDay by remember{mutableStateOf(initialTime?.optBoolean("allDay")?:true)}
    var hasEnd by remember{mutableStateOf(initialTime?.optJSONObject("end")!=null)}
    var startDate by remember{mutableStateOf(initialTime?.optJSONObject("start")?.optString("date")?:calendar.date.toString())}
    var startTime by remember{mutableStateOf(initialTime?.optJSONObject("start")?.string("time")?:"09:00")}
    var endDate by remember{mutableStateOf(initialTime?.optJSONObject("end")?.optString("date")?.let{if(allDay)localDate(it)?.minusDays(1)?.toString()?:it else it}?:startDate)}
    var endTime by remember{mutableStateOf(initialTime?.optJSONObject("end")?.string("time")?:"10:00")}
    var preview by remember{mutableStateOf<JSONObject?>(null)}
    var saved by remember{mutableStateOf(record)}
    var reviewedSaved by remember{mutableStateOf(false)}
    var request by remember{mutableStateOf<SavedCommand?>(null)}
    var status by remember{mutableStateOf<Int?>(null)}
    var alert by remember{mutableStateOf<Int?>(null)}
    var confirmation by remember{mutableStateOf(false)}
    var busy by remember{mutableStateOf(false)}
    val timingAllowed=section==PublicationSection.News||
        localDate(startDate)!=null&&(allDay||localTime(startTime)!=null)&&(!hasEnd||
            localDate(endDate)!=null&&(allDay||localTime(endTime)!=null)&&
            (if(allDay)endDate>=startDate else (endDate+"T"+endTime)>(startDate+"T"+startTime)))
    val textAllowed=(if(original=="ar")ar.complete else de.complete)&&(ar.empty||ar.complete)&&(de.empty||de.complete)

    fun compose(){
        val audience=if(classKey=="school")JSONObject().put("kind","school")
            else JSONObject().put("kind","class").put("classId",classKey)
        val text=JSONObject()
        if(ar.complete)text.put("ar",ar.json())
        if(de.complete)text.put("de",de.json())
        val content=JSONObject().put("audience",audience).put("copy",text).put("sourceLocale",original)
        if(section==PublicationSection.Events){
            val timing=JSONObject().put("start",moment(startDate,startTime,allDay)).put("allDay",allDay)
                .put("end",if(hasEnd)moment(if(allDay)nextDate(endDate) else endDate,endTime,allDay)else JSONObject.NULL)
            content.put("timing",timing)
        }
        preview=content;reviewedSaved=false;status=null;alert=null
    }
    fun commit(action:String){
        if(busy)return
        val current=saved
        val prepared=preview
        if(action=="save"&&prepared==null||action!="save"&&current==null)return
        val body=if(action=="save")JSONObject(checkNotNull(prepared).toString())else JSONObject()
        val path=current?.let{"${section.endpoint}/${it.getString("id")}"}?:section.endpoint
        if(current!=null)body.put("revision",current.getInt("revision")).put("action",action)
        val encoded=body.toString()
        val key=request?.takeIf{it.path==path&&it.body==encoded}?.id?:UUID.randomUUID().toString()
        request=SavedCommand(path,encoded,key)
        busy=true;status=null;alert=null
        scope.launch{
            try{
                saved=model.publishingObject(path,body,if(current==null)"POST" else "PATCH",key)
                request=null
                reviewedSaved=true
                status=when(action){
                    "publish"->R.string.publish_success
                    "withdraw"->R.string.publish_withdraw_success
                    else->R.string.saved
                }
            }catch(cancelled:CancellationException){throw cancelled}
            catch(problem:HttpFailure){
                alert=if(problem.status==409)R.string.conflict else R.string.generic_error
            }catch(_:Exception){alert=R.string.generic_error}
            finally{busy=false}
        }
    }

    saved?.let{Text(stringResource(publicationState(it.getString("state"))))}
    status?.let{Text(stringResource(it))}
    alert?.let{Text(stringResource(it))}
    val value=preview
    if(value!=null){
        Text(stringResource(R.string.publish_preview),style=MaterialTheme.typography.titleLarge)
        if(classKey=="school")Text(stringResource(R.string.publish_whole_school))
        else Text(options.firstOrNull{it.id==classKey}?.name?:isolate(record?.string(if(language=="de")"classDe" else "classAr").orEmpty()))
        value.optJSONObject("timing")?.let{EventTimingLine(it,calendar.timezone,language)}
        val versions=value.getJSONObject("copy")
        for(loc in listOf("ar","de"))versions.optJSONObject(loc)?.let{copy->
            val dir=if(loc=="ar")TextDirection.ContentOrRtl else TextDirection.ContentOrLtr
            Text(stringResource(if(loc=="ar")R.string.broadcast_arabic else R.string.broadcast_german))
            Text(isolate(copy.getString("title")),style=MaterialTheme.typography.titleMedium.copy(textDirection=dir))
            Text(isolate(copy.getString("body")),style=MaterialTheme.typography.bodyLarge.copy(textDirection=dir))
        }
        if(!reviewedSaved)Button(enabled=!busy,onClick={commit("save")}){Text(stringResource(R.string.school_save))}
        if(reviewedSaved&&saved?.optString("state")!="published")Button(enabled=!busy,onClick={commit("publish")}){
            Text(stringResource(R.string.publish_commit))
        }
        TextButton(enabled=!busy,onClick={preview=null}){Text(stringResource(R.string.publish_edit))}
    }else{
        Text(stringResource(R.string.broadcast_audience),style=MaterialTheme.typography.titleMedium)
        FlowRow(horizontalArrangement=Arrangement.spacedBy(4.dp)){
            if(calendar.schoolWide)FilterChip(classKey=="school",onClick={classKey="school"},label={Text(stringResource(R.string.publish_whole_school))})
            if(existingClass!=null&&options.none{it.id==existingClass})FilterChip(classKey==existingClass,onClick={classKey=existingClass},label={
                Text(isolate(record?.string(if(language=="de")"classDe" else "classAr").orEmpty()))
            })
            for(option in options)FilterChip(classKey==option.id,onClick={classKey=option.id},label={Text(option.name)})
        }
        Text(stringResource(R.string.publish_original),style=MaterialTheme.typography.titleMedium)
        FlowRow(horizontalArrangement=Arrangement.spacedBy(4.dp)){
            FilterChip(original=="ar",onClick={original="ar"},label={Text(stringResource(R.string.broadcast_arabic))})
            FilterChip(original=="de",onClick={original="de"},label={Text(stringResource(R.string.broadcast_german))})
        }
        FlowRow(horizontalArrangement=Arrangement.spacedBy(4.dp)){
            FilterChip(editingLanguage=="ar",onClick={editingLanguage="ar"},label={Text(stringResource(R.string.broadcast_arabic)+(if(ar.complete)" ✓" else ""))})
            FilterChip(editingLanguage=="de",onClick={editingLanguage="de"},label={Text(stringResource(R.string.broadcast_german)+(if(de.complete)" ✓" else ""))})
        }
        if(editingLanguage=="ar")LocalizedFields("ar",ar){ar=it}
        else LocalizedFields("de",de){de=it}
        if(section==PublicationSection.Events){
            Text(isolate(calendar.timezone))
            FlowRow(horizontalArrangement=Arrangement.spacedBy(4.dp)){
                FilterChip(allDay,onClick={allDay=!allDay},label={Text(stringResource(R.string.publish_all_day))})
                FilterChip(hasEnd,onClick={hasEnd=!hasEnd},label={Text(stringResource(R.string.publish_add_end))})
            }
            PickDate(R.string.publish_start,startDate,calendar.date){startDate=it}
            if(!allDay)PickTime(R.string.publish_start,startTime){startTime=it}
            if(hasEnd)PickDate(R.string.publish_end,endDate,calendar.date){endDate=it}
            if(hasEnd&&!allDay)PickTime(R.string.publish_end,endTime){endTime=it}
        }
        Button(enabled=classKey!=null&&textAllowed&&timingAllowed&&!busy,onClick=::compose){Text(stringResource(R.string.publish_preview))}
    }
    if(saved?.optString("state")=="published")TextButton(enabled=!busy,onClick={confirmation=true}){
        Text(stringResource(R.string.publish_withdraw))
    }
    TextButton(enabled=!busy,onClick=dismiss){Text(stringResource(R.string.back))}
    if(confirmation)AlertDialog(
        onDismissRequest={confirmation=false},
        title={Text(stringResource(R.string.publish_confirm_withdraw))},
        confirmButton={TextButton(onClick={confirmation=false;commit("withdraw")}){Text(stringResource(R.string.publish_withdraw))}},
        dismissButton={TextButton(onClick={confirmation=false}){Text(stringResource(R.string.back))}},
    )
}

@Composable
private fun LocalizedFields(locale:String,copy:ContentFields,change:(ContentFields)->Unit){
    val dir=if(locale=="ar")TextDirection.ContentOrRtl else TextDirection.ContentOrLtr
    Text(stringResource(if(locale=="ar")R.string.broadcast_arabic else R.string.broadcast_german))
    OutlinedTextField(copy.title,{change(copy.copy(title=it.take(180)))},Modifier.fillMaxWidth(),
        textStyle=TextStyle(textDirection=dir),label={Text(stringResource(R.string.broadcast_subject))},singleLine=true)
    OutlinedTextField(copy.body,{change(copy.copy(body=it.take(4000)))},Modifier.fillMaxWidth(),
        textStyle=TextStyle(textDirection=dir),label={Text(stringResource(R.string.broadcast_body))},minLines=3)
}
@Composable
private fun PickDate(label:Int,value:String,fallback:LocalDate,choose:(String)->Unit){
    val context=LocalContext.current
    TextButton(onClick={
        val date=localDate(value)?:fallback
        DatePickerDialog(context,{_,year,month,day->choose(LocalDate.of(year,month+1,day).toString())},
            date.year,date.monthValue-1,date.dayOfMonth).show()
    }){Text(stringResource(label)+" · "+isolate(value))}
}
@Composable
private fun PickTime(label:Int,value:String,choose:(String)->Unit){
    val context=LocalContext.current
    TextButton(onClick={
        val time=localTime(value)?:LocalTime.of(9,0)
        TimePickerDialog(context,{_,hour,minute->choose("%02d:%02d".format(Locale.ROOT,hour,minute))},time.hour,time.minute,true).show()
    }){Text(stringResource(label)+" · "+isolate(value))}
}
private suspend fun IdentityViewModel.publishingObject(path:String,body:JSONObject?=null,method:String="GET",key:String?=null)=
    decodeData(schoolRequest(path,body,method,key)){it as JSONObject}.data
