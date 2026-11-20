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
import de.madrasty.app.school.Submit
import de.madrasty.app.school.records
import de.madrasty.app.school.schoolCommand
import de.madrasty.app.school.timetableObject
import de.madrasty.app.ui.AsyncSurface
import de.madrasty.app.ui.isolate
import java.math.BigDecimal
import java.text.NumberFormat
import java.util.Locale
import org.json.JSONArray
import org.json.JSONObject

@Composable
fun GradebookScreen(model:IdentityViewModel,initial:String?,openHomework:(String)->Unit,close:()->Unit){
    val language=if(LocalConfiguration.current.locales[0].language=="de")"de" else "ar"
    var selected by remember(initial){mutableStateOf(initial)}
    var version by remember{mutableStateOf(0)}
    val lifecycle=LocalLifecycleOwner.current.lifecycle
    DisposableEffect(lifecycle){
        val listener=LifecycleEventObserver{_,event->if(event==Lifecycle.Event.ON_RESUME)version++}
        lifecycle.addObserver(listener)
        onDispose{lifecycle.removeObserver(listener)}
    }
    val back:()->Unit={if(selected!=null){selected=null;version++}else close()}
    BackHandler(onBack=back)
    Column(Modifier.fillMaxSize().safeDrawingPadding().imePadding().verticalScroll(rememberScrollState()).padding(20.dp),
        verticalArrangement=Arrangement.spacedBy(8.dp)){
        TextButton(onClick=back){Text(stringResource(R.string.back))}
        val id=selected
        Text(stringResource(if(id==null)R.string.gradebook_title else R.string.gradebook_sheet),style=MaterialTheme.typography.headlineMedium)
        if(id==null)GradingInbox(model,language,version){selected=it}
        else{
            val record=academicRead("/academics/homework/$id",version){model.timetableObject(it)}
            AsyncSurface(record){item->
                Text(isolate(item.getString("title")),style=MaterialTheme.typography.titleLarge)
                TextButton(onClick={openHomework(id)}){Text(stringResource(R.string.gradebook_homework))}
                key(id){GradeRoster(model,item,language,version)}
            }
        }
    }
}

@Composable
private fun GradingInbox(model:IdentityViewModel,language:String,version:Int,open:(String)->Unit){
    var classId by remember{mutableStateOf<String?>(null)}
    val choices=academicRead("/academics/offerings",version){model.records(it)}
    AsyncSurface(choices){items->
        val rooms=items.filter{it.optBoolean("canGrade")}.distinctBy{it.getString("classId")}
        FilterChip(classId==null,onClick={classId=null},label={Text(stringResource(R.string.gradebook_all_classes))})
        rooms.forEach{room->
            val id=room.getString("classId")
            FilterChip(classId==id,onClick={classId=id},label={Text(offeringLabel(room,language))})
        }
    }
    val filter=classId?.let{"&classId=$it"}.orEmpty()
    academicPages(model,"/academics/grading?limit=25$filter",version){items->
        items.forEach{entry->
            HorizontalDivider()
            TextButton(onClick={open(entry.getString("homeworkId"))}){Text(isolate(entry.getString("title")))}
            Text(isolate(entry.getString("classCode"))+" · "+isolate(entry.getString(if(language=="ar")"subjectNameAr" else "subjectNameDe")))
            GradedCount(language,entry.getInt("graded"),entry.getInt("total"))
        }
    }
}

private data class HomeworkScoreDraft(val raw:String,val previous:Double?,val revision:Int,val visible:Boolean,val reason:String=""){
    val score get()=homeworkMark(raw)
    val valid get()=(raw.isBlank()||score!=null)&&(!visible||reason.isNotBlank())
}
private fun scoreDraft(row:JSONObject)=HomeworkScoreDraft(
    gradeNumber(row,"score")?.let{BigDecimal.valueOf(it).stripTrailingZeros().toPlainString()}.orEmpty(),
    gradeNumber(row,"score"),row.getInt("revision"),row.getBoolean("visible"),
)

