package de.madrasty.app.academics

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import de.madrasty.app.R
import de.madrasty.app.identity.IdentityViewModel
import de.madrasty.app.school.Field
import de.madrasty.app.school.Submit
import de.madrasty.app.school.records
import de.madrasty.app.school.schoolCommand
import de.madrasty.app.school.timetableDate
import de.madrasty.app.school.timetableObject
import de.madrasty.app.ui.AsyncSurface
import de.madrasty.app.ui.isolate
import java.math.BigDecimal
import java.text.NumberFormat
import java.util.Locale
import org.json.JSONObject

@Composable
internal fun ActivityWork(model:IdentityViewModel,language:String,child:String?,offering:String?,refresh:Int){
    var selected by remember{mutableStateOf<String?>(null)}
    var creating by remember{mutableStateOf(false)}
    var updated by remember{mutableStateOf(0)}
    val id=selected
    if(id!=null){
        BackHandler{selected=null}
        TextButton(onClick={selected=null}){Text(stringResource(R.string.back))}
        val path="/academics/activities/$id"+(child?.let{"?childId=$it"}?:"")
        val detail=academicRead(path,refresh+updated){model.timetableObject(it)}
        AsyncSurface(detail){item->
            val max=item.getDouble("maxScore")
            Text(isolate(item.getString("title")),style=MaterialTheme.typography.titleLarge)
            val subject=item.getString(if(language=="ar")"subjectNameAr" else "subjectNameDe")
            Text(listOf(item.getString("classCode"),subject,item.getString("date")).joinToString(" · ",transform=::isolate))
            if(child!=null)Text(activityScore(language,readScore(item,"score"),max))
            else key(id){ActivityRoster(model,item,language,refresh+updated)}
        }
        return
    }
    if(offering!=null&&child==null){
        if(creating)NewActivityForm(model,offering,{creating=false}){selected=it;creating=false;updated++}
        else TextButton(onClick={creating=true}){Text(stringResource(R.string.academic_new_activity))}
    }
    val filter=when{
        child!=null->"&childId=$child"
        offering!=null->"&offeringId=$offering"
        else->""
    }
    academicPages(model,"/academics/activities?limit=30$filter",refresh+updated){items->
        items.forEach{item->
            HorizontalDivider()
            TextButton(onClick={selected=item.getString("id")}){
                Text(isolate(item.getString("title"))+" · "+isolate(item.getString("date")))
            }
            if(child!=null)Text(activityScore(language,readScore(item,"score"),item.getDouble("maxScore")))
        }
    }
}

@Composable
private fun NewActivityForm(model:IdentityViewModel,offering:String,close:()->Unit,saved:(String)->Unit){
    var title by remember{mutableStateOf("")}
    var date by remember{mutableStateOf("")}
    var max by remember{mutableStateOf("")}
    val maximum=parseActivityScore(max)
    val attempts=remember{mutableMapOf<String,Pair<String,String>>()}
    Field(R.string.academic_activity_name,title){title=it.take(200)}
    Field(R.string.academic_actual_date,date){date=it.take(10)}
    ScoreField(R.string.academic_maximum,max){max=it}
    Submit(title.isNotBlank()&&timetableDate(date)&&maximum!=null&&maximum>BigDecimal.ZERO&&maximum<=maximumActivityScore){
        val body=JSONObject().put("offeringId",offering).put("title",title.trim()).put("date",date).put("maxScore",maximum!!.toDouble())
        val value=model.schoolCommand(attempts,"/academics/activities","POST",body)
        saved(value.getString("id"))
    }
    TextButton(onClick=close){Text(stringResource(R.string.cancel))}
}

@Composable
private fun ActivityRoster(model:IdentityViewModel,value:JSONObject,language:String,refresh:Int){
    val activity=value.getString("id")
    var version by remember{mutableStateOf(0)}
    Text(stringResource(R.string.academic_roster),style=MaterialTheme.typography.titleMedium)
    TextButton(onClick={version++}){Text(stringResource(R.string.curriculum_refresh))}
    academicPages(model,"/academics/activities/$activity/marks?limit=30",refresh+version){items->
        items.forEach{row->
            val student=row.getString("studentId")
            key(student){
                HorizontalDivider()
                Text(isolate(row.getString("studentName"))+" · "+isolate(row.getString("studentNumber")),
                    style=MaterialTheme.typography.titleMedium)
                ActivityMarkEditor(model,value,row,language){version++}
            }
        }
    }
}

