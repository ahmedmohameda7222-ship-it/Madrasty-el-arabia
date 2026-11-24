package de.madrasty.app.school

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.clickable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.ui.Alignment
import androidx.compose.ui.res.painterResource
import androidx.compose.material3.Icon
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Currency
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
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
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
import de.madrasty.app.api.WirePage
import de.madrasty.app.api.decodeData
import de.madrasty.app.identity.IdentityViewModel
import de.madrasty.app.identity.loadAccountSurface
import de.madrasty.app.identity.ProfileGreeting
import de.madrasty.app.ui.AsyncState
import de.madrasty.app.ui.AsyncSurface
import de.madrasty.app.ui.Persona
import de.madrasty.app.ui.RoleHero
import de.madrasty.app.ui.isolate
import org.json.JSONArray
import org.json.JSONObject
import java.text.NumberFormat
import java.time.LocalTime
import java.time.ZoneId
import java.util.Locale

data class WorkQueueSelection(val key: String,val asOf: String)

sealed interface SchoolWorkTarget {
    data class BouncedInvite(val id:String):SchoolWorkTarget
    data class AttendanceSheet(val classId:String,val date:String):SchoolWorkTarget
    data class EnrollmentStop(val id:String):SchoolWorkTarget
    data class ReceiptMatch(val id:String):SchoolWorkTarget
    data class GuardianLink(val guardianId: String,val linkId: String) : SchoolWorkTarget
    data class FamilyImport(val jobId: String) : SchoolWorkTarget
    data class ClassAssignment(val classId: String,val yearId: String) : SchoolWorkTarget
}

private val queueLabels = mapOf(
    "guardian_links" to R.string.queue_guardian_links,"family_imports" to R.string.queue_family_imports,
    "class_assignments" to R.string.queue_class_assignments,"bounced_invites" to R.string.queue_bounced_invites,
    "unapproved_attendance" to R.string.queue_unapproved_attendance,"noncontinuation_requests" to R.string.queue_noncontinuation,
    "settlement_review" to R.string.queue_settlements,
)

@Composable
fun SchoolHomeScreen(
    model: IdentityViewModel,
    persona: Persona,
    workDate: String,
    changeWorkDate: (String) -> Unit,
    openQueue: (WorkQueueSelection) -> Unit,
    openTasks: () -> Unit,
    openFinance: () -> Unit,
    openAttendanceReview: (String) -> Unit,
    openOwnProfile: () -> Unit,
    openDirectory: () -> Unit,
    openSetup: () -> Unit,
    openMore: () -> Unit,
    addGuardian: () -> Unit,
    openEvents: () -> Unit,
    openNews: () -> Unit,
    openIssue: () -> Unit,
    openAnnouncement: () -> Unit,
    child: String?,
    pickChild: (String) -> Unit,
    openProfile: (String) -> Unit,
    openAttendance: (String, String?) -> Unit,
    openSchedule: (String?) -> Unit,
) {
    val locales = LocalConfiguration.current.locales
    val language = locales[0].language
    val refresh = foregroundVersion()
    ProfileGreeting(model,refresh)
    when (persona) {
        Persona.Admin -> AdminHome(model,workDate,changeWorkDate,openQueue,openDirectory,openSetup,
            openMore,addGuardian,openEvents,openNews,openIssue,openAnnouncement,language,refresh,openTasks,openFinance,openAttendanceReview,openOwnProfile,{openSchedule(null)})
        Persona.Teacher -> TeacherHome(model,openAttendance,openSchedule,language,refresh)
        Persona.Guardian -> GuardianHome(model,child,pickChild,openProfile,openSchedule,language,refresh)
    }
}

