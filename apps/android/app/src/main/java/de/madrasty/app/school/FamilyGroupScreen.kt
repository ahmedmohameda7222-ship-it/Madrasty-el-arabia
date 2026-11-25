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
    var create by remember{mutableStateOf<String?>(null)}
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
        TextButton(onClick={create="student";attach=null}){Text(fm("Neues Kind hinzufügen","إضافة طفل جديد"))}
        HorizontalDivider()
        Text(fm("Sorgeberechtigte","أولياء الأمور"),style=MaterialTheme.typography.titleMedium)
        adults.forEach{a->
            ListItem(modifier=Modifier.fillMaxWidth().clickable{openPerson("guardians",a.getString("id"))},headlineContent={Text(isolate(a.getString("displayName")))},supportingContent={Text(if(a.optBoolean("linkedAccount"))fm("Konto verbunden","حساب مرتبط")else fm("Kein Konto","بدون حساب"))})
            links.filter{it.getString("guardianId")==a.getString("id")}.forEach{l->Text(isolate(l.getString("studentName"))+" · "+familyLinkLabel(l.getString("state")))}
        }
        TextButton(onClick={attach="guardian";chosen=null}){Text(fm("Vorhandene Person zuordnen","ربط ولي أمر موجود"))}
        TextButton(onClick={create="guardian";attach=null}){Text(fm("Neue Person hinzufügen","إضافة ولي أمر جديد"))}
        create?.let{kind->key(kind){NewGroupMember(model,kind,g,adults,requests){create=null;generation++}};TextButton(onClick={create=null}){Text(stringResource(R.string.cancel))}}
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

@Composable
private fun NewGroupMember(model:IdentityViewModel,kind:String,g:JSONObject,adults:List<JSONObject>,requests:MutableMap<String,Pair<String,String>>,done:()->Unit){
    val locale=if(androidx.compose.ui.platform.LocalConfiguration.current.locales[0].language=="ar")"ar" else "de"
    var name by remember{mutableStateOf("")};var birth by remember{mutableStateOf("")}
    var email by remember{mutableStateOf("")};var phone by remember{mutableStateOf("")};var address by remember{mutableStateOf("")};var language by remember{mutableStateOf(locale)}
    var links by remember{mutableStateOf(emptyMap<String,Pair<String,String>>())}
    var year by remember{mutableStateOf("")};var classroom by remember{mutableStateOf("")}
    var years by remember{mutableStateOf(emptyList<JSONObject>())};var classes by remember{mutableStateOf(emptyList<JSONObject>())}
    LaunchedEffect(kind){if(kind=="student")years=try{model.records("/school/years").filter{it.optString("state")!="closed"}}catch(e:CancellationException){throw e}catch(_:Exception){emptyList()}}
    LaunchedEffect(year){classes=if(year.isBlank())emptyList() else try{model.records("/school/classes?yearId=$year&limit=100")}catch(e:CancellationException){throw e}catch(_:Exception){emptyList()}}
    Text(fm("Neuer Datensatz","سجل جديد"),style=MaterialTheme.typography.titleMedium)
    Field(R.string.family_name,name){name=it};Field(R.string.profile_birth,birth){birth=it}
    if(kind=="guardian"){
        Field(R.string.guardian_email,email){email=it};Field(R.string.guardian_phone,phone){phone=it};Field(R.string.profile_address,address){address=it}
        FamilyChoice(fm("Sprache","اللغة"),language,listOf("de" to "Deutsch","ar" to "العربية")){language=it}
        Text(fm("Zugriff wird erst nach bestätigter Verknüpfung gewährt.","الوصول لا يُمنح إلا بعد اعتماد الرابط."))
    }else{
        FamilyChoice(fm("Schuljahr","السنة الدراسية"),year,listOf("" to fm("Ohne Zuordnung","بدون تحديد"))+years.map{it.getString("id") to (it.optString("startsOn")+" – "+it.optString("endsExclusive"))}){year=it;classroom=""}
        FamilyChoice(fm("Klasse","الفصل"),classroom,listOf("" to fm("Ohne Klasse","بدون فصل"))+classes.map{it.getString("id") to classLabel(it,locale)}){classroom=it}
        adults.forEach{a->val id=a.getString("id");val link=links[id]?:("none" to "unspecified");Text(isolate(a.getString("displayName")))
            FamilyChoice(fm("Zugang","الوصول"),link.first,listOf("none" to fm("Kein Zugang","بدون وصول"),"pending" to fm("Zur Prüfung","قيد المراجعة"),"approved" to fm("Bestätigt","معتمد"))){links=links+(id to (it to link.second))}
            if(link.first!="none")FamilyChoice(fm("Beziehung","العلاقة"),link.second,listOf("unspecified" to fm("Keine Angabe","غير محدد"),"father" to fm("Vater","الأب"),"mother" to fm("Mutter","الأم"),"legal" to fm("Gesetzliche Vertretung","الوصي القانوني"),"other" to fm("Andere","أخرى"))){links=links+(id to (link.first to it))}
        }
    }
    val valid=name.trim().length in 1..200&&validFamilyBirth(birth)&&if(kind=="guardian")phone.length<=48&&address.length<=500&&(email.isBlank()||android.util.Patterns.EMAIL_ADDRESS.matcher(email.trim()).matches()) else links.values.any{it.first=="approved"}&&links.values.all{it.first=="none"||it.second!="unspecified"}
    Submit(valid,success=null){
        fun nullable(v:String):Any=v.trim().takeIf{it.isNotEmpty()}?:JSONObject.NULL
        val body=JSONObject().put("displayName",name.trim()).put("birthDate",nullable(birth)).put("revision",g.getInt("revision"))
        if(kind=="guardian")body.put("contactEmail",nullable(email)).put("contactPhone",nullable(phone)).put("emergencyAddress",nullable(address)).put("correspondenceLocale",language)
        else body.put("classId",nullable(classroom)).put("guardianLinks",JSONArray(links.filterValues{it.first!="none"}.map{(id,l)->JSONObject().put("guardianId",id).put("approved",l.first=="approved").put("relationship",l.second)}))
        model.schoolCommand(requests,"/school/families/"+g.getString("id")+(if(kind=="guardian")"/new-guardian" else "/new-child"),"POST",body);done()
    }
}
