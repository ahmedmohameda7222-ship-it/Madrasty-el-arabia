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
import de.madrasty.app.comms.HomeworkConversation
import de.madrasty.app.identity.IdentityViewModel
import de.madrasty.app.school.Field
import de.madrasty.app.school.Submit
import de.madrasty.app.school.records
import de.madrasty.app.school.schoolCommand
import de.madrasty.app.school.timetableDate
import de.madrasty.app.school.timetableObject
import de.madrasty.app.ui.AsyncState
import de.madrasty.app.ui.AsyncSurface
import de.madrasty.app.ui.Persona
import de.madrasty.app.ui.isolate
import java.text.NumberFormat
import java.util.Locale
import org.json.JSONObject

@Composable
fun HomeworkScreen(
    model:IdentityViewModel,persona:Persona,initialChild:String?,initialWork:String?,openLesson:(String?,String)->Unit,openGrades:(String)->Unit,openThread:(String)->Unit,close:()->Unit,
){
    val language=if(LocalConfiguration.current.locales[0].language=="de")"de" else "ar"
    var refresh by remember{mutableStateOf(0)}
    val lifecycle=LocalLifecycleOwner.current.lifecycle
    DisposableEffect(lifecycle){
        val observer=LifecycleEventObserver{_,event->if(event==Lifecycle.Event.ON_RESUME)refresh++}
        lifecycle.addObserver(observer)
        onDispose{lifecycle.removeObserver(observer)}
    }
    BackHandler(onBack=close)
    Column(Modifier.fillMaxSize().safeDrawingPadding().imePadding().verticalScroll(rememberScrollState()).padding(20.dp),
        verticalArrangement=Arrangement.spacedBy(8.dp)){
        TextButton(onClick=close){Text(stringResource(R.string.back))}
        Text(stringResource(R.string.homework_title),style=MaterialTheme.typography.headlineMedium)
        if(persona==Persona.Guardian)FamilyHomework(model,language,initialChild,initialWork,refresh,openLesson,openThread)
        else StaffHomework(model,language,initialWork,refresh,openLesson,openGrades)
    }
}

@Composable
private fun FamilyHomework(
    model:IdentityViewModel,language:String,initialChild:String?,initialWork:String?,refresh:Int,openLesson:(String?,String)->Unit,openThread:(String)->Unit,
){
    var child by remember(initialChild){mutableStateOf(initialChild)}
    val linked=academicRead("/me/children?limit=100",refresh){model.records(it)}
    AsyncSurface(linked){items->
        val active=child?:items.firstOrNull()?.getString("id")
        items.forEach{item->
            val id=item.getString("id")
            FilterChip(active==id,onClick={child=id},label={Text(isolate(item.getString("displayName")))})
        }
        if(active!=null&&items.any{it.getString("id")==active})key(active){
            HomeworkList(model,language,active,null,if(child==initialChild)initialWork else null,refresh,openLesson,{},openThread)
        }else if(child!=null)AsyncSurface<Unit>(AsyncState.Forbidden()){}
        else Text(stringResource(R.string.empty))
    }
}

@Composable
private fun StaffHomework(model:IdentityViewModel,language:String,initial:String?,refresh:Int,openLesson:(String?,String)->Unit,openGrades:(String)->Unit){
    var selected by remember{mutableStateOf<String?>(null)}
    val available=academicRead("/academics/offerings",refresh){model.records(it)}
    val subjects=academicRead("/academics/subjects?limit=100",refresh){model.records(it)}
    AsyncSurface(available){options->
        val scope=options.filter{it.getBoolean("canPlan")||it.getBoolean("canGrade")}
        val active=scope.find{it.getString("id")==selected}?:scope.firstOrNull()
        val subjectOptions=(subjects as? AsyncState.Ready)?.content.orEmpty()
        if(scope.isEmpty()&&initial==null)Text(stringResource(R.string.empty))
        else{
            Text(stringResource(R.string.academic_context),style=MaterialTheme.typography.titleMedium)
            scope.forEach{option->
                val id=option.getString("id")
                val subject=subjectOptions.find{it.getString("id")==option.getString("subjectId")}
                val name=subject?.getString(if(language=="ar")"nameAr" else "nameDe")?.let(::isolate)
                FilterChip(active?.getString("id")==id,onClick={selected=id},label={
                    Text(listOfNotNull(name,offeringLabel(option,language)).joinToString(" · "))
                })
            }
            key(active?.getString("id")){
                HomeworkList(model,language,null,active,if(selected==null)initial else null,refresh,openLesson,openGrades,{})
            }
        }
    }
}