@Composable
private fun AdminHome(
    model: IdentityViewModel, workDate:String, changeWorkDate:(String)->Unit,
    openQueue:(WorkQueueSelection)->Unit, directory:()->Unit, setup:()->Unit,
    more:()->Unit, addGuardian:()->Unit, events:()->Unit, news:()->Unit, issue:()->Unit, announce:()->Unit,
    language:String, refresh:Int, tasks:()->Unit, finance:()->Unit, attendance:(String)->Unit,
    profile:()->Unit, schedule:()->Unit,
) {
    val work = scheduleRead("/school/work-queues",refresh,model::timetableObject)
    AsyncSurface(work) { summary ->
        if (summary.optBoolean("setupRequired")) {
            val mayConfigure=summary.optBoolean("mayConfigure")
            RoleHero(Persona.Admin,stringResource(R.string.queue_title),stringResource(R.string.school_setup_required),
                stringResource(if(mayConfigure) R.string.school_calendar else R.string.directory_title)) {
                if(mayConfigure)setup() else directory()
            }
            return@AsyncSurface
        }
        val today=summary.getString("today")
        val queues=summary.getJSONArray("queues").tableRows().filter { it.getString("key") in queueLabels && it.getString("key")!="noncontinuation_requests" }
        val total=queues.filter{it.optString("state")=="ready"}.sumOf{it.optInt("count")}
        val unavailable=queues.any{it.optString("state")=="unavailable"}
        val numbers=NumberFormat.getIntegerInstance(Locale.forLanguageTag(language))
        val dateFormatter=DateTimeFormatter.ofLocalizedDate(FormatStyle.LONG).withLocale(Locale.forLanguageTag(language))
        fun date(value:String)=runCatching{LocalDate.parse(value).format(dateFormatter)}.getOrDefault(value)
        Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween,verticalAlignment=Alignment.CenterVertically){
            Text(date(today),style=MaterialTheme.typography.bodySmall)
            TextButton(onClick=profile){Text(stringResource(R.string.profile_title))}
        }
        val detail=when{
            total>0->stringResource(R.string.admin_start_task_count,numbers.format(total))
            unavailable->stringResource(R.string.queue_unavailable)
            else->stringResource(R.string.admin_start_done)
        }
        RoleHero(Persona.Admin,stringResource(R.string.queue_title),detail,stringResource(R.string.queue_open),tasks)
        if(unavailable&&total>0)Text(stringResource(R.string.queue_unavailable),style=MaterialTheme.typography.bodySmall)
        val overview=summary.optJSONObject("overview")
        if(overview!=null){
            val metrics=listOf(Triple("students",R.string.nav_students,R.drawable.ic_people),
                Triple("classes",R.string.admin_start_classes,R.drawable.ic_home),
                Triple("teachers",R.string.admin_start_teachers,R.drawable.ic_people)).filter{!overview.isNull(it.first)}
            if(metrics.isNotEmpty()){
                Text(stringResource(R.string.admin_start_overview),style=MaterialTheme.typography.titleMedium)
                Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(8.dp)){
                    metrics.forEach{(key,label,icon)->
                        Card(Modifier.weight(1f),shape=RoundedCornerShape(16.dp)){
                            Column(Modifier.padding(12.dp),verticalArrangement=Arrangement.spacedBy(4.dp)){
                                Icon(painterResource(icon),null,tint=MaterialTheme.colorScheme.primary,modifier=Modifier.size(22.dp))
                                Text(numbers.format(overview.getInt(key)),style=MaterialTheme.typography.headlineSmall)
                                Text(stringResource(label),style=MaterialTheme.typography.bodySmall)
                            }
                        }
                    }
                }
            }
            overview.optJSONObject("attendance")?.let{stats->
                val day=stats.getString("date")
                Text(stringResource(if(day==today)R.string.admin_start_today else R.string.admin_start_last),style=MaterialTheme.typography.titleMedium)
                DashboardPanel{
                    Text(date(day),style=MaterialTheme.typography.bodySmall)
                    val present=stats.getInt("present");val late=stats.getInt("late");val absent=stats.getInt("absent")
                    val marked=present+late+absent
                    if(marked>0){
                        val fraction=(present+late).toFloat()/marked
                        Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(18.dp)){
                            androidx.compose.foundation.layout.Box(contentAlignment=Alignment.Center,modifier=Modifier.size(80.dp)){
                                CircularProgressIndicator(progress={fraction},modifier=Modifier.size(80.dp),strokeWidth=8.dp)
                                Text(numbers.format(kotlin.math.round(fraction*100).toInt())+"%",style=MaterialTheme.typography.titleMedium)
                            }
                            Column(Modifier.weight(1f),verticalArrangement=Arrangement.spacedBy(6.dp)){
                                DashboardValue(R.string.admin_start_present,numbers.format(present))
                                DashboardValue(R.string.admin_start_late,numbers.format(late))
                                DashboardValue(R.string.admin_start_absent,numbers.format(absent))
                            }
                        }
                    }else Text(stringResource(R.string.admin_start_no_attendance))
                    Text(stringResource(R.string.admin_start_coverage,numbers.format(stats.getInt("approvedClasses")),numbers.format(stats.getInt("expectedClasses"))),style=MaterialTheme.typography.bodySmall)
                    TextButton(onClick={attendance(day)}){Text(stringResource(R.string.admin_start_open_attendance))}
                }
            }
            overview.optJSONObject("finance")?.let{stats->
                Text(stringResource(R.string.admin_start_finance),style=MaterialTheme.typography.titleMedium)
                val money=NumberFormat.getCurrencyInstance(Locale.forLanguageTag(language)).apply{currency=Currency.getInstance(stats.getString("currency"))}
                val cash=stats.getLong("cash");val bank=stats.getLong("bank")
                DashboardPanel{
                    Text(stats.getString("month")+" · "+stringResource(R.string.admin_start_income),style=MaterialTheme.typography.bodySmall)
                    Text(money.format((cash+bank)/100.0),style=MaterialTheme.typography.headlineSmall)
                    DashboardValue(R.string.admin_start_cash,money.format(cash/100.0))
                    DashboardValue(R.string.admin_start_bank,money.format(bank/100.0))
                    TextButton(onClick=finance){Text(stringResource(R.string.admin_start_open_finance))}
                }
            }
            val quick=buildList<Triple<Int,Int,()->Unit>>{
                if(!overview.isNull("students"))add(Triple(R.string.admin_start_family,R.drawable.ic_people,addGuardian))
                if(overview.optBoolean("mayPublish")){
                    add(Triple(R.string.admin_start_event,R.drawable.ic_attendance,events))
                    add(Triple(R.string.admin_start_announce,R.drawable.ic_messages,announce))
                }
                if(overview.optBoolean("mayIssue"))add(Triple(R.string.admin_start_invoice,R.drawable.ic_more,issue))
            }
            if(quick.isNotEmpty()){
                Text(stringResource(R.string.admin_start_quick),style=MaterialTheme.typography.titleMedium)
                Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(6.dp)){
                    quick.forEach{(label,icon,action)->
                        Card(Modifier.weight(1f).clickable(onClick=action),shape=RoundedCornerShape(16.dp)){
                            Column(Modifier.fillMaxWidth().padding(vertical=12.dp,horizontal=4.dp),horizontalAlignment=Alignment.CenterHorizontally,verticalArrangement=Arrangement.spacedBy(6.dp)){
                                Icon(painterResource(icon),null,tint=MaterialTheme.colorScheme.primary,modifier=Modifier.size(24.dp))
                                Text(stringResource(label),style=MaterialTheme.typography.labelSmall)
                            }
                        }
                    }
                }
            }
            overview.optJSONObject("schoolDays")?.let{days->
                Text(stringResource(R.string.admin_start_next),style=MaterialTheme.typography.titleMedium)
                DashboardPanel{
                    Text(if(days.isNull("next"))stringResource(R.string.admin_start_no_next)else date(days.getString("next")),style=MaterialTheme.typography.titleMedium)
                    if(overview.optBoolean("maySchedule"))TextButton(onClick=schedule){Text(stringResource(R.string.timetable_title))}
                }
            }
        }
        Text(stringResource(R.string.admin_start_news),style=MaterialTheme.typography.titleMedium)
        DashboardPanel{
            TextButton(onClick=news){Text(stringResource(R.string.school_news))}
            HorizontalDivider()
            TextButton(onClick=events){Text(stringResource(R.string.school_events))}
        }
    }
}

