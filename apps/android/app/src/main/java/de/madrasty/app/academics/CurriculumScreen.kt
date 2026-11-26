package de.madrasty.app.academics

import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextDirection
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import de.madrasty.app.R
import de.madrasty.app.api.WirePage
import de.madrasty.app.api.decodeData
import de.madrasty.app.identity.HttpFailure
import de.madrasty.app.identity.IdentityViewModel
import de.madrasty.app.identity.loadAccountSurface
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
import org.json.JSONArray
import org.json.JSONObject

@Composable
fun CurriculumScreen(model:IdentityViewModel,persona:Persona,initialChild:String?,initialLesson:String?,close:()->Unit){
    var child by remember(initialChild){mutableStateOf(initialChild)}
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
        Text(stringResource(R.string.curriculum_title),style=MaterialTheme.typography.headlineMedium)
        if(persona==Persona.Guardian){
            val links=academicRead("/me/children?limit=100",refresh){model.records(it)}
            AsyncSurface(links){items->
                val active=if(child==null)items.firstOrNull()?.getString("id") else child
                items.forEach{item->
                    val id=item.getString("id")
                    FilterChip(active==id,onClick={child=id},label={Text(isolate(item.getString("displayName")))})
                }
                if(active!=null&&items.any{it.getString("id")==active}){
                    key(active){CurriculumCatalog(model,persona,active,if(child==initialChild)initialLesson else null,refresh)}
                }else if(child!=null)AsyncSurface<Unit>(AsyncState.Forbidden()){}
                else Text(stringResource(R.string.empty))
            }
        }else CurriculumCatalog(model,persona,null,initialLesson,refresh)
    }
}

@Composable
private fun CurriculumCatalog(model:IdentityViewModel,persona:Persona,child:String?,initialLesson:String?,refresh:Int){
    val language=if(LocalConfiguration.current.locales[0].language=="de")"de" else "ar"
    val query=child?.let{"?childId=$it"}.orEmpty()
    val filter=child?.let{"&childId=$it"}.orEmpty()
    var changed by remember{mutableStateOf(0)}
    var subjectId by remember{mutableStateOf<String?>(null)}
    var offeringId by remember{mutableStateOf<String?>(null)}
    var lessonId by remember(initialLesson){mutableStateOf(initialLesson)}
    var subjectMode by remember{mutableStateOf<SubjectMode?>(null)}
    var createLesson by remember{mutableStateOf(false)}
    val offerings=academicRead("/academics/offerings$query",refresh+changed){model.records(it)}
    val currentLesson=lessonId
    if(currentLesson!=null){
        BackHandler{lessonId=null}
        TextButton(onClick={lessonId=null}){Text(stringResource(R.string.curriculum_back))}
        val detail=academicRead("/academics/lessons/$currentLesson$query",refresh+changed){model.timetableObject(it)}
        AsyncSurface(detail){value->
            val context=(offerings as? AsyncState.Ready)?.content?.find{it.getString("id")==value.getString("offeringId")}
            key(currentLesson){CurriculumLessonDetail(model,value,context,language){changed++}}
        }
        return
    }

    val selected=academicPages(model,"/academics/subjects?limit=30$filter",refresh+changed){items->
        val active=subjectId?:items.firstOrNull()?.getString("id")
        items.forEach{value->
            val id=value.getString("id")
            FilterChip(active==id,onClick={subjectId=id;offeringId=null;createLesson=false;subjectMode=null},
                label={Text(isolate(value.getString(if(language=="ar")"nameAr" else "nameDe")))})
        }
    }
    if(persona==Persona.Admin)TextButton(onClick={subjectMode=SubjectMode.New}){Text(stringResource(R.string.curriculum_new_subject))}
    if(subjectMode==SubjectMode.New)SubjectForm(model,null,{subjectMode=null}){subjectId=it;offeringId=null;subjectMode=null;changed++}
    val active=subjectId?:selected?.firstOrNull()?.getString("id")
    if(active!=null&&selected?.any{it.getString("id")==active}==true){
        val detail=academicRead("/academics/subjects/$active$query",refresh+changed){model.timetableObject(it)}
        AsyncSurface(detail){value->
            Text(isolate(value.getString(if(language=="ar")"nameAr" else "nameDe")),style=MaterialTheme.typography.titleLarge)
            if(value.getBoolean("archived"))Text(stringResource(R.string.curriculum_archived))
            val summary=value.getString(if(language=="ar")"descriptionAr" else "descriptionDe")
            if(summary.isNotEmpty())Text(isolate(summary))
            if(persona==Persona.Admin&&subjectMode==null){
                TextButton(onClick={subjectMode=SubjectMode.Edit}){Text(stringResource(R.string.curriculum_edit_subject))}
            }
            if(subjectMode==SubjectMode.Edit)key(active){
                SubjectForm(model,value,{subjectMode=null}){subjectMode=null;changed++}
            }
        }
        AsyncSurface(offerings){items->
            val eligible=items.filter{it.getString("subjectId")==active}
            val selectedOffering=eligible.find{it.getString("id")==offeringId}?:eligible.firstOrNull()
            Text(stringResource(R.string.curriculum_offering),style=MaterialTheme.typography.titleMedium)
            if(eligible.isEmpty())Text(stringResource(R.string.empty))
            eligible.forEach{option->
                val id=option.getString("id")
                FilterChip(selectedOffering?.getString("id")==id,onClick={offeringId=id;createLesson=false},
                    label={Text(offeringLabel(option,language))})
            }
            if(selectedOffering!=null)key(selectedOffering.getString("id")){
                OfferingLessons(model,selectedOffering,refresh+changed,filter,language,createLesson,{createLesson=it},{lessonId=it}){
                    createLesson=false;lessonId=it;changed++
                }
            }
        }
    }
}

