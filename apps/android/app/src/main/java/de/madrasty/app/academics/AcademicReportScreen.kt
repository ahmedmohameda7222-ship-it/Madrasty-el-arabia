package de.madrasty.app.academics

import android.net.Uri
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
import de.madrasty.app.school.records
import de.madrasty.app.school.timetableDate
import de.madrasty.app.school.timetableObject
import de.madrasty.app.ui.AsyncState
import de.madrasty.app.ui.AsyncSurface
import de.madrasty.app.ui.Persona
import de.madrasty.app.ui.isolate
import org.json.JSONArray
import org.json.JSONObject

data class ReportTarget(val kind:String,val id:String,val child:String?)

private data class DateSpan(val from:String="",val to:String=""){
    val valid get()=timetableDate(from)&&timetableDate(to)&&from<=to
    val query get()="from=$from&to=$to"
}

@Composable
fun AcademicReportScreen(model:IdentityViewModel,persona:Persona,initial:String?,open:(ReportTarget)->Unit,close:()->Unit){
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
        Text(stringResource(R.string.report_title),style=MaterialTheme.typography.headlineMedium)
        ReportFilters(model,persona,language,initial,version,open){version++}
    }
}

@Composable
private fun ReportFilters(model:IdentityViewModel,persona:Persona,language:String,initial:String?,version:Int,open:(ReportTarget)->Unit,refresh:()->Unit){
    var draft by remember{mutableStateOf(DateSpan())}
    var dates by remember{mutableStateOf<DateSpan?>(null)}
    var pupil by remember(initial){mutableStateOf(initial)}
    val guardian=persona==Persona.Guardian
    val current=if(guardian)LinkedReportChild(model,pupil,version){pupil=it} else pupil
    Field(R.string.history_from,draft.from){draft=draft.copy(from=it.take(10))}
    Field(R.string.history_to,draft.to){draft=draft.copy(to=it.take(10))}
    TextButton(enabled=draft.valid,onClick={dates=draft;refresh()}){
        Text(stringResource(if(guardian)R.string.report_show else R.string.report_show_period))
    }
    val period=dates?:return
    if(!guardian)ReportPupilSearch(model,language,period,pupil,version){pupil=it}
    if(current!=null)key(current,period){FilteredReport(model,language,current,period,guardian,version,open,refresh)}
}

@Composable
private fun LinkedReportChild(model:IdentityViewModel,selected:String?,version:Int,choose:(String)->Unit):String?{
    val links=academicRead("/me/children?limit=100",version){model.records(it)}
    val active=(links as? AsyncState.Ready)?.content.orEmpty()
    val id=selected?:active.firstOrNull()?.getString("id")
    AsyncSurface(links){items->
        Text(stringResource(R.string.evaluation_pupil))
        items.forEach{item->
            val value=item.getString("id")
            FilterChip(id==value,onClick={choose(value)},label={Text(isolate(item.getString("displayName")))})
        }
        if(items.isEmpty())Text(stringResource(R.string.empty))
        if(selected!=null&&items.none{it.getString("id")==selected})AsyncSurface<Unit>(AsyncState.Forbidden()){}
    }
    return id?.takeIf{value->active.any{it.getString("id")==value}}
}
@Composable
private fun ReportPupilSearch(model:IdentityViewModel,language:String,period:DateSpan,pupil:String?,version:Int,choose:(String?)->Unit){
    var room by remember{mutableStateOf<String?>(null)}
    var text by remember{mutableStateOf("")}
    var activeQuery by remember{mutableStateOf("")}
    val offerings=academicRead("/academics/offerings",version){model.records(it)}
    AsyncSurface(offerings){options->
        FilterChip(room==null,onClick={room=null;choose(null)},label={Text(stringResource(R.string.report_all_classes))})
        options.distinctBy{it.getString("classId")}.forEach{item->
            val id=item.getString("classId")
            FilterChip(room==id,onClick={room=id;choose(null)},label={Text(offeringLabel(item,language))})
        }
    }
    Field(R.string.report_search,text){text=it.take(120)}
    TextButton(onClick={activeQuery=text.trim();choose(null)}){Text(stringResource(R.string.report_find))}
    val filter=room?.let{"&classId=$it"}.orEmpty()+"&query=${Uri.encode(activeQuery)}"
    academicPages(model,"/academics/reports/students?${period.query}&limit=30$filter",version){pupils->
        pupils.forEach{item->
            val id=item.getString("id")
            FilterChip(pupil==id,onClick={choose(id)},label={Text(isolate(item.getString("displayName"))+" · "+isolate(item.getString("studentNumber")))})
        }
    }
}
@Composable
private fun FilteredReport(model:IdentityViewModel,language:String,pupil:String,period:DateSpan,guardian:Boolean,version:Int,open:(ReportTarget)->Unit,refresh:()->Unit){
    var subject by remember{mutableStateOf<String?>(null)}
    val filter=subject?.let{"&subjectId=$it"}.orEmpty()
    val state=academicRead("/academics/reports/students/$pupil?${period.query}$filter",version){model.timetableObject(it)}
    TextButton(onClick=refresh){Text(stringResource(R.string.report_refresh))}
    if(subject!=null&&state !is AsyncState.Ready)TextButton(onClick={subject=null}){Text(stringResource(R.string.report_all_subjects))}
    AsyncSurface(state){value->
        val child=value.getJSONObject("student")
        Text(isolate(child.getString("displayName")),style=MaterialTheme.typography.titleLarge)
        Text(isolate(child.getString("studentNumber"))+" · "+isolate(value.getString("from")+" – "+value.getString("to")))
        val options=value.getJSONArray("subjects").reportObjects()
        if(options.isNotEmpty())FilterChip(subject==null,onClick={subject=null},label={Text(stringResource(R.string.report_all_subjects))})
        options.forEach{item->
            val id=item.getString("id")
            FilterChip(subject==id,onClick={subject=id},label={Text(isolate(item.getString(if(language=="ar")"nameAr" else "nameDe")))})
        }
        ReportBody(value,language,if(guardian)pupil else null,open)
    }
}
internal fun JSONArray.reportObjects()=List(length(),::getJSONObject)
