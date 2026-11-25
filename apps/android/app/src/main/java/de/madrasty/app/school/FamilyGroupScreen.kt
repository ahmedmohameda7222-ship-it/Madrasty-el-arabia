package de.madrasty.app.school

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import de.madrasty.app.R
import de.madrasty.app.api.decodeData
import de.madrasty.app.identity.IdentityViewModel
import de.madrasty.app.ui.AsyncState
import de.madrasty.app.ui.AsyncSurface
import de.madrasty.app.ui.isolate
import kotlinx.coroutines.CancellationException
import org.json.JSONArray
import org.json.JSONObject

@Composable
internal fun FamilyGroupScreen(model:IdentityViewModel,id:String,requests:MutableMap<String,Pair<String,String>>,openPayer:((String)->Unit)?,openPerson:(String,String)->Unit){
    var generation by remember{mutableIntStateOf(0)}
    var result by remember{mutableStateOf<AsyncState<JSONObject>>(AsyncState.InitialLoading())}
    var edit by remember{mutableStateOf(false)}
    var attach by remember{mutableStateOf<String?>(null)}
    var chosen by remember{mutableStateOf<JSONObject?>(null)}
    LaunchedEffect(id,generation){
        result=try{AsyncState.Ready(decodeData(model.schoolRequest("/school/families/$id")){it as JSONObject}.data)}
        catch(e:CancellationException){throw e}catch(_:Exception){AsyncState.Error(retry={generation++})}
    }
    AsyncSurface(result){g->
        val adults=g.getJSONArray("guardians").let{a->List(a.length(),a::getJSONObject)}
        val children=g.getJSONArray("children").let{a->List(a.length(),a::getJSONObject)}
        val links=g.getJSONArray("links").let{a->List(a.length(),a::getJSONObject)}
        Text(isolate(g.getString("displayName")),style=MaterialTheme.typography.headlineSmall)
        Text(fm("Kinder: ","الأطفال: ")+children.size+" · "+fm("Sorgeberechtigte: ","أولياء الأمور: ")+adults.size)
        Text(fm("Die Familiengruppe allein gewährt keinen Zugriff.","العضوية في الأسرة وحدها لا تمنح صلاحية الوصول."))
        TextButton(onClick={edit=!edit}){Text(fm("Familie bearbeiten","تعديل الأسرة"))}
        if(edit){
            var name by remember(g.optInt("revision")){mutableStateOf(g.getString("displayName"))}
            var situation by remember(g.optInt("revision")){mutableStateOf(g.optString("situation","unknown"))}
            Field(R.string.family_name,name){name=it}
            FamilyChoice(fm("Familiensituation","الحالة الأسرية"),situation,listOf("unknown" to fm("Keine Angabe","غير محدد"),"together" to fm("Zusammen","معًا"),"separated" to fm("Getrennt","منفصلان"),"divorced" to fm("Geschieden","مطلقان"),"single" to fm("Alleinerziehend","ولي أمر واحد"),"other" to fm("Andere","أخرى"))){situation=it}
            Submit(name.trim().length in 1..200){model.schoolCommand(requests,"/school/families/$id","PATCH",JSONObject().put("displayName",name.trim()).put("situation",situation).put("revision",g.getInt("revision")));edit=false;generation++}
        }
        Text(fm("Kinder","الأطفال"),style=MaterialTheme.typography.titleMedium)
        children.forEach{c->
            val childId=c.getString("id")
            ListItem(modifier=Modifier.fillMaxWidth().clickable{openPerson("students",childId)},headlineContent={Text(isolate(c.getString("displayName")))},supportingContent={Text(c.getString("studentNumber"))})
            if(openPayer!=null)TextButton(onClick={openPayer(childId)}){Text(fm("Zahlungspflichtige Person","مسؤول السداد"))}
        }
        TextButton(onClick={attach="student";chosen=null}){Text(fm("Vorhandenes Kind zuordnen","ربط طفل موجود"))}
        HorizontalDivider()
        Text(fm("Sorgeberechtigte","أولياء الأمور"),style=MaterialTheme.typography.titleMedium)
        adults.forEach{a->
            ListItem(modifier=Modifier.fillMaxWidth().clickable{openPerson("guardians",a.getString("id"))},headlineContent={Text(isolate(a.getString("displayName")))},supportingContent={Text(if(a.optBoolean("linkedAccount"))fm("Konto verbunden","حساب مرتبط")else fm("Kein Konto","بدون حساب"))})
            links.filter{it.getString("guardianId")==a.getString("id")}.forEach{l->Text(isolate(l.getString("studentName"))+" · "+familyLinkLabel(l.getString("state")))}
        }
        TextButton(onClick={attach="guardian";chosen=null}){Text(fm("Vorhandene Person zuordnen","ربط ولي أمر موجود"))}
        val kind=attach
        if(kind!=null){
            Text(fm("Person auswählen","اختيار الشخص"),style=MaterialTheme.typography.titleMedium)
            RecordPicker(model,if(kind=="student")"students" else "guardians",exclude=(if(kind=="student")children else adults).map{it.getString("id")}.toSet()){chosen=it}
            chosen?.let{Text(isolate(it.getString("displayName")))}
            Submit(chosen!=null){model.schoolCommand(requests,"/school/families/$id/members","POST",JSONObject().put("kind",kind).put("personId",chosen!!.getString("id")).put("revision",g.getInt("revision")));attach=null;chosen=null;generation++}
            TextButton(onClick={attach=null;chosen=null}){Text(stringResource(R.string.cancel))}
        }
    }
}