@Composable
private fun GradeRoster(model:IdentityViewModel,homework:JSONObject,language:String,version:Int){
    val id=homework.getString("id")
    val path="/academics/homework/$id/grades"
    val attempts=remember{mutableMapOf<String,Pair<String,String>>()}
    var updated by remember{mutableStateOf(0)}
    var drafts by remember{mutableStateOf(emptyMap<String,HomeworkScoreDraft>())}
    var problems by remember{mutableStateOf(emptyMap<String,Int>())}
    var count by remember{mutableStateOf<Pair<Int,Int>?>(null)}
    fun choose(student:String,draft:HomeworkScoreDraft?){
        drafts=if(draft==null||(draft.raw.isBlank()||draft.score!=null)&&draft.score==draft.previous)drafts-student
        else drafts+(student to draft)
        problems=problems-student
    }
    TextButton(onClick={updated++;count=null}){Text(stringResource(R.string.curriculum_refresh))}
    if(homework.optBoolean("canGrade")&&drafts.isNotEmpty()){
        Submit(drafts.size<=1000,R.string.gradebook_bulk){
            val candidates=drafts.entries.toList()
            val invalid=candidates.filterNot{it.value.valid}
            if(invalid.isNotEmpty()){
                problems=invalid.associate{it.key to R.string.gradebook_invalid}
                throw HttpFailure(422,"validation")
            }
            val rows=JSONArray()
            for((student,draft) in candidates){
                val row=JSONObject().put("studentId",student).put("revision",draft.revision).put("score",draft.score?:JSONObject.NULL)
                if(draft.reason.isNotBlank())row.put("reasonIfCorrection",draft.reason.trim())
                rows.put(row)
            }
            try{
                val posted=model.schoolCommand(attempts,"$path/bulk","POST",JSONObject().put("rows",rows))
                val committed=candidates.associate{it.key to it.value}
                drafts=drafts.filter{(student,draft)->draft!=committed[student]};problems=emptyMap()
                count=posted.getInt("graded") to posted.getInt("total")
                updated++
            }catch(error:HttpFailure){
                problems=error.fields.entries.mapNotNull{(key,message)->
                    val matching=gradeErrorField.matchEntire(key)?.groupValues?.get(1)?:return@mapNotNull null
                    val student=matching.toIntOrNull()?.let{candidates.getOrNull(it)?.key}?:matching
                    student to if(message=="error.staleRevision")R.string.conflict else R.string.gradebook_invalid
                }.toMap()
                if(error.status in listOf(401,403,404))drafts=emptyMap()
                if(error.status in listOf(401,403,404,409))updated++
                throw error
            }
        }
    }
    count?.let{GradedCount(language,it.first,it.second)}
    academicPages(model,"$path?limit=35",version+updated){rows->
        rows.forEach{row->
            val student=row.getString("studentId")
            key(student){
                val draft=drafts[student]
                HorizontalDivider()
                Text(isolate(row.getString("studentName"))+" · "+isolate(row.getString("studentNumber")),
                    style=MaterialTheme.typography.titleMedium)
                Text(formatHomeworkMark(language,gradeNumber(row,"score")))
                if(row.getBoolean("canEdit")){
                    ScoreField(R.string.homework_score,draft?.raw?:scoreDraft(row).raw){
                        choose(student,(draft?:scoreDraft(row)).copy(raw=it))
                    }
                    if(draft?.visible==true)AcademicLongField(R.string.gradebook_reason,draft.reason,500){
                        choose(student,draft.copy(reason=it))
                    }
                    if(draft!=null&&draft.revision!=row.getInt("revision"))TextButton(onClick={
                        choose(student,scoreDraft(row).copy(raw=draft.raw,reason=draft.reason))
                    }){Text(stringResource(R.string.gradebook_reapply))}
                }
                problems[student]?.let{Text(stringResource(it))}
                GradeIndividually(model,"$path/$student",row,language,{updated++}){choose(student,null);updated++}
            }
        }
    }
}
private val gradeErrorField=Regex("rows\\.([^.]+)(?:\\..*)?")

private data class FeedbackDraft(val score:HomeworkScoreDraft,val raw:String,val previous:String?)