@Composable
private fun OfferingLessons(
    model:IdentityViewModel,offering:JSONObject,refresh:Int,filter:String,language:String,
    creating:Boolean,setCreating:(Boolean)->Unit,open:(String)->Unit,saved:(String)->Unit,
){
    val offeringId=offering.getString("id")
    val path="/academics/lessons?limit=25&offeringId=$offeringId$filter"
    val items=academicPages(model,path,refresh){rows->
        rows.forEach{lesson->
            TextButton(onClick={open(lesson.getString("id"))}){Text(isolate(lessonText(lesson,language).title))}
            lesson.string("plannedDate")?.let{Text(isolate(it))}
        }
    }
    if(offering.getBoolean("canPlan")){
        if(creating)LessonForm(model,offeringId,language,null,items.orEmpty(),{setCreating(false)},saved)
        else TextButton(onClick={setCreating(true)}){Text(stringResource(R.string.curriculum_new_lesson))}
    }
}

private enum class SubjectMode{New,Edit}

@Composable
private fun SubjectForm(model:IdentityViewModel,value:JSONObject?,cancel:()->Unit,saved:(String)->Unit){
    var code by remember{mutableStateOf(value?.getString("code").orEmpty())}
    var ar by remember{mutableStateOf(value?.getString("nameAr").orEmpty())}
    var de by remember{mutableStateOf(value?.getString("nameDe").orEmpty())}
    var arInfo by remember{mutableStateOf(value?.getString("descriptionAr").orEmpty())}
    var deInfo by remember{mutableStateOf(value?.getString("descriptionDe").orEmpty())}
    var archived by remember{mutableStateOf(value?.optBoolean("archived")==true)}
    val baseRevision=remember{value?.getInt("revision")}
    val attempts=remember{mutableMapOf<String,Pair<String,String>>()}
    if(value==null)Field(R.string.curriculum_code,code){code=it.uppercase(java.util.Locale.ROOT).take(24)}
    Field(R.string.curriculum_name_ar,ar){ar=it.take(160)}
    Field(R.string.curriculum_name_de,de){de=it.take(160)}
    AcademicLongField(R.string.curriculum_description_ar,arInfo,3000){arInfo=it}
    AcademicLongField(R.string.curriculum_description_de,deInfo,3000){deInfo=it}
    if(value!=null)FilterChip(archived,onClick={archived=!archived},label={Text(stringResource(R.string.curriculum_archive))})
    Submit(ar.isNotBlank()&&de.isNotBlank()&&Regex("[A-Z][A-Z0-9_]{1,23}").matches(code)){
        val body=JSONObject().put("nameAr",ar.trim()).put("nameDe",de.trim())
            .put("descriptionAr",arInfo.trim()).put("descriptionDe",deInfo.trim())
        val result=if(value==null)model.schoolCommand(attempts,"/academics/subjects","POST",body.put("code",code))
        else model.schoolCommand(attempts,"/academics/subjects/${value.getString("id")}","PATCH",
            body.put("archived",archived).put("revision",baseRevision))
        saved(result.getString("id"))
    }
    TextButton(onClick=cancel){Text(stringResource(R.string.cancel))}
}

