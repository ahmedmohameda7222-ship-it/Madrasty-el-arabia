package de.madrasty.app.school

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.unit.dp
import de.madrasty.app.R
import de.madrasty.app.identity.IdentityViewModel
import kotlinx.coroutines.CancellationException
import org.json.JSONArray
import org.json.JSONObject

@Composable
internal fun fm(de:String,ar:String):String=if(LocalConfiguration.current.locales[0].language=="ar")ar else de

@Composable
internal fun FamilyChoice(label:String,value:String,options:List<Pair<String,String>>,select:(String)->Unit){
    var expanded by remember{mutableStateOf(false)}
    Box(Modifier.fillMaxWidth()){
        OutlinedButton(onClick={expanded=true},modifier=Modifier.fillMaxWidth().heightIn(min=48.dp)){
            Text(label+" · "+(options.firstOrNull{it.first==value}?.second?:"—"))
        }
        DropdownMenu(expanded=expanded,onDismissRequest={expanded=false}){
            options.forEach{(id,name)->DropdownMenuItem(text={Text(name)},onClick={select(id);expanded=false})}
        }
    }
}

private data class Adult(val name:String="",val email:String="",val phone:String="",val language:String="de",val birth:String="",val address:String="",val existing:String?=null)
private data class Child(val name:String="",val birth:String="",val classroom:String="",val existing:String?=null,val links:Map<Int,Pair<String,String>> = emptyMap(),val payer:Int?=null)
internal fun validFamilyBirth(value:String)=value.isBlank()||runCatching{val d=java.time.LocalDate.parse(value);d>=java.time.LocalDate.of(1900,1,1)&&d<=java.time.LocalDate.now()}.getOrDefault(false)
private fun nullable(s:String):Any=s.trim().takeIf{it.isNotEmpty()}?:JSONObject.NULL
@Composable
internal fun familyLinkLabel(value:String)=when(value){"approved"->stringResourceCompat(R.string.approved_link);"pending"->stringResourceCompat(R.string.pending_link);"revoked"->stringResourceCompat(R.string.revoked_link);else->fm("Nicht verknüpft","غير مرتبط")}
@Composable private fun stringResourceCompat(id:Int)=androidx.compose.ui.res.stringResource(id)