@Composable
private fun DashboardPanel(content:@Composable androidx.compose.foundation.layout.ColumnScope.()->Unit){
    Card(Modifier.fillMaxWidth(),shape=RoundedCornerShape(18.dp),colors=CardDefaults.cardColors(containerColor=MaterialTheme.colorScheme.surface)){
        Column(Modifier.padding(16.dp),verticalArrangement=Arrangement.spacedBy(8.dp),content=content)
    }
}
@Composable
private fun DashboardValue(label:Int,value:String){
    Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween){
        Text(stringResource(label),style=MaterialTheme.typography.bodyMedium)
        Text(value,style=MaterialTheme.typography.titleSmall)
    }
}

@Composable
fun AdminTasksScreen(model:IdentityViewModel,open:(WorkQueueSelection)->Unit,close:()->Unit){
    val refresh=foregroundVersion()
    var selected by remember{mutableStateOf("")}
    var draft by remember{mutableStateOf("")}
    var showZero by remember{mutableStateOf(false)}
    val work=scheduleRead("/school/work-queues"+if(selected.isEmpty())"" else "?asOf=$selected",refresh,model::timetableObject)
    BackHandler(onBack=close)
    Column(Modifier.fillMaxSize().safeDrawingPadding().imePadding().verticalScroll(rememberScrollState()).padding(16.dp),verticalArrangement=Arrangement.spacedBy(12.dp)){
        TextButton(onClick=close){Text(stringResource(R.string.back))}
        Text(stringResource(R.string.queue_title),style=MaterialTheme.typography.headlineMedium)
        AsyncSurface(work){summary->
            if(summary.optBoolean("setupRequired")){Text(stringResource(R.string.school_setup_required));return@AsyncSurface}
            val asOf=summary.getString("asOf")
            Text(isolate(asOf))
            Field(R.string.queue_date,draft){draft=it.take(10)}
            Row{
                TextButton(enabled=timetableDate(draft),onClick={selected=draft}){Text(stringResource(R.string.queue_filter))}
                TextButton(enabled=selected.isNotEmpty(),onClick={selected="";draft=""}){Text(stringResource(R.string.timetable_current))}
            }
            val queues=summary.getJSONArray("queues").tableRows().filter{it.getString("key") in queueLabels && it.getString("key")!="noncontinuation_requests"}
            if(queues.none{it.optString("state")=="unavailable"||it.optInt("count")>0})Text(stringResource(R.string.admin_start_done))
            DashboardPanel{
                queues.filter{showZero||it.optString("state")=="unavailable"||it.optInt("count")>0}.forEach{row->
                    val key=row.getString("key")
                    if(row.optString("state")=="ready")TextButton(onClick={open(WorkQueueSelection(key,asOf))}){
                        Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween){
                            Text(stringResource(queueLabels.getValue(key)),Modifier.weight(1f));Text(row.getInt("count").toString())
                        }
                    }else Text(stringResource(queueLabels.getValue(key))+" · "+stringResource(R.string.queue_unavailable))
                    HorizontalDivider()
                }
                TextButton(onClick={showZero=!showZero}){Text(stringResource(if(showZero)R.string.admin_start_active_tasks else R.string.admin_start_all_tasks))}
            }
        }
    }
}

