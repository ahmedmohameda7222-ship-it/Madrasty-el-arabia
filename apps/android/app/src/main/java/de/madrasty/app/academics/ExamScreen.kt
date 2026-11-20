package de.madrasty.app.academics

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
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import de.madrasty.app.R
import de.madrasty.app.identity.HttpFailure
import de.madrasty.app.identity.IdentityViewModel
import de.madrasty.app.school.Field
import de.madrasty.app.school.Submit
import de.madrasty.app.school.schoolCommand
import de.madrasty.app.school.timetableDate
import de.madrasty.app.school.timetableObject
import de.madrasty.app.ui.AsyncSurface
import de.madrasty.app.ui.Persona
import de.madrasty.app.ui.isolate
import java.math.BigDecimal
import java.text.NumberFormat
import java.util.Locale
import org.json.JSONObject

@Composable
fun ExamScreen(model:IdentityViewModel,persona:Persona,child:String?,initial:String?,close:()->Unit){
    val language=if(LocalConfiguration.current.locales[0].language=="de")"de" else "ar"
    var version by remember{mutableStateOf(0)}
    val lifecycle=LocalLifecycleOwner.current.lifecycle
    DisposableEffect(lifecycle){
        val observer=LifecycleEventObserver{_,event->if(event==Lifecycle.Event.ON_RESUME)version++}
        lifecycle.addObserver(observer)
        onDispose{lifecycle.removeObserver(observer)}
    }
    BackHandler(onBack=close)
    Column(Modifier.fillMaxSize().safeDrawingPadding().imePadding().verticalScroll(rememberScrollState()).padding(20.dp),
        verticalArrangement=Arrangement.spacedBy(8.dp)){
        TextButton(onClick=close){Text(stringResource(R.string.back))}
        Text(stringResource(R.string.exam_title),style=MaterialTheme.typography.headlineMedium)
        AssessmentScope(model,persona,language,child,initial,version,
            {it.optBoolean("canPlan")||it.optBoolean("canGrade")||it.optBoolean("canPublish")}){
            ExamList(model,it,language,version)
        }
    }
}

@Composable
private fun ExamList(model:IdentityViewModel,scope:AssessmentContext,language:String,version:Int){
    var selected by remember(scope.initial){mutableStateOf(scope.initial)}
    var creating by remember{mutableStateOf(false)}
    var changed by remember{mutableStateOf(0)}
    var notice by remember{mutableStateOf<Int?>(null)}
    val id=selected
    val child=scope.child
    notice?.let{Text(stringResource(it))}
    if(id!=null){
        val back={selected=null;notice=null}
        BackHandler(onBack=back)
        TextButton(onClick=back){Text(stringResource(R.string.exam_back))}
        val record=academicRead("/academics/exams/$id"+(child?.let{"?childId=$it"}?:""),version+changed){model.timetableObject(it)}
        AsyncSurface(record){exam->
            key(id){ExamDetails(model,exam,language,child!=null,version+changed){message->
                if(message!=null)notice=message
                changed++
            }}
        }
        return
    }
    val offering=scope.offering
    if(offering?.optBoolean("canPlan")==true){
        if(creating)ExamDraftForm(model,offering.getString("id"),null,{creating=false}){
            selected=it;creating=false;changed++;notice=R.string.saved
        }else TextButton(onClick={creating=true}){Text(stringResource(R.string.exam_new))}
    }
    val filter=when{
        child!=null->"&childId=$child"
        offering!=null->"&offeringId=${offering.getString("id")}"
        else->""
    }
    academicPages(model,"/academics/exams?limit=25$filter",version+changed){items->
        items.forEach{entry->
            HorizontalDivider()
            TextButton(onClick={selected=entry.getString("id");notice=null}){Text(isolate(entry.getString("title")))}
            Text(stringResource(examKindLabel(entry.getString("kind")))+" · "+examDate(entry.getString("date"),entry.string("time")))
            val status=if(child!=null){
                if(entry.isNull("resultId"))R.string.exam_result_pending else R.string.exam_result
            }else if(entry.isNull("announcementId"))R.string.exam_not_announced else R.string.exam_announced
            Text(stringResource(status))
        }
    }
}
private enum class ExamMode{Schedule,Announcement}

