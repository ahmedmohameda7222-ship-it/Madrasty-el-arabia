package de.madrasty.app.school

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
import de.madrasty.app.ui.AsyncState
import de.madrasty.app.ui.AsyncSurface
import de.madrasty.app.ui.Persona
import de.madrasty.app.ui.RoleHero
import de.madrasty.app.ui.isolate
import org.json.JSONArray
import org.json.JSONObject
import java.text.NumberFormat
import java.util.Locale

data class WorkQueueSelection(val key: String,val asOf: String)

sealed interface SchoolWorkTarget {
    data class BouncedInvite(val id:String):SchoolWorkTarget
    data class AttendanceSheet(val classId:String,val date:String):SchoolWorkTarget
    data class EnrollmentStop(val id:String):SchoolWorkTarget
    data class ReceiptMatch(val id:String):SchoolWorkTarget
    data class DeliveryReview(val id:String):SchoolWorkTarget
    data class GuardianLink(val guardianId: String,val linkId: String) : SchoolWorkTarget
    data class FamilyImport(val jobId: String) : SchoolWorkTarget
    data class ClassAssignment(val classId: String,val yearId: String) : SchoolWorkTarget
}

private val queueLabels = mapOf(
    "guardian_links" to R.string.queue_guardian_links,"family_imports" to R.string.queue_family_imports,
    "class_assignments" to R.string.queue_class_assignments,"bounced_invites" to R.string.queue_bounced_invites,
    "unapproved_attendance" to R.string.queue_unapproved_attendance,"noncontinuation_requests" to R.string.queue_noncontinuation,
    "settlement_review" to R.string.queue_settlements,"failed_deliveries" to R.string.queue_failed_deliveries,
)

@Composable
fun SchoolHomeScreen(
    model: IdentityViewModel,
    persona: Persona,
    workDate: String,
    changeWorkDate: (String) -> Unit,
    openQueue: (WorkQueueSelection) -> Unit,
    openDirectory: () -> Unit,
    openSetup: () -> Unit,
    child: String?,
    pickChild: (String) -> Unit,
    openProfile: (String) -> Unit,
    openAttendance: (String) -> Unit,
    openSchedule: (String?) -> Unit,
) {
    val locales = LocalConfiguration.current.locales
    val language = locales[0].language
    val refresh = foregroundVersion()
    when (persona) {
        Persona.Admin -> AdminHome(model,workDate,changeWorkDate,openQueue,openDirectory,openSetup,language,refresh)
        Persona.Teacher -> TeacherHome(model,openAttendance,openSchedule,language,refresh)
        Persona.Guardian -> GuardianHome(model,child,pickChild,openProfile,openSchedule,language,refresh)
    }
}

@Composable
private fun AdminHome(
    model: IdentityViewModel, workDate:String, changeWorkDate:(String)->Unit,
    openQueue:(WorkQueueSelection)->Unit, directory:()->Unit, setup:()->Unit, language:String, refresh:Int,
) {
    var dateText by remember(workDate) { mutableStateOf(workDate) }
    val query = if (workDate.isNotEmpty()) "?asOf=$workDate" else ""
    val work = scheduleRead("/school/work-queues$query",refresh,model::timetableObject)
    AsyncSurface(work) { summary ->
        if (summary.optBoolean("setupRequired")) {
            val mayConfigure=summary.optBoolean("mayConfigure")
            RoleHero(Persona.Admin,stringResource(R.string.queue_title),stringResource(R.string.school_setup_required),
                stringResource(if(mayConfigure) R.string.school_calendar else R.string.directory_title)) {
                if(mayConfigure)setup() else directory()
            }
            return@AsyncSurface
        }
        val asOf = summary.getString("asOf")
        val queues = summary.getJSONArray("queues").tableRows().filter { it.getString("key") in queueLabels }
        val first = queues.firstOrNull { it.getString("state") == "ready" && it.optInt("count") > 0 }
        val detail = when {
            first != null -> queueLabels.getValue(first.getString("key"))
            queues.any { it.getString("state") == "unavailable" } -> R.string.queue_unavailable
            else -> R.string.queue_empty
        }
        RoleHero(Persona.Admin,stringResource(R.string.queue_title),stringResource(detail),
            stringResource(if (first == null) R.string.directory_title else R.string.queue_open)) {
            if (first == null) directory() else openQueue(WorkQueueSelection(first.getString("key"),asOf))
        }
        Text(isolate(asOf))
        Field(R.string.queue_date,dateText) { dateText = it.take(10) }
        TextButton(enabled = timetableDate(dateText),onClick = { changeWorkDate(dateText) }) { Text(stringResource(R.string.queue_filter)) }
        TextButton(enabled = workDate.isNotEmpty(),onClick = { changeWorkDate("") }) { Text(stringResource(R.string.timetable_current)) }
        val numbers = NumberFormat.getIntegerInstance(Locale.forLanguageTag(language))
        queues.forEach { record ->
            val key = record.getString("key")
            val label = stringResource(queueLabels.getValue(key))
            if (record.getString("state") == "ready") TextButton(onClick = { openQueue(WorkQueueSelection(key,asOf)) }) {
                Text("$label · ${numbers.format(record.getInt("count"))}")
            } else Text("$label · ${stringResource(R.string.queue_unavailable)}")
        }
    }
}

@Composable
private fun TeacherHome(model: IdentityViewModel, attendance: (String)->Unit, schedule:(String?)->Unit, language:String, refresh:Int) {
    val assignments = scheduleRead("/me/teaching",refresh,model::records)
    val suffix = if (language == "de") "De" else "Ar"
    AsyncSurface(assignments) { rows ->
        val first = rows.firstOrNull()
        if (first != null) {
            val primary = first.getString("kind") == "primary"
            RoleHero(Persona.Teacher,first.getString("className$suffix"),
                stringResource(if (first.getBoolean("substitute")) R.string.assignment_substitute
                else if (primary) R.string.assignment_primary else R.string.assignment_subject),
                stringResource(if (primary) R.string.home_attendance_action else R.string.timetable_title)) {
                if (primary) attendance(first.getString("classId")) else schedule(null)
            }
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
            TextButton(onClick = { if (primary) attendance(row.getString("classId")) else schedule(null) }) {
                Text("${isolate(row.getString("className$suffix"))} · ${isolate(detail)}")
            }
        }
    }
    HomeSchedule(model,null,schedule,language,refresh)
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
private fun HomeSchedule(model: IdentityViewModel, child:String?, open:(String?)->Unit, language:String, refresh:Int) {
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
                    "delivery_review" -> SchoolWorkTarget.DeliveryReview(target.getString("deliveryId"))
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
