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
import de.madrasty.app.school.records
import de.madrasty.app.school.schoolCommand
import de.madrasty.app.school.timetableDate
import de.madrasty.app.school.timetableObject
import de.madrasty.app.ui.AsyncSurface
import de.madrasty.app.ui.Persona
import de.madrasty.app.ui.isolate
import java.text.NumberFormat
import java.util.Locale
import org.json.JSONObject

@Composable
fun EvaluationScreen(model:IdentityViewModel,persona:Persona,child:String?,initial:String?,close:()->Unit){
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
        Text(stringResource(R.string.evaluation_title),style=MaterialTheme.typography.headlineMedium)
        AssessmentScope(model,persona,language,child,initial,version,{it.optBoolean("canGrade")||it.optBoolean("canPublish")}){
            EvaluationList(model,it,language,version)
        }
    }
}

@Composable
private fun EvaluationList(model:IdentityViewModel,scope:AssessmentContext,language:String,version:Int){
    var selected by remember(scope.initial){mutableStateOf(scope.initial)}
    var creating by remember{mutableStateOf(false)}
    var updated by remember{mutableStateOf(0)}
    var message by remember{mutableStateOf<Int?>(null)}
    val child=scope.child
    val id=selected
    message?.let{Text(stringResource(it))}
    if(id!=null){
        val back={selected=null;message=null}
        BackHandler(onBack=back)
        TextButton(onClick=back){Text(stringResource(R.string.evaluation_back))}
        val query=child?.let{"?childId=$it"}.orEmpty()
        val record=academicRead("/academics/evaluations/$id$query",version+updated){model.timetableObject(it)}
        AsyncSurface(record){value->
            key(id){EvaluationDetails(model,value,language,child!=null){notice->
                if(notice!=null)message=notice
                updated++
            }}
        }
        return
    }
    val offering=scope.offering
    if(offering?.optBoolean("canGrade")==true){
        if(creating)EvaluationDraftForm(model,offering.getString("id"),null,language,{creating=false}){
            creating=false;selected=it;message=R.string.saved;updated++
        }else TextButton(onClick={creating=true}){Text(stringResource(R.string.evaluation_create))}
    }
    val filter=when{
        child!=null -> "&childId=$child"
        offering!=null -> "&offeringId=${offering.getString("id")}"
        else -> ""
    }
    academicPages(model,"/academics/evaluations?limit=25$filter",version+updated){items->
        items.forEach{record->
            HorizontalDivider()
            TextButton(onClick={selected=record.getString("id");message=null}){
                Text(isolate(record.getString("title"))+" · "+isolate(record.getString("studentName")))
            }
            Text(isolate(record.getString("periodStart")+" – "+record.getString("periodEnd")))
            if(child==null)Text(stringResource(if(record.isNull("publishedId"))R.string.curriculum_draft else R.string.evaluation_published))
        }
    }
}

private data class EvaluationFields(
    val title:String="",val participation:Int?=null,val understanding:Int?=null,val preparation:Int?=null,
    val strengths:String="",val improvements:String="",
){
    val complete get()=title.isNotBlank()&&participation!=null&&understanding!=null&&preparation!=null
    fun body()=JSONObject().put("title",title.trim()).put("participation",participation?:JSONObject.NULL)
        .put("understanding",understanding?:JSONObject.NULL).put("preparation",preparation?:JSONObject.NULL)
        .put("strengths",strengths.trim()).put("improvements",improvements.trim())
    companion object{
        fun read(item:JSONObject)=EvaluationFields(item.getString("title"),item.scale("participation"),
            item.scale("understanding"),item.scale("preparation"),item.getString("strengths"),item.getString("improvements"))
    }
}
private fun JSONObject.scale(name:String):Int?=if(isNull(name))null else getInt(name)