@Composable
private fun HomeworkList(
    model:IdentityViewModel,language:String,child:String?,offering:JSONObject?,initial:String?,refresh:Int,openLesson:(String?,String)->Unit,openGrades:(String)->Unit,openThread:(String)->Unit,
){
    var work by remember(initial){mutableStateOf(initial)}
    var adding by remember{mutableStateOf(false)}
    var version by remember{mutableStateOf(0)}
    var saved by remember{mutableStateOf(false)}
    val id=work
    if(saved)Text(stringResource(R.string.saved))
    if(id!=null){
        BackHandler{work=null;saved=false}
        TextButton(onClick={work=null;saved=false}){Text(stringResource(R.string.homework_back))}
        val read=academicRead("/academics/homework/$id"+(child?.let{"?childId=$it"}?:""),refresh+version){model.timetableObject(it)}
        AsyncSurface(read){value->
            key(id){HomeworkDetails(model,value,language,child,openLesson,openGrades,openThread){version++;saved=true}}
        }
        return
    }
    val offeringId=offering?.getString("id")
    if(offeringId!=null&&offering.optBoolean("canPlan")){
        if(adding)HomeworkForm(model,offeringId,language,null,{adding=false}){id->
            work=id;adding=false;version++;saved=true
        }else TextButton(onClick={adding=true}){Text(stringResource(R.string.homework_new))}
    }
    val suffix=when{
        child!=null -> "&childId=$child"
        offeringId!=null -> "&offeringId=$offeringId"
        else -> ""
    }
    academicPages(model,"/academics/homework?limit=25$suffix",refresh+version){items->
        items.forEach{item->
            HorizontalDivider()
            TextButton(onClick={work=item.getString("id");saved=false}){Text(isolate(item.getString("title")))}
            Text(isolate(item.getString(if(language=="ar")"subjectNameAr" else "subjectNameDe"))+" · "+isolate(item.getString("dueOn")))
        }
    }
}

@Composable
private fun HomeworkDetails(
    model:IdentityViewModel,item:JSONObject,language:String,child:String?,openLesson:(String?,String)->Unit,openGrades:(String)->Unit,openThread:(String)->Unit,changed:()->Unit,
){
    var editing by remember{mutableStateOf(false)}
    Text(isolate(item.getString("title")),style=MaterialTheme.typography.titleLarge)
    val schoolClass=item.getString(if(language=="ar")"classNameAr" else "classNameDe")
    val subject=item.getString(if(language=="ar")"subjectNameAr" else "subjectNameDe")
    Text(listOf(subject,item.getString("classCode"),schoolClass,item.getString("yearStart")+" – "+item.getString("yearEnd"))
        .joinToString(" · ",transform=::isolate))
    Text(stringResource(R.string.homework_issued)+" · "+isolate(item.getString("issuedOn")))
    Text(stringResource(R.string.homework_due)+" · "+isolate(item.getString("dueOn")))
    Text(stringResource(R.string.homework_instructions),style=MaterialTheme.typography.titleMedium)
    Text(isolate(item.getString("instructions")))
    item.string("lessonId")?.let{lesson->
        TextButton(onClick={openLesson(child,lesson)}){Text(stringResource(R.string.homework_open_lesson))}
    }
    if(child!=null){
        HomeworkConversation(model,item.getString("id"),openThread)
        FamilyHomeworkResult(item,language)
    }else if(!item.isNull("rosterCount")){
        val count=NumberFormat.getIntegerInstance(Locale.forLanguageTag(language)).format(item.getInt("rosterCount"))
        Text(stringResource(R.string.homework_roster)+" · "+isolate(count))
    }
    if(item.getBoolean("canGrade"))TextButton(onClick={openGrades(item.getString("id"))}){Text(stringResource(R.string.gradebook_sheet))}
    if(item.getBoolean("canEdit")){
        if(editing)HomeworkForm(model,item.getString("offeringId"),language,item,{editing=false}){editing=false;changed()}
        else TextButton(onClick={editing=true}){Text(stringResource(R.string.homework_edit))}
    }
}