@Composable
private fun TeacherHome(model: IdentityViewModel, attendance: (String,String?)->Unit, schedule:(String?)->Unit, language:String, refresh:Int) {
    val assignments = scheduleRead("/me/teaching",refresh,model::records)
    val suffix = if (language == "de") "De" else "Ar"
    AsyncSurface(assignments) { rows ->
        val primaryClasses = rows.filter { it.getString("kind") == "primary" }.map { it.getString("classId") }.toSet()
        HomeSchedule(model,null,schedule,language,refresh) { lesson,date ->
            if (lesson.getString("classId") in primaryClasses) attendance(lesson.getString("classId"),date)
            else schedule(null)
        }
        Text(stringResource(R.string.teaching_overview),style=MaterialTheme.typography.titleLarge)
        if (rows.isEmpty()) Text(stringResource(R.string.no_teaching_assignments))
        rows.forEach { row ->
            val primary = row.getString("kind") == "primary"
            val detail = when {
                row.getBoolean("substitute") -> stringResource(R.string.assignment_substitute)
                primary -> stringResource(R.string.assignment_primary)
                else -> row.getString("subjectName$suffix")
            }
            TextButton(onClick = { if (primary) attendance(row.getString("classId"),null) else schedule(null) }) {
                Text("${isolate(row.getString("className$suffix"))} · ${isolate(detail)}")
            }
        }
    }
}