@Composable
private fun EvaluationDraftForm(
    model:IdentityViewModel,offering:String,item:JSONObject?,language:String,cancel:()->Unit,saved:(String)->Unit,
){
    var fields by remember{mutableStateOf(item?.let(EvaluationFields::read)?:EvaluationFields())}
    var from by remember{mutableStateOf(item?.string("periodStart").orEmpty())}
    var until by remember{mutableStateOf(item?.string("periodEnd").orEmpty())}
    var pupil by remember{mutableStateOf(item?.string("studentId"))}
    val base=remember{item?.getInt("revision")}
    val editable=item?.string("publishedId")==null
    val attempts=remember{mutableMapOf<String,Pair<String,String>>()}
    Field(R.string.evaluation_period_start,from,editable){from=it.take(10)}
    Field(R.string.evaluation_period_end,until,editable){until=it.take(10);if(item==null)pupil=null}
    if(item==null&&timetableDate(until)){
        Text(stringResource(R.string.evaluation_pupil))
        academicPages(model,"/academics/evaluations/roster?offeringId=$offering&date=$until&limit=30",0){items->
            items.forEach{record->
                val id=record.getString("studentId")
                FilterChip(pupil==id,onClick={pupil=id},label={
                    Text(isolate(record.getString("studentName"))+" · "+isolate(record.getString("studentNumber")))
                })
            }
        }
    }
    EvaluationFieldsEditor(fields,language){fields=it}
    Submit(fields.title.isNotBlank()&&timetableDate(from)&&timetableDate(until)&&from<=until&&pupil!=null,R.string.evaluation_save){
        val body=fields.body().put("periodStart",from).put("periodEnd",until)
        val record=if(item==null)model.schoolCommand(attempts,"/academics/evaluations","POST",body.put("offeringId",offering).put("studentId",pupil))
        else model.schoolCommand(attempts,"/academics/evaluations/${item.getString("id")}","PATCH",body.put("revision",base))
        saved(record.getString("id"))
    }
    TextButton(onClick=cancel){Text(stringResource(R.string.cancel))}
}

@Composable
private fun EvaluationFieldsEditor(value:EvaluationFields,language:String,change:(EvaluationFields)->Unit){
    Field(R.string.evaluation_label,value.title){change(value.copy(title=it.take(200)))}
    EvaluationScale(R.string.evaluation_participation,value.participation,language){change(value.copy(participation=it))}
    EvaluationScale(R.string.evaluation_understanding,value.understanding,language){change(value.copy(understanding=it))}
    EvaluationScale(R.string.evaluation_preparation,value.preparation,language){change(value.copy(preparation=it))}
    AcademicLongField(R.string.evaluation_strengths,value.strengths,6000){change(value.copy(strengths=it))}
    AcademicLongField(R.string.evaluation_improvements,value.improvements,6000){change(value.copy(improvements=it))}
}

@Composable
private fun EvaluationScale(label:Int,value:Int?,language:String,change:(Int?)->Unit){
    val number=NumberFormat.getIntegerInstance(Locale.forLanguageTag(language))
    Text(stringResource(label))
    FilterChip(value==null,onClick={change(null)},label={Text(stringResource(R.string.evaluation_unfilled))})
    for(score in 1..5){
        FilterChip(value==score,onClick={change(score)},label={Text(number.format(score))})
    }
}

@Composable
private fun EvaluationValues(value:EvaluationFields,language:String){
    val number=NumberFormat.getIntegerInstance(Locale.forLanguageTag(language))
    val scores=listOf(R.string.evaluation_participation to value.participation,
        R.string.evaluation_understanding to value.understanding,R.string.evaluation_preparation to value.preparation)
    for((label,score) in scores){
        val text=if(score==null)stringResource(R.string.evaluation_unfilled) else isolate(number.format(score)+" / "+number.format(5))
        Text(stringResource(label)+" · "+text)
    }
    for((label,notes) in listOf(R.string.evaluation_strengths to value.strengths,R.string.evaluation_improvements to value.improvements)){
        if(notes.isNotBlank()){
            Text(stringResource(label),style=MaterialTheme.typography.titleMedium)
            Text(isolate(notes))
        }
    }
}

private enum class EvaluationMode{Draft,Publish,Correct}