@Composable
private fun GradeIndividually(model:IdentityViewModel,path:String,row:JSONObject,language:String,reload:()->Unit,changed:()->Unit){
    val attempts=remember{mutableMapOf<String,Pair<String,String>>()}
    var editor by remember{mutableStateOf<FeedbackDraft?>(null)}
    var showHistory by remember{mutableStateOf(false)}
    var acknowledged by remember{mutableStateOf(false)}
    row.string("feedback")?.let{Text(isolate(it))}
    val draft=editor
    if(row.getBoolean("canEdit")){
        if(draft==null)TextButton(onClick={
            val before=row.string("feedback")
            editor=FeedbackDraft(scoreDraft(row),before.orEmpty(),before)
            acknowledged=false
        }){Text(stringResource(R.string.gradebook_individual))}
        else{
            ScoreField(R.string.homework_score,draft.score.raw){editor=draft.copy(score=draft.score.copy(raw=it))}
            AcademicLongField(R.string.homework_feedback,draft.raw,3000){editor=draft.copy(raw=it)}
            if(draft.score.visible)AcademicLongField(R.string.gradebook_reason,draft.score.reason,500){
                editor=draft.copy(score=draft.score.copy(reason=it))
            }
            val proposedScore=draft.score.score
            val feedback=draft.raw.trim().takeIf(String::isNotEmpty)
            val scoreChanged=proposedScore!=draft.score.previous
            val feedbackChanged=feedback!=draft.previous
            Submit(draft.score.valid&&(scoreChanged||feedbackChanged),success=null){
                val body=JSONObject().put("revision",draft.score.revision)
                if(scoreChanged)body.put("score",proposedScore?:JSONObject.NULL)
                if(feedbackChanged)body.put("feedback",feedback?:JSONObject.NULL)
                if(draft.score.reason.isNotBlank())body.put("reasonIfCorrection",draft.score.reason.trim())
                try{
                    model.schoolCommand(attempts,path,"PATCH",body)
                    if(editor==draft)editor=null
                    acknowledged=true;changed()
                }catch(error:HttpFailure){
                    if(error.status in listOf(401,403,404))editor=null
                    if(error.status in listOf(401,403,404,409))reload()
                    throw error
                }
            }
            if(draft.score.revision!=row.getInt("revision"))TextButton(onClick={
                val refreshed=scoreDraft(row).copy(raw=draft.score.raw,reason=draft.score.reason)
                editor=FeedbackDraft(refreshed,draft.raw,row.string("feedback"))
            }){Text(stringResource(R.string.gradebook_reapply))}
            TextButton(onClick={editor=null}){Text(stringResource(R.string.cancel))}
        }
    }
    if(acknowledged)Text(stringResource(R.string.saved))
    if(row.getBoolean("corrected")){
        TextButton(onClick={showHistory=!showHistory}){Text(stringResource(R.string.academic_correction_history))}
        if(showHistory)GradeHistory(model,path,language,row.getInt("revision"))
    }
}

@Composable
private fun GradeHistory(model:IdentityViewModel,path:String,language:String,revision:Int){
    val read=academicRead(path,revision){model.records(it)}
    AsyncSurface(read){items->
        for(entry in items){
            Text(isolate(entry.getString("occurredAt")))
            entry.string("actorName")?.let{Text(isolate(it))}
            Text(stringResource(R.string.gradebook_before)+" · "+formatHomeworkMark(language,gradeNumber(entry,"previousScore")))
            entry.string("previousFeedback")?.let{Text(isolate(it))}
            Text(stringResource(R.string.gradebook_after)+" · "+formatHomeworkMark(language,gradeNumber(entry,"score")))
            entry.string("feedback")?.let{Text(isolate(it))}
            Text(isolate(entry.getString("reason")))
        }
    }
}

private val numberPattern=Regex("[0-9]+(?:\\.[0-9]+)?")
private fun homeworkMark(raw:String):Double?{
    val normalized=buildString{
        for(char in raw.trim())when(char){
            in '٠'..'٩'->append(char-'٠')
            in '۰'..'۹'->append(char-'۰')
            ',', '٫'->append('.')
            else->append(char)
        }
    }
    if(!numberPattern.matches(normalized))return null
    val amount=normalized.toBigDecimalOrNull()?:return null
    if(amount>BigDecimal.valueOf(20)||amount.multiply(BigDecimal.valueOf(2)).stripTrailingZeros().scale()>0)return null
    return amount.toDouble()
}
private fun gradeNumber(item:JSONObject,key:String):Double?=if(item.isNull(key))null else item.getDouble(key)
@Composable
private fun formatHomeworkMark(language:String,score:Double?):String{
    if(score==null)return stringResource(R.string.academic_mark_pending)
    val fmt=NumberFormat.getNumberInstance(Locale.forLanguageTag(language)).apply{maximumFractionDigits=1}
    return isolate(fmt.format(score)+" / "+fmt.format(20))
}
@Composable
private fun GradedCount(language:String,graded:Int,total:Int){
    val fmt=NumberFormat.getIntegerInstance(Locale.forLanguageTag(language))
    Text(stringResource(R.string.gradebook_graded)+" · "+isolate(fmt.format(graded)+" / "+fmt.format(total)))
}