private data class LessonDraft(
    val unit:String?,val order:String,val planned:String,val language:String,
    val titleAr:String,val bodyAr:String,val titleDe:String,val bodyDe:String,
){
    val ready get()=(order.toIntOrNull()?:-1) in 0..10000&&(planned.isBlank()||timetableDate(planned))&&
        (if(language=="ar")titleAr.isNotBlank()&&bodyAr.isNotBlank()&&(titleDe.isBlank()==bodyDe.isBlank())
         else titleDe.isNotBlank()&&bodyDe.isNotBlank()&&(titleAr.isBlank()==bodyAr.isBlank()))
    fun body()=JSONObject().put("unitId",unit?:JSONObject.NULL).put("sortOrder",order.toInt())
        .put("plannedDate",planned.takeIf(String::isNotBlank)?:JSONObject.NULL).put("sourceLanguage",language)
        .put("titleAr",titleAr.trim()).put("bodyAr",bodyAr.trim()).put("titleDe",titleDe.trim()).put("bodyDe",bodyDe.trim())

    companion object{
        fun of(value:JSONObject?,language:String)=LessonDraft(
            value?.string("unitId"),value?.optInt("sortOrder")?.toString()?:"0",value?.string("plannedDate").orEmpty(),
            value?.string("sourceLanguage")?:language,value?.string("titleAr").orEmpty(),value?.string("bodyAr").orEmpty(),
            value?.string("titleDe").orEmpty(),value?.string("bodyDe").orEmpty(),
        )
    }
}

@Composable
private fun LessonForm(
    model:IdentityViewModel,offering:String,language:String,value:JSONObject?,units:List<JSONObject>,cancel:()->Unit,saved:(String)->Unit,
){
    var editor by remember{mutableStateOf(LessonDraft.of(value,language))}
    val baseRevision=remember{value?.getInt("revision")}
    val attempts=remember{mutableMapOf<String,Pair<String,String>>()}
    if(value==null&&units.isNotEmpty()){
        Text(stringResource(R.string.curriculum_unit))
        FilterChip(editor.unit==null,onClick={editor=editor.copy(unit=null)},label={Text(stringResource(R.string.curriculum_new_unit))})
        units.distinctBy{it.getString("unitId")}.forEach{unit->
            val id=unit.getString("unitId")
            FilterChip(editor.unit==id,onClick={editor=editor.copy(unit=id)},label={Text(isolate(lessonText(unit,language).title))})
        }
    }
    Field(R.string.curriculum_order,editor.order){editor=editor.copy(order=it.take(5))}
    Field(R.string.curriculum_planned,editor.planned){editor=editor.copy(planned=it.take(10))}
    LanguageOptions(editor.language){editor=editor.copy(language=it)}
    Field(R.string.curriculum_title_ar,editor.titleAr){editor=editor.copy(titleAr=it.take(200))}
    AcademicLongField(R.string.curriculum_body_ar,editor.bodyAr,12000){editor=editor.copy(bodyAr=it)}
    Field(R.string.curriculum_title_de,editor.titleDe){editor=editor.copy(titleDe=it.take(200))}
    AcademicLongField(R.string.curriculum_body_de,editor.bodyDe,12000){editor=editor.copy(bodyDe=it)}
    Submit(editor.ready){
        val body=editor.body()
        val result=if(value==null)model.schoolCommand(attempts,"/academics/lessons","POST",body.put("offeringId",offering))
        else model.schoolCommand(attempts,"/academics/lessons/${value.getString("id")}","PATCH",body.put("revision",baseRevision))
        saved(result.getString("id"))
    }
    TextButton(onClick=cancel){Text(stringResource(R.string.cancel))}
}

@Composable
private fun CurriculumLessonDetail(model:IdentityViewModel,value:JSONObject,context:JSONObject?,language:String,changed:()->Unit){
    val id=value.getString("id")
    val revision=value.getInt("revision")
    var editing by remember{mutableStateOf(false)}
    var preview by remember{mutableStateOf<Int?>(null)}
    var previewLanguage by remember{mutableStateOf(language)}
    var notice by remember{mutableStateOf<Int?>(null)}
    val attempts=remember{mutableMapOf<String,Pair<String,String>>()}
    if(context!=null)Text(offeringLabel(context,language))
    AcademicLessonBody(value,language)
    value.string("plannedDate")?.let{Text(stringResource(R.string.curriculum_planned)+" · "+isolate(it))}
    val publication=value.string("publishedAt")
    if(publication==null)Text(stringResource(R.string.curriculum_draft))
    else{
        Text(stringResource(R.string.curriculum_published)+" · "+isolate(publication))
        if(value.optInt("publishedRevision")!=revision)Text(stringResource(R.string.curriculum_draft_changes))
    }
    val delivered=value.string("latestDeliveryDate")
    if(delivered==null)Text(stringResource(R.string.curriculum_delivery_pending))
    else Text(stringResource(R.string.curriculum_delivery)+" · "+isolate(delivered))
    if(value.getBoolean("canEdit")){
        if(editing)LessonForm(model,value.getString("offeringId"),language,value,emptyList(),{editing=false}){
            editing=false;preview=null;notice=R.string.saved;changed()
        }
        else TextButton(onClick={editing=true;preview=null}){Text(stringResource(R.string.curriculum_edit_lesson))}
    }
    if(!editing&&value.getBoolean("canPublish")&&value.optInt("publishedRevision")!=revision){
        if(preview!=revision)TextButton(onClick={preview=revision}){Text(stringResource(R.string.curriculum_preview))}
        else{
            HorizontalDivider()
            Text(stringResource(R.string.curriculum_preview),style=MaterialTheme.typography.titleMedium)
            LanguageOptions(previewLanguage){previewLanguage=it}
            AcademicLessonBody(value,previewLanguage)
            Submit(true,R.string.curriculum_publish,success=null){
                try{
                    model.schoolCommand(attempts,"/academics/lessons/$id/publish","POST",JSONObject().put("revision",revision))
                    preview=null;notice=R.string.curriculum_live;changed()
                }catch(error:HttpFailure){
                    if(error.status in listOf(401,403,404,409)){preview=null;changed()}
                    throw error
                }
            }
            TextButton(onClick={preview=null}){Text(stringResource(R.string.cancel))}
        }
    }
    notice?.let{Text(stringResource(it))}
    TextButton(onClick=changed){Text(stringResource(R.string.curriculum_refresh))}
}

