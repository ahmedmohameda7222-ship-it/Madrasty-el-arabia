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
import de.madrasty.app.identity.IdentityViewModel
import de.madrasty.app.school.Field
import de.madrasty.app.school.Submit
import de.madrasty.app.school.records
import de.madrasty.app.school.schoolCommand
import de.madrasty.app.school.timetableDate
import de.madrasty.app.ui.AsyncState
import de.madrasty.app.ui.AsyncSurface
import de.madrasty.app.ui.Persona
import de.madrasty.app.ui.isolate
import org.json.JSONObject

@Composable
fun TeachingActivityScreen(model:IdentityViewModel,persona:Persona,initialChild:String?,close:()->Unit){
    val language=if(LocalConfiguration.current.locales[0].language=="de")"de" else "ar"
    var refresh by remember{mutableStateOf(0)}
    val lifecycle=LocalLifecycleOwner.current.lifecycle
    DisposableEffect(lifecycle){
        val watcher=LifecycleEventObserver{_,event->if(event==Lifecycle.Event.ON_RESUME)refresh++}
        lifecycle.addObserver(watcher)
        onDispose{lifecycle.removeObserver(watcher)}
    }
    BackHandler(onBack=close)
    Column(Modifier.fillMaxSize().safeDrawingPadding().imePadding().verticalScroll(rememberScrollState()).padding(20.dp),
        verticalArrangement=Arrangement.spacedBy(8.dp)){
        TextButton(onClick=close){Text(stringResource(R.string.back))}
        Text(stringResource(if(persona==Persona.Guardian)R.string.academic_activities else R.string.academic_work),
            style=MaterialTheme.typography.headlineMedium)
        if(persona==Persona.Guardian)FamilyActivities(model,initialChild,language,refresh)
        else StaffActivityWork(model,language,refresh)
    }
}

@Composable
private fun FamilyActivities(model:IdentityViewModel,initialChild:String?,language:String,refresh:Int){
    var child by remember(initialChild){mutableStateOf(initialChild)}
    val linked=academicRead("/me/children?limit=100",refresh){model.records(it)}
    AsyncSurface(linked){items->
        val current=child?:items.firstOrNull()?.getString("id")
        items.forEach{item->
            val id=item.getString("id")
            FilterChip(current==id,onClick={child=id},label={Text(isolate(item.getString("displayName")))})
        }
        if(current!=null&&items.any{it.getString("id")==current})key(current){
            ActivityWork(model,language,current,null,refresh)
        }else if(child!=null)AsyncSurface<Unit>(AsyncState.Forbidden()){}
        else Text(stringResource(R.string.empty))
    }
}

private enum class WorkMode{Teaching,Activities}

@Composable
private fun StaffActivityWork(model:IdentityViewModel,language:String,refresh:Int){
    var mode by remember{mutableStateOf(WorkMode.Teaching)}
    var chosen by remember{mutableStateOf<String?>(null)}
    val available=academicRead("/academics/offerings",refresh){model.records(it)}
    val subjects=academicRead("/academics/subjects?limit=100",refresh){model.records(it)}
    FilterChip(mode==WorkMode.Teaching,onClick={mode=WorkMode.Teaching},label={Text(stringResource(R.string.academic_teaching))})
    FilterChip(mode==WorkMode.Activities,onClick={mode=WorkMode.Activities},label={Text(stringResource(R.string.academic_activities))})
    AsyncSurface(available){values->
        val field=if(mode==WorkMode.Teaching)"canLog" else "canGrade"
        val options=values.filter{it.getBoolean(field)}
        val lookup=(subjects as? AsyncState.Ready)?.content.orEmpty()
        val active=options.find{it.getString("id")==chosen}?:options.firstOrNull()
        if(active==null)Text(stringResource(R.string.empty))
        else{
            Text(stringResource(R.string.academic_context),style=MaterialTheme.typography.titleMedium)
            options.forEach{option->
                val id=option.getString("id")
                val subject=lookup.find{it.getString("id")==option.getString("subjectId")}
                val name=subject?.getString(if(language=="ar")"nameAr" else "nameDe")?.let(::isolate)
                FilterChip(active.getString("id")==id,onClick={chosen=id},label={
                    Text(listOfNotNull(name,offeringLabel(option,language)).joinToString(" · "))
                })
            }
            val id=active.getString("id")
            key(mode,id){
                if(mode==WorkMode.Teaching)TeachingLog(model,id,language,refresh)
                else ActivityWork(model,language,null,id,refresh)
            }
        }
    }
}