@Composable
private fun EvaluationDetails(model:IdentityViewModel,value:JSONObject,language:String,guardian:Boolean,update:(Int?)->Unit){
    var mode by remember{mutableStateOf<EvaluationMode?>(null)}
    var history by remember{mutableStateOf(false)}
    val id=value.getString("id")
    val fields=EvaluationFields.read(value)
    val publication=value.string("publishedId")
    Text(isolate(fields.title),style=MaterialTheme.typography.titleLarge)
    val pupil=value.getString("studentName")
    val subject=value.getString(if(language=="ar")"subjectNameAr" else "subjectNameDe")
    Text(listOf(pupil,value.getString("classCode"),subject).joinToString(" · ",transform=::isolate))
    Text(isolate(value.getString("periodStart")+" – "+value.getString("periodEnd")))
    val publishedAt=value.string("publishedAt")
    if(publishedAt!=null)Text(stringResource(R.string.curriculum_published)+" · "+isolate(publishedAt))
    else Text(stringResource(R.string.curriculum_draft))
    if(publication!=null&&value.optInt("publishedRevision")!=value.getInt("revision")){
        Text(stringResource(R.string.curriculum_draft_changes))
    }
    EvaluationValues(fields,language)
    if(mode==null){
        if(value.getBoolean("canEdit"))TextButton(onClick={mode=EvaluationMode.Draft}){Text(stringResource(R.string.evaluation_edit))}
        if(value.getBoolean("canPublish")){
            if(publication==null)TextButton(enabled=fields.complete,onClick={mode=EvaluationMode.Publish}){Text(stringResource(R.string.evaluation_review))}
            else TextButton(onClick={mode=EvaluationMode.Correct}){Text(stringResource(R.string.evaluation_correct))}
        }
    }
    when(val active=mode){
        EvaluationMode.Draft->if(value.getBoolean("canEdit")){
            EvaluationDraftForm(model,value.getString("offeringId"),value,language,{mode=null}){mode=null;update(R.string.saved)}
        }
        EvaluationMode.Publish,EvaluationMode.Correct->if(value.getBoolean("canPublish"))key(active){
            EvaluationReview(model,id,value.getInt("revision"),fields,language,active==EvaluationMode.Correct,{mode=null},{update(null)}){
                mode=null
                update(if(active==EvaluationMode.Correct)R.string.evaluation_corrected else R.string.evaluation_published)
            }
        }
        null->Unit
    }
    if(publication!=null&&!guardian){
        TextButton(onClick={history=!history}){Text(stringResource(R.string.evaluation_history))}
        if(history)PublicationHistory(model,id,language,value.getInt("publishedRevision"))
    }
    TextButton(onClick={update(null)}){Text(stringResource(R.string.curriculum_refresh))}
}

@Composable
private fun EvaluationReview(
    model:IdentityViewModel,id:String,revision:Int,original:EvaluationFields,language:String,correction:Boolean,
    cancel:()->Unit,refresh:()->Unit,saved:()->Unit,
){
    var fields by remember{mutableStateOf(original)}
    var reason by remember{mutableStateOf("")}
    var reviewed by remember{mutableStateOf(!correction)}
    val base=remember{revision}
    val attempts=remember{mutableMapOf<String,Pair<String,String>>()}
    HorizontalDivider()
    Text(stringResource(R.string.evaluation_review),style=MaterialTheme.typography.titleMedium)
    if(!reviewed){
        EvaluationFieldsEditor(fields,language){fields=it}
        AcademicLongField(R.string.evaluation_reason,reason,500){reason=it}
        TextButton(enabled=fields.complete&&reason.isNotBlank()&&base==revision,onClick={reviewed=true}){
            Text(stringResource(R.string.evaluation_review))
        }
    }else{
        Text(isolate(fields.title),style=MaterialTheme.typography.titleMedium)
        EvaluationValues(fields,language)
        if(correction)Text(isolate(reason))
        Submit(base==revision,if(correction)R.string.evaluation_confirm else R.string.evaluation_publish,success=null){
            val body=JSONObject().put("revision",base)
            if(correction)body.put("changes",fields.body()).put("reason",reason.trim())
            val action=if(correction)"correct" else "publish"
            try{
                model.schoolCommand(attempts,"/academics/evaluations/$id/$action","POST",body)
                saved()
            }catch(error:HttpFailure){
                if(error.status in listOf(401,403,404,409))refresh()
                throw error
            }
        }
        if(correction)TextButton(onClick={reviewed=false}){Text(stringResource(R.string.evaluation_edit))}
    }
    TextButton(onClick=cancel){Text(stringResource(R.string.cancel))}
}

@Composable
private fun PublicationHistory(model:IdentityViewModel,id:String,language:String,version:Int){
    val records=academicRead("/academics/evaluations/$id/history",version){model.records(it)}
    AsyncSurface(records){items->
        items.forEach{entry->
            HorizontalDivider()
            Text(isolate(entry.getString("title")),style=MaterialTheme.typography.titleMedium)
            Text(isolate(entry.getString("publishedAt")))
            entry.string("actorName")?.let{Text(isolate(it))}
            EvaluationValues(EvaluationFields.read(entry),language)
            entry.string("reason")?.let{Text(isolate(it))}
        }
    }
}