@Composable
private fun LanguageOptions(language:String,choose:(String)->Unit){
    Text(stringResource(R.string.curriculum_source),style=MaterialTheme.typography.titleMedium)
    FilterChip(language=="ar",onClick={choose("ar")},label={Text(stringResource(R.string.language_ar))})
    FilterChip(language=="de",onClick={choose("de")},label={Text(stringResource(R.string.language_de))})
}
@Composable
private fun AcademicLessonBody(value:JSONObject,language:String){
    val displayed=lessonText(value,language)
    if(displayed.language!=language)Text(stringResource(if(displayed.language=="ar")R.string.curriculum_original_ar else R.string.curriculum_original_de))
    val direction=if(displayed.language=="ar")TextDirection.Rtl else TextDirection.Ltr
    Text(displayed.title,style=MaterialTheme.typography.titleLarge.copy(textDirection=direction))
    Text(displayed.body,style=MaterialTheme.typography.bodyLarge.copy(textDirection=direction))
}
@Composable
internal fun AcademicLongField(label:Int,value:String,max:Int,change:(String)->Unit){
    OutlinedTextField(value,{change(it.take(max))},Modifier.fillMaxWidth(),label={Text(stringResource(label))},minLines=3)
}
private data class LessonText(val title:String,val body:String,val language:String)
private fun lessonText(value:JSONObject,language:String):LessonText{
    val key=if(language=="ar")"Ar" else "De"
    val displayed=if(value.getString("title$key").isNotBlank())language else value.getString("sourceLanguage")
    val suffix=if(displayed=="ar")"Ar" else "De"
    return LessonText(value.getString("title$suffix"),value.getString("body$suffix"),displayed)
}
internal fun offeringLabel(value:JSONObject,language:String)=isolate(value.getString("classCode"))+" · "+
    isolate(value.getString(if(language=="ar")"classNameAr" else "classNameDe"))+" · "+
    isolate(value.getString("yearStart")+" – "+value.getString("yearEnd"))
internal fun JSONObject.string(key:String)=if(isNull(key))null else optString(key)

@Composable
internal fun <T> academicRead(path:String,refresh:Int,read:suspend (String)->T):AsyncState<T>{
    var retry by remember{mutableStateOf(0)}
    var state by remember(path){mutableStateOf<AsyncState<T>>(AsyncState.InitialLoading())}
    LaunchedEffect(path,refresh,retry){state=loadAccountSurface({retry++}){read(path)}}
    return state
}
private suspend fun IdentityViewModel.curriculumPage(path:String)=decodeData(schoolRequest(path)){
    val rows=it as JSONArray
    List(rows.length(),rows::getJSONObject)
}
@Composable
internal fun academicPages(
    model:IdentityViewModel,path:String,refresh:Int,render:@Composable (List<JSONObject>)->Unit,
):List<JSONObject>?{
    var retry by remember{mutableStateOf(0)}
    var state by remember(path){mutableStateOf<AsyncState<WirePage<List<JSONObject>>>>(AsyncState.InitialLoading())}
    LaunchedEffect(path,refresh,retry){state=loadAccountSurface({retry++}){model.curriculumPage(path)}}
    AsyncSurface(state){page->
        if(page.data.isEmpty())Text(stringResource(R.string.empty))
        render(page.data)
        page.nextCursor?.let{cursor->
            Submit(true,R.string.staff_more,success=null){
                try{
                    val next=model.curriculumPage("$path&cursor=${Uri.encode(cursor)}")
                    if((state as? AsyncState.Ready)?.content==page)state=AsyncState.Ready(WirePage(page.data+next.data,next.nextCursor))
                }catch(error:HttpFailure){
                    if(error.status in listOf(401,403,404))state=AsyncState.Forbidden()
                    throw error
                }
            }
        }
    }
    return (state as? AsyncState.Ready)?.content?.data
}
