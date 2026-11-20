package de.madrasty.app.academics

import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.res.stringResource
import de.madrasty.app.R
import de.madrasty.app.identity.HttpFailure
import de.madrasty.app.identity.IdentityViewModel
import de.madrasty.app.school.Submit
import de.madrasty.app.school.records
import de.madrasty.app.school.schoolCommand
import de.madrasty.app.ui.AsyncSurface
import de.madrasty.app.ui.isolate
import java.math.BigDecimal
import java.text.NumberFormat
import java.util.Locale
import org.json.JSONArray
import org.json.JSONObject

private data class ToPublish(val student:String,val name:String,val score:Double,val revision:Int)
private data class ReviewedBatch(val revision:Int,val entries:List<ToPublish>)

@Composable
internal fun ExamMarksScreen(model:IdentityViewModel,exam:JSONObject,language:String,version:Int,changed:(Int?)->Unit){
    val id=exam.getString("id")
    val maximum=exam.getDouble("maxScore")
    val path="/academics/exams/$id"
    val attempts=remember{mutableMapOf<String,Pair<String,String>>()}
    var selection by remember{mutableStateOf(emptyMap<String,ToPublish>())}
    var preview by remember{mutableStateOf<ReviewedBatch?>(null)}
    var updated by remember{mutableStateOf(0)}
    val review=preview
    val canPublish=exam.optBoolean("canPublish")
    Text(stringResource(R.string.exam_marks),style=MaterialTheme.typography.titleLarge)
    if(canPublish&&review==null&&selection.isNotEmpty()){
        val amount=NumberFormat.getIntegerInstance(Locale.forLanguageTag(language)).format(selection.size)
        TextButton(onClick={preview=ReviewedBatch(exam.getInt("revision"),selection.values.toList())}){
            Text(stringResource(R.string.exam_batch_review)+" · "+isolate(amount))
        }
    }
    if(canPublish&&review!=null){
        HorizontalDivider()
        Text(stringResource(R.string.exam_batch_review),style=MaterialTheme.typography.titleMedium)
        review.entries.forEach{row->Text(isolate(row.name)+" · "+examPoints(language,row.score,maximum))}
        Submit(review.revision==exam.getInt("revision")&&review.entries.size<=1000,R.string.exam_publish_results,success=null){
            val reviewed=JSONArray()
            for(entry in review.entries)reviewed.put(JSONObject().put("studentId",entry.student).put("revision",entry.revision))
            try{
                model.schoolCommand(attempts,"$path/results/publish","POST",JSONObject().put("revision",review.revision).put("reviewedRows",reviewed))
                selection=emptyMap();preview=null;changed(R.string.exam_results_published);updated++
            }catch(error:HttpFailure){
                if(error.status in listOf(401,403,404,409)){selection=emptyMap();preview=null;changed(null);updated++}
                throw error
            }
        }
        TextButton(onClick={preview=null}){Text(stringResource(R.string.cancel))}
    }
    academicPages(model,"$path/marks?limit=30",version+updated){items->
        items.forEach{row->
            val student=row.getString("studentId")
            key(student){
                val score=examValue(row,"score")
                val published=row.string("publishedId")!=null
                val ready=row.optBoolean("readyToPublish")
                HorizontalDivider()
                Text(isolate(row.getString("studentName"))+" · "+isolate(row.getString("studentNumber")),style=MaterialTheme.typography.titleMedium)
                Text(stringResource(if(published)R.string.exam_result else R.string.exam_result_pending))
                Text(examPoints(language,score,examValue(row,"publishedMaxScore")?:maximum))
                if(!published&&!ready&&score!=null)Text(stringResource(R.string.exam_revisit_score))
                if(canPublish&&ready&&score!=null){
                    val entry=ToPublish(student,row.getString("studentName"),score,row.getInt("revision"))
                    val checked=selection[student]==entry
                    FilterChip(checked,enabled=review==null,onClick={selection=if(checked)selection-student else selection+(student to entry)},
                        label={Text(stringResource(R.string.exam_include))})
                }
                ExamMarkRow(model,path,exam,row,language,review!=null,{changed(null);updated++}){notice->
                    selection=selection-student;changed(notice);updated++
                }
            }
        }
    }
}

private data class ExamMarkDraft(
    val points:String,val feedback:String,val reason:String,val revision:Int,val examRevision:Int,
)