@Composable
private fun ExamDetails(model:IdentityViewModel,item:JSONObject,language:String,guardian:Boolean,version:Int,updated:(Int?)->Unit){
    var mode by remember{mutableStateOf<ExamMode?>(null)}
    var marks by remember{mutableStateOf(false)}
    val maximum=item.getDouble("maxScore")
    Text(isolate(item.getString("title")),style=MaterialTheme.typography.titleLarge)
    val subject=item.getString(if(language=="ar")"subjectNameAr" else "subjectNameDe")
    Text(isolate(item.getString("classCode"))+" · "+isolate(subject)+" · "+stringResource(examKindLabel(item.getString("kind"))))
    if(!guardian)Text(stringResource(R.string.exam_date)+" · "+examDate(item.getString("date"),item.string("time")))
    val official=item.string("announcedDate")
    if(official==null)Text(stringResource(R.string.exam_not_announced))
    else Text(stringResource(R.string.exam_announced)+" · "+examDate(official,item.string("announcedTime")))
    if(!guardian&&item.optBoolean("announcementPending")){
        Text(stringResource(R.string.exam_schedule_changes))
    }
    if(guardian)FamilyExamResult(item,language)
    else{
        Text(stringResource(R.string.academic_maximum)+" · "+isolate(examNumber(language).format(maximum)))
        if(mode==null){
            if(item.optBoolean("canEdit"))TextButton(onClick={mode=ExamMode.Schedule}){Text(stringResource(R.string.exam_edit))}
            if(item.optBoolean("canAnnounce"))TextButton(onClick={mode=ExamMode.Announcement}){
                Text(stringResource(if(official==null)R.string.exam_announce else R.string.exam_reschedule))
            }
            if(item.optBoolean("canReview"))TextButton(onClick={marks=!marks}){Text(stringResource(R.string.exam_marks))}
        }
        when(mode){
            ExamMode.Schedule->if(item.optBoolean("canEdit")){
                ExamDraftForm(model,item.getString("offeringId"),item,{mode=null}){mode=null;updated(R.string.saved)}
            }
            ExamMode.Announcement->if(item.optBoolean("canAnnounce")){
                ExamScheduleReview(model,item,{mode=null},{updated(null)}){mode=null;updated(R.string.exam_schedule_saved)}
            }
            null->Unit
        }
        if(marks&&item.optBoolean("canReview"))ExamMarksScreen(model,item,language,version,updated)
    }
    TextButton(onClick={updated(null)}){Text(stringResource(R.string.curriculum_refresh))}
}

@Composable
private fun FamilyExamResult(item:JSONObject,language:String){
    Text(stringResource(R.string.exam_result),style=MaterialTheme.typography.titleMedium)
    if(item.isNull("resultId")){
        Text(stringResource(R.string.exam_result_pending))
        return
    }
    val score=examValue(item,"resultScore")
    val maximum=item.getDouble("resultMaxScore")
    Text(examPoints(language,score,maximum))
    item.string("resultDate")?.let{Text(isolate(it))}
    item.string("resultFeedback")?.let{feedback->
        Text(stringResource(R.string.homework_feedback))
        Text(isolate(feedback))
    }
}
private data class ExamDraft(val title:String,val date:String,val time:String,val kind:String,val maximum:String)
private fun JSONObject.examDraft()=ExamDraft(getString("title"),getString("date"),string("time").orEmpty(),getString("kind"),
    BigDecimal.valueOf(getDouble("maxScore")).stripTrailingZeros().toPlainString())