@Composable
private fun FamilyHomeworkResult(item:JSONObject,language:String){
    item.string("joinedOn")?.let{Text(stringResource(R.string.homework_joined)+" · "+isolate(it))}
    if(item.optBoolean("addedLater"))Text(stringResource(R.string.homework_added_later))
    if(item.isNull("score"))Text(stringResource(R.string.academic_mark_pending))
    else{
        val format=NumberFormat.getNumberInstance(Locale.forLanguageTag(language)).apply{maximumFractionDigits=1}
        Text(stringResource(R.string.homework_score)+" · "+isolate(format.format(item.getDouble("score"))))
    }
    item.string("feedback")?.takeIf(String::isNotBlank)?.let{feedback->
        Text(stringResource(R.string.homework_feedback),style=MaterialTheme.typography.titleMedium)
        Text(isolate(feedback))
    }
}

@Composable
private fun HomeworkForm(model:IdentityViewModel,offering:String,language:String,item:JSONObject?,cancel:()->Unit,saved:(String)->Unit){
    var title by remember{mutableStateOf(item?.string("title").orEmpty())}
    var instructions by remember{mutableStateOf(item?.string("instructions").orEmpty())}
    var issue by remember{mutableStateOf(item?.string("issuedOn").orEmpty())}
    var due by remember{mutableStateOf(item?.string("dueOn").orEmpty())}
    var lesson by remember{mutableStateOf(item?.string("lessonId"))}
    val base=remember{item?.getInt("revision")}
    val attempts=remember{mutableMapOf<String,Pair<String,String>>()}
    Field(R.string.homework_label,title){title=it.take(200)}
    AcademicLongField(R.string.homework_instructions,instructions,12000){instructions=it}
    Field(R.string.homework_issued,issue){issue=it.take(10)}
    Field(R.string.homework_due,due){due=it.take(10)}
    Text(stringResource(R.string.homework_lesson))
    FilterChip(lesson==null,onClick={lesson=null},label={Text(stringResource(R.string.academic_no_plan))})
    val plans=academicPages(model,"/academics/lessons?offeringId=$offering&limit=20",0){items->
        items.forEach{entry->
            val id=entry.getString("id")
            val label=entry.getString(if(language=="ar")"titleAr" else "titleDe").ifBlank{
                entry.getString(if(language=="ar")"titleDe" else "titleAr")
            }
            FilterChip(lesson==id,onClick={lesson=id},label={Text(isolate(label))})
        }
    }
    if(lesson!=null&&plans?.none{it.getString("id")==lesson}==true)Text(stringResource(R.string.homework_lesson))
    Submit(title.isNotBlank()&&instructions.isNotBlank()&&timetableDate(issue)&&timetableDate(due)&&issue<=due,R.string.homework_save){
        val body=JSONObject().put("title",title.trim()).put("instructions",instructions.trim())
            .put("issuedOn",issue).put("dueOn",due).put("lessonId",lesson?:JSONObject.NULL)
        val output=if(item==null)model.schoolCommand(attempts,"/academics/homework","POST",body.put("offeringId",offering))
        else model.schoolCommand(attempts,"/academics/homework/${item.getString("id")}","PATCH",body.put("revision",base))
        saved(output.getString("id"))
    }
    TextButton(onClick=cancel){Text(stringResource(R.string.cancel))}
}