@Composable
private fun GuardianHome(
    model:IdentityViewModel, chosen:String?, pick:(String)->Unit, profile:(String)->Unit,
    schedule:(String?)->Unit, language:String, refresh:Int,
) {
    val children = scheduleRead("/me/children?limit=100",refresh,model::records)
    AsyncSurface(children) { rows ->
        val child = rows.find { it.getString("id") == chosen } ?: rows.firstOrNull()
        if (child == null) Text(stringResource(R.string.empty))
        else {
            val id = child.getString("id")
            rows.forEach { row ->
                val option = row.getString("id")
                FilterChip(id == option,onClick = { pick(option) },label={ Text(isolate(row.getString("displayName"))) })
            }
            val classroom = child.optJSONObject("currentClass")
            val detail = classroom?.getString(if (language == "de") "nameDe" else "nameAr") ?: stringResource(R.string.nav_children)
            RoleHero(Persona.Guardian,child.getString("displayName"),detail,stringResource(R.string.home_child_action)) { profile(id) }
            HomeSchedule(model,id,schedule,language,refresh)
        }
    }
}

@Composable
private fun HomeSchedule(model: IdentityViewModel, child:String?, open:(String?)->Unit, language:String, refresh:Int,
    nextLesson: ((JSONObject,String)->Unit)? = null) {
    val school = scheduleRead("/school/work-queues",refresh,model::timetableObject)
    AsyncSurface(school) { date ->
        if(date.isNull("today")) {
            Text(stringResource(R.string.school_setup_required))
            return@AsyncSurface
        }
        val today = date.getString("today")
        val week = scheduleRead("/school/timetable?weekOf=$today" + (child?.let { "&childId=$it" } ?: ""),refresh,model::timetableObject)
        AsyncSurface(week) { value ->
            val suffix = if (language == "de") "De" else "Ar"
            val lessons = value.getJSONArray("slots").tableRows().filter { it.getString("date") == today && it.getBoolean("teaching") }
                .sortedBy { it.getInt("start") }
            if (nextLesson != null) {
                val time = LocalTime.now(ZoneId.of(value.getString("timezone")))
                val next = lessons.firstOrNull { it.getInt("start") >= time.hour * 60 + time.minute }
                if (next != null) RoleHero(Persona.Teacher,stringResource(R.string.home_next_lesson),
                    "${formatMinutes(next.getInt("start"))} · ${next.getString("className$suffix")} · ${next.getString("subjectName$suffix")}",
                    stringResource(R.string.home_open_lesson)) { nextLesson(next,today) }
            }
            Text(stringResource(R.string.home_lessons_today),style=MaterialTheme.typography.titleLarge)
            if (lessons.isEmpty()) Text(stringResource(R.string.home_no_lessons))
            lessons.forEach { row ->
                Text(isolate("${formatMinutes(row.getInt("start"))} – ${formatMinutes(row.getInt("end"))}"))
                Text(isolate(row.getString("subjectName$suffix")))
                Text(isolate(row.getString("classCode")) + " · " + isolate(row.getString("roomCode")))
                if (row.getBoolean("substitute")) Text(stringResource(R.string.timetable_substitute))
            }
            TextButton(onClick = { open(child) }) { Text(stringResource(R.string.timetable_title)) }
        }
    }
}