@Composable
private fun ExamDraftForm(model:IdentityViewModel,offering:String,item:JSONObject?,cancel:()->Unit,saved:(String)->Unit){
    var draft by remember{mutableStateOf(item?.examDraft()?:ExamDraft("","","","written",""))}
    val base=remember{item?.getInt("revision")}
    val maximum=parseActivityScore(draft.maximum)
    val attempts=remember{mutableMapOf<String,Pair<String,String>>()}
    Field(R.string.exam_label,draft.title){draft=draft.copy(title=it.take(200))}
    Field(R.string.exam_date,draft.date){draft=draft.copy(date=it.take(10))}
    Field(R.string.exam_time,draft.time){draft=draft.copy(time=it.take(5))}
    Text(stringResource(R.string.exam_kind))
    for(kind in listOf("oral","written")){
        FilterChip(draft.kind==kind,onClick={draft=draft.copy(kind=kind)},label={Text(stringResource(examKindLabel(kind)))})
    }
    ScoreField(R.string.academic_maximum,draft.maximum){draft=draft.copy(maximum=it)}
    Submit(draft.title.isNotBlank()&&timetableDate(draft.date)&&validClock(draft.time)&&maximum!=null&&maximum>BigDecimal.ZERO&&maximum<=examMaximum){
        val body=JSONObject().put("title",draft.title.trim()).put("date",draft.date).put("time",draft.time.takeIf(String::isNotBlank)?:JSONObject.NULL)
            .put("kind",draft.kind).put("maxScore",checkNotNull(maximum).toDouble())
        val result=if(item==null)model.schoolCommand(attempts,"/academics/exams","POST",body.put("offeringId",offering))
        else model.schoolCommand(attempts,"/academics/exams/${item.getString("id")}","PATCH",body.put("revision",base))
        saved(result.getString("id"))
    }
    TextButton(onClick=cancel){Text(stringResource(R.string.cancel))}
}

@Composable
private fun ExamScheduleReview(model:IdentityViewModel,item:JSONObject,cancel:()->Unit,refresh:()->Unit,saved:()->Unit){
    val initial=remember{item.getInt("revision")}
    var day by remember{mutableStateOf(item.getString("date"))}
    var clock by remember{mutableStateOf(item.string("time").orEmpty())}
    var preview by remember{mutableStateOf(false)}
    val attempts=remember{mutableMapOf<String,Pair<String,String>>()}
    val current=initial==item.getInt("revision")
    HorizontalDivider()
    Text(stringResource(R.string.exam_review_schedule),style=MaterialTheme.typography.titleMedium)
    if(preview){
        Text(isolate(item.getString("title"))+" · "+stringResource(examKindLabel(item.getString("kind"))))
        Text(examDate(day,clock))
        Submit(current,R.string.exam_confirm_schedule,success=null){
            val body=JSONObject().put("revision",initial).put("date",day).put("time",clock.takeIf(String::isNotBlank)?:JSONObject.NULL)
            try{
                model.schoolCommand(attempts,"/academics/exams/${item.getString("id")}/announce","POST",body)
                saved()
            }catch(error:HttpFailure){
                if(error.status in listOf(401,403,404,409))refresh()
                throw error
            }
        }
        TextButton(onClick={preview=false}){Text(stringResource(R.string.exam_edit))}
    }else{
        Field(R.string.exam_date,day){day=it.take(10)}
        Field(R.string.exam_time,clock){clock=it.take(5)}
        TextButton(enabled=current&&timetableDate(day)&&validClock(clock),onClick={preview=true}){
            Text(stringResource(R.string.exam_review_schedule))
        }
    }
    TextButton(onClick=cancel){Text(stringResource(R.string.cancel))}
}

private val examMaximum=BigDecimal("1000000")
private val clockPattern=Regex("(?:[01][0-9]|2[0-3]):[0-5][0-9]")
private fun validClock(time:String)=time.isEmpty()||clockPattern.matches(time)
private fun examKindLabel(kind:String)=if(kind=="oral")R.string.exam_oral else R.string.exam_written
private fun examDate(date:String,time:String?)=isolate(if(time.isNullOrBlank())date else "$date · $time")
internal fun examValue(record:JSONObject,key:String)=if(record.isNull(key))null else record.getDouble(key)
private fun examNumber(language:String)=NumberFormat.getNumberInstance(Locale.forLanguageTag(language)).apply{maximumFractionDigits=4}

@Composable
internal fun examPoints(language:String,score:Double?,maximum:Double):String{
    if(score==null)return stringResource(R.string.academic_mark_pending)
    val format=examNumber(language)
    return isolate(format.format(score)+" / "+format.format(maximum))
}