private data class MarkDraft(val raw:String,val revision:Int,val before:Double?,val visible:Boolean,val reason:String="")

@Composable
private fun ActivityMarkEditor(model:IdentityViewModel,activity:JSONObject,row:JSONObject,language:String,saved:()->Unit){
    val attempts=remember{mutableMapOf<String,Pair<String,String>>()}
    var history by remember{mutableStateOf(false)}
    var draft by remember{mutableStateOf<MarkDraft?>(null)}
    var acknowledged by remember{mutableStateOf(false)}
    val current=readScore(row,"score")
    val maximum=activity.getDouble("maxScore")
    val path="/academics/activities/${activity.getString("id")}/marks/${row.getString("studentId")}"
    Text(activityScore(language,current,maximum))
    val editor=draft
    if(activity.getBoolean("canEdit")){
        if(editor==null)TextButton(onClick={
            draft=MarkDraft(current?.let{BigDecimal.valueOf(it).stripTrailingZeros().toPlainString()}.orEmpty(),
                row.getInt("revision"),current,row.getBoolean("visible"))
            acknowledged=false
        }){Text(stringResource(R.string.academic_edit_mark))}
        else{
            val amount=parseActivityScore(editor.raw)
            val proposed=amount?.toDouble()
            val valid=editor.raw.isBlank()||proposed!=null&&proposed<=maximum
            val correction=editor.visible&&editor.before!=proposed
            ScoreField(R.string.academic_score,editor.raw){draft=editor.copy(raw=it)}
            if(correction)AcademicLongField(R.string.academic_mark_reason,editor.reason,500){draft=editor.copy(reason=it)}
            Submit(valid&&(!correction||editor.reason.isNotBlank()),success=null){
                val body=JSONObject().put("revision",editor.revision).put("score",proposed?:JSONObject.NULL)
                if(correction)body.put("reasonIfCorrection",editor.reason.trim())
                model.schoolCommand(attempts,path,"PUT",body)
                draft=null;acknowledged=true;saved()
            }
            TextButton(onClick={draft=null}){Text(stringResource(R.string.cancel))}
        }
    }
    if(acknowledged)Text(stringResource(R.string.saved))
    if(row.getInt("revision")>2){
        TextButton(onClick={history=!history}){Text(stringResource(R.string.academic_correction_history))}
        if(history)ActivityCorrections(model,path,language,maximum,row.getInt("revision"))
    }
}

@Composable
private fun ActivityCorrections(model:IdentityViewModel,path:String,language:String,maximum:Double,revision:Int){
    val results=academicRead(path,revision){model.records(it)}
    AsyncSurface(results){items->
        items.forEach{entry->
            Text(activityScore(language,readScore(entry,"previousScore"),maximum)+" → "+activityScore(language,readScore(entry,"score"),maximum))
            val date=isolate(entry.getString("occurredAt"))
            entry.string("actorName")?.let{Text(isolate(it)+" · "+date)}?:Text(date)
            Text(isolate(entry.getString("reason")))
        }
    }
}

@Composable
internal fun ScoreField(label:Int,content:String,changed:(String)->Unit){
    OutlinedTextField(content,{changed(it.take(24))},label={Text(stringResource(label))},
        keyboardOptions=KeyboardOptions(keyboardType=KeyboardType.Decimal),singleLine=true)
}
private val maximumActivityScore=BigDecimal("1000000")
private val decimalScore=Regex("[0-9]+(?:\\.[0-9]{1,4})?")
internal fun parseActivityScore(text:String):BigDecimal?{
    val normalized=buildString{
        for(char in text.trim())when(char){
            in '٠'..'٩'->append(char-'٠')
            in '۰'..'۹'->append(char-'۰')
            ',', '٫'->append('.')
            '٬'->Unit
            else->append(char)
        }
    }
    return if(decimalScore.matches(normalized))normalized.toBigDecimalOrNull() else null
}
private fun readScore(value:JSONObject,key:String):Double?=if(value.isNull(key))null else value.getDouble(key)

@Composable
private fun activityScore(language:String,value:Double?,maximum:Double):String{
    if(value==null)return stringResource(R.string.academic_mark_pending)
    val formatter=NumberFormat.getNumberInstance(Locale.forLanguageTag(language)).apply{maximumFractionDigits=4}
    return isolate(formatter.format(value)+" / "+formatter.format(maximum))
}