@Composable
fun SchoolWorkQueueScreen(model: IdentityViewModel, selection: WorkQueueSelection, open: (SchoolWorkTarget)->Unit, close:()->Unit) {
    val refresh = foregroundVersion()
    val suffix = if (LocalConfiguration.current.locales[0].language == "de") "De" else "Ar"
    val path = "/school/work-queues/${selection.key}?asOf=${selection.asOf}&limit=25"
    var retry by remember(path) { mutableStateOf(0) }
    var state by remember(path,refresh) { mutableStateOf<AsyncState<WirePage<JSONObject>>>(AsyncState.InitialLoading()) }
    BackHandler(onBack = close)
    LaunchedEffect(path,refresh,retry) {
        state = loadAccountSurface({ retry++ }) { model.workPage(path) }
    }
    Column(Modifier.fillMaxSize().safeDrawingPadding().imePadding().verticalScroll(rememberScrollState()).padding(20.dp),
        verticalArrangement=Arrangement.spacedBy(8.dp)) {
        TextButton(onClick=close) { Text(stringResource(R.string.back)) }
        Text(stringResource(queueLabels.getValue(selection.key)),style=MaterialTheme.typography.headlineMedium)
        Text(isolate(selection.asOf))
        AsyncSurface(state) { page ->
            val items = page.data.getJSONArray("items").tableRows()
            if (items.isEmpty()) Text(stringResource(R.string.queue_empty))
            items.forEach { row ->
                val target = row.getJSONObject("target")
                val action = when (target.getString("kind")) {
                    "bounced_invite" -> SchoolWorkTarget.BouncedInvite(target.getString("invitationId"))
                    "attendance_sheet" -> SchoolWorkTarget.AttendanceSheet(target.getString("classId"),target.getString("date"))
                    "enrollment_stop" -> SchoolWorkTarget.EnrollmentStop(target.getString("requestId"))
                    "receipt_match" -> SchoolWorkTarget.ReceiptMatch(target.getString("receiptId"))
                    "guardian_link" -> SchoolWorkTarget.GuardianLink(target.getString("guardianId"),target.getString("linkId"))
                    "family_import" -> SchoolWorkTarget.FamilyImport(target.getString("jobId"))
                    "class_assignment" -> SchoolWorkTarget.ClassAssignment(target.getString("classId"),target.getString("yearId"))
                    else -> null
                }
                if (action != null) {
                    HorizontalDivider()
                    TextButton(onClick = { open(action) }) { Column {
                        Text(isolate(row.getString("title$suffix")))
                        Text(isolate(row.getString("detail$suffix")),style=MaterialTheme.typography.bodySmall)
                    } }
                }
            }
            page.nextCursor?.let { cursor ->
                Submit(true,R.string.staff_more,success=null) {
                    val response = model.workPage("$path&cursor=$cursor")
                    if ((state as? AsyncState.Ready)?.content == page) {
                        val merged = JSONArray(items + response.data.getJSONArray("items").tableRows())
                        val data = JSONObject().put("asOf",selection.asOf).put("items",merged)
                        state = AsyncState.Ready(WirePage(data,response.nextCursor))
                    }
                }
            }
        }
    }
}

private suspend fun IdentityViewModel.workPage(path:String)= decodeData(schoolRequest(path)) { it as JSONObject }

@Composable
private fun foregroundVersion(): Int {
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    var version by remember { mutableStateOf(0) }
    DisposableEffect(lifecycle) {
        val observer = LifecycleEventObserver { _, event -> if (event == Lifecycle.Event.ON_RESUME) version++ }
        lifecycle.addObserver(observer)
        onDispose { lifecycle.removeObserver(observer) }
    }
    return version
}