@Composable
private fun ExamMarkRow(
    model:IdentityViewModel,path:String,exam:JSONObject,row:JSONObject,language:String,locked:Boolean,
    refresh:()->Unit,saved:(Int)->Unit,
){
    var value by remember{mutableStateOf<ExamMarkDraft?>(null)}
    var showHistory by remember{mutableStateOf(false)}
    val student=row.getString("studentId")
    val revision=row.getInt("revision")
    val live=row.string("publishedId")!=null
    row.string("feedback")?.let{Text(isolate(it))}
    val draft=value
    val permitted=row.optBoolean("canMark")||row.optBoolean("canCorrect")
    if(permitted&&draft==null)TextButton(enabled=!locked,onClick={
        val score=examValue(row,"score")?.let{BigDecimal.valueOf(it).stripTrailingZeros().toPlainString()}.orEmpty()
        value=ExamMarkDraft(score,row.string("feedback").orEmpty(),"",revision,exam.getInt("revision"))
    }){Text(stringResource(if(live)R.string.exam_correct else R.string.exam_enter_mark))}
    if(permitted&&draft!=null){
        ExamMarkForm(model,path,student,exam,draft,revision,language,live,locked,refresh,{value=it},{value=null}){reviewed->
            if(value==reviewed)value=null
            saved(if(live)R.string.exam_correction_saved else R.string.exam_mark_saved)
        }
    }
    if(live){
        TextButton(onClick={showHistory=!showHistory}){Text(stringResource(R.string.exam_result_history))}
        if(showHistory)ExamHistory(model,"$path/results/$student/history",language,revision)
    }
}

@Composable
private fun ExamMarkForm(
    model:IdentityViewModel,path:String,student:String,exam:JSONObject,draft:ExamMarkDraft,rowRevision:Int,
    language:String,live:Boolean,locked:Boolean,refresh:()->Unit,edit:(ExamMarkDraft)->Unit,close:()->Unit,saved:(ExamMarkDraft)->Unit,
){
    var reviewed by remember{mutableStateOf(false)}
    val attempts=remember{mutableMapOf<String,Pair<String,String>>()}
    val proposed=parseActivityScore(draft.points)?.toDouble()
    val maximum=exam.getDouble("maxScore")
    val within=proposed!=null&&proposed<=maximum
    val current=draft.revision==rowRevision&&draft.examRevision==exam.getInt("revision")
    if(!reviewed){
        ScoreField(R.string.academic_score,draft.points){edit(draft.copy(points=it))}
        AcademicLongField(R.string.homework_feedback,draft.feedback,3000){edit(draft.copy(feedback=it))}
        if(live)AcademicLongField(R.string.evaluation_reason,draft.reason,500){edit(draft.copy(reason=it))}
    }else{
        Text(stringResource(R.string.exam_review_correction),style=MaterialTheme.typography.titleMedium)
        Text(examPoints(language,proposed,maximum))
        if(draft.feedback.isNotBlank())Text(isolate(draft.feedback))
        Text(isolate(draft.reason))
    }
    if(live&&!reviewed){
        TextButton(enabled=!locked&&current&&within&&draft.reason.isNotBlank(),onClick={reviewed=true}){
            Text(stringResource(R.string.exam_review_correction))
        }
    }else{
        val valid=within||!live&&draft.points.isBlank()
        val action=if(live)R.string.evaluation_confirm else R.string.school_save
        Submit(!locked&&current&&valid,action,success=null){
            val body=JSONObject().put("revision",draft.revision).put("score",proposed?:JSONObject.NULL)
                .put("feedback",draft.feedback.trim().takeIf(String::isNotEmpty)?:JSONObject.NULL)
            try{
                if(live)model.schoolCommand(attempts,"$path/results/$student/correct","POST",
                    body.put("reason",draft.reason.trim()).put("examRevision",draft.examRevision))
                else model.schoolCommand(attempts,"$path/marks/$student","PUT",body)
                saved(draft)
            }catch(error:HttpFailure){
                if(error.status in listOf(401,403,404))close()
                if(error.status in listOf(401,403,404,409))refresh()
                throw error
            }
        }
    }
    if(reviewed)TextButton(onClick={reviewed=false}){Text(stringResource(R.string.exam_edit))}
    TextButton(onClick=close){Text(stringResource(R.string.cancel))}
}

@Composable
private fun ExamHistory(model:IdentityViewModel,path:String,language:String,version:Int){
    val history=academicRead(path,version){model.records(it)}
    AsyncSurface(history){items->
        for(entry in items){
            HorizontalDivider()
            Text(examPoints(language,entry.getDouble("score"),entry.getDouble("maxScore")))
            Text(isolate(entry.getString("occurredAt")))
            entry.string("actorName")?.let{Text(isolate(it))}
            entry.string("feedback")?.let{Text(isolate(it))}
            entry.string("reason")?.let{Text(isolate(it))}
        }
    }
}