@Composable
internal fun FamilyWizard(model:IdentityViewModel,canBill:Boolean,requests:MutableMap<String,Pair<String,String>>,done:(String)->Unit){
    val locale=if(LocalConfiguration.current.locales[0].language=="ar")"ar" else "de"
    var step by remember{mutableIntStateOf(0)}
    var name by remember{mutableStateOf("")}
    var situation by remember{mutableStateOf("unknown")}
    var adults by remember{mutableStateOf(listOf(Adult(language=locale)))}
    var children by remember{mutableStateOf(listOf(Child()))}
    var pickAdult by remember{mutableStateOf<Int?>(null)}
    var pickChild by remember{mutableStateOf<Int?>(null)}
    var years by remember{mutableStateOf(emptyList<JSONObject>())}
    var year by remember{mutableStateOf("")}
    var classes by remember{mutableStateOf(emptyList<JSONObject>())}
    var confirmed by remember{mutableStateOf(false)}
    fun adult(i:Int,a:Adult){adults=adults.mapIndexed{j,v->if(i==j)a else v}}
    fun child(i:Int,c:Child){children=children.mapIndexed{j,v->if(i==j)c else v}}
    LaunchedEffect(Unit){years=try{model.records("/school/years").filter{it.optString("state")!="closed"}}catch(e:CancellationException){throw e}catch(_:Exception){emptyList()}}
    LaunchedEffect(year){classes=if(year.isBlank())emptyList() else try{model.records("/school/classes?yearId=$year&limit=100")}catch(e:CancellationException){throw e}catch(_:Exception){emptyList()}}
    val headings=listOf(fm("Familie","الأسرة"),fm("Sorgeberechtigte","أولياء الأمور"),fm("Kinder","الأطفال"),fm("Zugriffsrechte","الصلاحيات"),fm("Prüfen","المراجعة"))
    Text(headings[step]+" · "+(step+1)+"/5",style=MaterialTheme.typography.titleLarge)
    LinearProgressIndicator(progress={ (step+1)/5f },modifier=Modifier.fillMaxWidth())
    when(step){
        0->{Field(R.string.family_name,name){name=it}
            FamilyChoice(fm("Familiensituation (optional)","الحالة الأسرية (اختياري)"),situation,listOf("unknown" to fm("Keine Angabe","غير محدد"),"together" to fm("Zusammen","معًا"),"separated" to fm("Getrennt","منفصلان"),"divorced" to fm("Geschieden","مطلقان"),"single" to fm("Alleinerziehend","ولي أمر واحد"),"other" to fm("Andere","أخرى"))){situation=it}
            Text(fm("Die Familiensituation ändert keine Zugriffsrechte.","الحالة الأسرية لا تمنح أو تلغي أي صلاحية."))}
        1->{
            adults.forEachIndexed{i,a->key(i){
                Text(fm("Sorgeberechtigte Person","ولي الأمر")+" "+(i+1),style=MaterialTheme.typography.titleMedium)
                TextButton(onClick={pickAdult=if(pickAdult==i)null else i}){Text(fm("Vorhandene Person wählen","اختيار ولي أمر موجود"))}
                if(pickAdult==i)RecordPicker(model,"guardians",exclude=adults.mapNotNull{it.existing}.toSet()){r->adult(i,Adult(r.getString("displayName"),r.optString("contactEmail").takeUnless{it=="null"}?:"",r.optString("contactPhone").takeUnless{it=="null"}?:"",r.optString("correspondenceLocale",locale),existing=r.getString("id")));pickAdult=null}
                Field(R.string.family_name,a.name,editable=a.existing==null){adult(i,a.copy(name=it))}
                if(a.existing==null){
                    Field(R.string.guardian_email,a.email){adult(i,a.copy(email=it))}
                    Field(R.string.guardian_phone,a.phone){adult(i,a.copy(phone=it))}
                    Field(R.string.profile_birth,a.birth){adult(i,a.copy(birth=it))}
                    Field(R.string.profile_address,a.address){adult(i,a.copy(address=it))}
                    FamilyChoice(fm("Sprache","اللغة"),a.language,listOf("de" to "Deutsch","ar" to "العربية")){adult(i,a.copy(language=it))}
                }else TextButton(onClick={adult(i,Adult(language=locale))}){Text(fm("Neue Person eingeben","إدخال شخص جديد"))}
                if(adults.size>1&&i==adults.lastIndex)TextButton(onClick={adults=adults.dropLast(1);children=children.map{it.copy(links=it.links-i,payer=it.payer?.takeUnless{p->p==i})}}){Text(fm("Entfernen","إزالة"))}
                HorizontalDivider()
            }}
            if(adults.size<8)TextButton(onClick={adults=adults+Adult(language=locale)}){Text(fm("+ Sorgeberechtigte Person","+ ولي أمر"))}
        }
        2->{
            FamilyChoice(fm("Schuljahr","السنة الدراسية"),year,listOf("" to fm("Ohne Zuordnung","بدون تحديد"))+years.map{it.getString("id") to (it.optString("startsOn")+" – "+it.optString("endsExclusive"))}){year=it;children=children.map{c->c.copy(classroom="")}}
            children.forEachIndexed{i,c->key(i){
                Text(fm("Kind","الطفل")+" "+(i+1),style=MaterialTheme.typography.titleMedium)
                TextButton(onClick={pickChild=if(pickChild==i)null else i}){Text(fm("Vorhandenes Kind wählen","اختيار طفل موجود"))}
                if(pickChild==i)RecordPicker(model,"students",exclude=children.mapNotNull{it.existing}.toSet()){r->child(i,Child(name=r.getString("displayName"),existing=r.getString("id")));pickChild=null}
                Field(R.string.family_name,c.name,editable=c.existing==null){child(i,c.copy(name=it))}
                if(c.existing==null){Field(R.string.profile_birth,c.birth){child(i,c.copy(birth=it))}
                    FamilyChoice(fm("Klasse","الفصل"),c.classroom,listOf("" to fm("Ohne Klasse","بدون فصل"))+classes.map{it.getString("id") to classLabel(it,locale)}){child(i,c.copy(classroom=it))}
                }else TextButton(onClick={child(i,Child())}){Text(fm("Neues Kind eingeben","إدخال طفل جديد"))}
                if(children.size>1&&i==children.lastIndex)TextButton(onClick={children=children.dropLast(1)}){Text(fm("Entfernen","إزالة"))}
                HorizontalDivider()
            }}
            if(children.size<25)TextButton(onClick={children=children+Child()}){Text(fm("+ Kind","+ طفل"))}
        }
        3->{
            Text(fm("Nur ausdrücklich bestätigte Verknüpfungen gewähren Zugriff. Bestehende Rechte werden hier nicht widerrufen.","فقط الروابط المعتمدة صراحة تمنح الوصول. لا يتم إلغاء الصلاحيات الحالية هنا."))
            children.forEachIndexed{i,c->
                Text(c.name,style=MaterialTheme.typography.titleMedium)
                adults.forEachIndexed{j,a->
                    val link=c.links[j]?:("none" to "unspecified")
                    Text(a.name)
                    FamilyChoice(fm("Verknüpfung","الربط"),link.first,listOf("none" to fm("Nicht neu verknüpfen","عدم إنشاء رابط جديد"),"pending" to fm("Prüfung ausstehend","قيد المراجعة"),"approved" to fm("Bestätigt","معتمد"))){v->child(i,c.copy(links=c.links+(j to (v to link.second)),payer=c.payer?.takeUnless{it==j&&v!="approved"}))}
                    if(link.first!="none")FamilyChoice(fm("Beziehung","صلة القرابة"),link.second,listOf("unspecified" to fm("Nicht angegeben","غير محدد"),"father" to fm("Vater","الأب"),"mother" to fm("Mutter","الأم"),"legal" to fm("Gesetzliche Vertretung","الوصي القانوني"),"other" to fm("Andere","أخرى"))){v->child(i,c.copy(links=c.links+(j to (link.first to v))))}
                }
                if(canBill&&c.existing==null)FamilyChoice(fm("Zahlungspflichtige Person","مسؤول السداد"),c.payer?.toString()?:"",listOf("" to fm("Später festlegen","تحديد لاحقًا"))+adults.mapIndexedNotNull{j,a->if(c.links[j]?.first=="approved")j.toString() to a.name else null}){child(i,c.copy(payer=it.toIntOrNull()))}
                HorizontalDivider()
            }
        }
        4->{
            Text(name,style=MaterialTheme.typography.titleMedium)
            children.forEach{c->Text(c.name,style=MaterialTheme.typography.titleMedium);adults.forEachIndexed{j,a->Text(a.name+" · "+familyLinkLabel(c.links[j]?.first?:"none"))};c.payer?.let{Text(fm("Zahlung: ","السداد: ")+adults[it].name)}}
            Row(Modifier.fillMaxWidth()){Checkbox(checked=confirmed,onCheckedChange={confirmed=it});Text(fm("Ich habe die Angaben und Berechtigungen geprüft.","راجعت البيانات والصلاحيات."),modifier=Modifier.weight(1f).padding(top=12.dp))}
            Text(fm("Einladungen werden nicht automatisch gesendet.","لا تُرسل الدعوات تلقائيًا."))
            Submit(confirmed,label=R.string.school_save,success=null){
                val body=JSONObject().put("displayName",name.trim()).put("situation",situation)
                    .put("guardians",JSONArray(adults.map{a->JSONObject().put("displayName",a.name.trim()).put("contactEmail",nullable(a.email)).put("contactPhone",nullable(a.phone)).put("correspondenceLocale",a.language).apply{if(a.existing!=null)put("existingId",a.existing)else{put("birthDate",nullable(a.birth));put("emergencyAddress",nullable(a.address))}}}))
                    .put("children",JSONArray(children.map{c->JSONObject().put("displayName",c.name.trim()).apply{if(c.existing!=null)put("existingId",c.existing)else{put("birthDate",nullable(c.birth));put("classId",nullable(c.classroom));c.payer?.let{put("payerGuardianIndex",it)}};put("guardianLinks",JSONArray(c.links.filterValues{it.first!="none"}.map{(i,l)->JSONObject().put("guardianIndex",i).put("approved",l.first=="approved").put("relationship",l.second)}))}}))
                val result=model.schoolCommand(requests,"/school/families","POST",body)
                done(result.getString("familyId"))
            }
        }
    }
    val valid=when(step){0->name.trim().length in 1..200;1->adults.all{it.name.trim().length in 1..200&&it.phone.length<=48&&it.address.length<=500&&validFamilyBirth(it.birth)&&(it.email.isBlank()||android.util.Patterns.EMAIL_ADDRESS.matcher(it.email.trim()).matches())}&&adults.map{it.email.trim().lowercase()}.filter{it.isNotBlank()}.let{it.distinct().size==it.size};2->children.all{it.name.trim().length in 1..200&&validFamilyBirth(it.birth)};3->children.all{c->c.links.values.any{it.first=="approved"}&&c.links.values.all{it.first=="none"||it.second!="unspecified"}};else->false}
    Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(8.dp)){
        if(step>0)OutlinedButton(onClick={step--;confirmed=false},modifier=Modifier.weight(1f).heightIn(min=48.dp)){Text(fm("Zurück","رجوع"))}
        if(step<4)Button(enabled=valid,onClick={step++;confirmed=false},modifier=Modifier.weight(1.5f).heightIn(min=48.dp)){Text(fm("Weiter","التالي"))}
    }
}