@Composable
private fun TeachingLog(model:IdentityViewModel,offering:String,language:String,refresh:Int){
    var editing by remember{mutableStateOf(false)}
    var record by remember{mutableStateOf<JSONObject?>(null)}
    var version by remember{mutableStateOf(0)}
    fun end(){editing=false;record=null}
    TextButton(onClick={record=null;editing=true}){Text(stringResource(R.string.academic_log_lesson))}
    if(editing)key(record?.getString("id")){
        TeachingForm(model,offering,record,language,::end){end();version++}
    }
    academicPages(model,"/academics/teaching-log?offeringId=$offering&limit=25",refresh+version){items->
        items.forEach{item->
            HorizontalDivider()
            Text(stringResource(R.string.academic_actual_date)+" · "+isolate(item.getString("actualDate")),
                style=MaterialTheme.typography.titleMedium)
            item.string("recordedByName")?.let{Text(isolate(it))}
            plannedTitle(item,language)?.let{Text(stringResource(R.string.academic_plan)+" · "+isolate(it))}
            item.string("plannedDate")?.let{Text(stringResource(R.string.curriculum_planned)+" · "+isolate(it))}
            Text(isolate(item.getString("deliveredNotes")))
            if(item.getBoolean("canEdit"))TextButton(onClick={record=item;editing=true}){Text(stringResource(R.string.curriculum_edit_lesson))}
        }
    }
}

private fun plannedTitle(value:JSONObject,language:String):String?{
    val fields=if(language=="ar")listOf("planTitleAr","planTitleDe") else listOf("planTitleDe","planTitleAr")
    return fields.firstNotNullOfOrNull{key->value.string(key)?.takeIf(String::isNotBlank)}
}

@Composable
private fun TeachingForm(model:IdentityViewModel,offering:String,value:JSONObject?,language:String,close:()->Unit,saved:()->Unit){
    var date by remember{mutableStateOf(value?.string("actualDate").orEmpty())}
    var notes by remember{mutableStateOf(value?.string("deliveredNotes").orEmpty())}
    var assignment by remember{mutableStateOf(value?.string("assignmentId"))}
    var lesson by remember{mutableStateOf(value?.string("lessonId"))}
    var publication by remember{mutableStateOf(value?.string("lessonVersionId"))}
    val base=remember{value?.getInt("revision")}
    val attempts=remember{mutableMapOf<String,Pair<String,String>>()}
    Field(R.string.academic_actual_date,date){date=it.take(10);assignment=null}
    val available=if(timetableDate(date)){
        academicRead("/academics/teaching-log/assignments?offeringId=$offering&date=$date",0){model.records(it)}
    }else AsyncState.Empty()
    val teachers=(available as? AsyncState.Ready)?.content.orEmpty()
    val teacher=teachers.find{it.getString("id")==assignment}?.getString("id")?:teachers.singleOrNull()?.getString("id")
    if(timetableDate(date)){
        Text(stringResource(R.string.academic_staff_assignment))
        AsyncSurface(available){items->
            if(items.isEmpty())Text(stringResource(R.string.empty))
            items.forEach{item->
                val id=item.getString("id")
                FilterChip(teacher==id,onClick={assignment=id},label={Text(isolate(item.getString("teacherName")))})
            }
        }
    }
    TeachingPlanOptions(model,offering,language,value,lesson,publication,{lesson=it;publication=null},{publication=it})
    AcademicLongField(R.string.academic_delivery_notes,notes,12000){notes=it}
    Submit(teacher!=null&&notes.isNotBlank()&&timetableDate(date)){
        val body=JSONObject().put("actualDate",date).put("deliveredNotes",notes.trim()).put("assignmentId",teacher)
            .put("lessonId",lesson?:JSONObject.NULL).put("lessonVersionId",publication?:JSONObject.NULL)
        if(value==null)model.schoolCommand(attempts,"/academics/teaching-log","POST",body.put("offeringId",offering))
        else model.schoolCommand(attempts,"/academics/teaching-log/${value.getString("id")}","PATCH",body.put("revision",base))
        saved()
    }
    TextButton(onClick=close){Text(stringResource(R.string.cancel))}
}

@Composable
private fun TeachingPlanOptions(
    model:IdentityViewModel,offering:String,language:String,value:JSONObject?,lesson:String?,publication:String?,
    select:(String?)->Unit,setPublication:(String?)->Unit,
){
    Text(stringResource(R.string.academic_plan))
    FilterChip(lesson==null,onClick={select(null)},label={Text(stringResource(R.string.academic_no_plan))})
    val plans=academicPages(model,"/academics/lessons?offeringId=$offering&limit=20",0){items->
        items.forEach{plan->
            val key=plan.getString("id")
            val title=plan.getString(if(language=="ar")"titleAr" else "titleDe").ifBlank{
                plan.getString(if(language=="ar")"titleDe" else "titleAr")
            }
            FilterChip(lesson==key,onClick={select(key)},label={Text(isolate(title))})
        }
    }
    val current=plans?.find{it.getString("id")==lesson}
    if(current==null&&lesson!=null&&value!=null)plannedTitle(value,language)?.let{Text(isolate(it))}
    val live=current?.string("publicationId")
    if(live!=null||publication!=null){
        FilterChip(publication==null,onClick={setPublication(null)},label={Text(stringResource(R.string.academic_draft_plan))})
        if(publication!=null&&publication!=live)FilterChip(true,onClick={},label={Text(stringResource(R.string.academic_published_plan))})
        if(live!=null)FilterChip(publication==live,onClick={setPublication(live)},label={Text(stringResource(R.string.academic_published_plan))})
    }
}
