package de.madrasty.app.school

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
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import de.madrasty.app.R
import de.madrasty.app.api.decodeData
import de.madrasty.app.identity.HttpFailure
import de.madrasty.app.identity.IdentityViewModel
import de.madrasty.app.ui.AsyncState
import de.madrasty.app.ui.AsyncSurface
import de.madrasty.app.ui.isolate
import kotlinx.coroutines.CancellationException
import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate

private typealias Commands = MutableMap<String, Pair<String, String>>

private val assignmentRoles = mapOf(
    "teacher" to R.string.staff_role_teacher, "principal" to R.string.staff_role_principal,
    "deputy" to R.string.staff_role_deputy, "office" to R.string.staff_role_office,
)
private val actionLabels = mapOf(
    "attendance.read" to R.string.assignment_attendance_read, "attendance.mark" to R.string.assignment_attendance_mark,
    "attendance.approve" to R.string.assignment_attendance_approve, "academics.plan" to R.string.assignment_academics_plan,
    "academics.log" to R.string.assignment_academics_log, "academics.grade" to R.string.assignment_academics_grade,
    "academics.publish" to R.string.assignment_academics_publish, "comms.class" to R.string.assignment_comms_class,
)

@Composable
fun StaffAssignmentsScreen(model: IdentityViewModel, close: () -> Unit) {
    val commands = remember { mutableMapOf<String, Pair<String, String>>() }
    var reload by remember { mutableStateOf(0) }
    var assigning by remember { mutableStateOf(false) }
    var query by remember { mutableStateOf("") }
    var search by remember { mutableStateOf("") }
    var selected by remember { mutableStateOf<JSONObject?>(null) }
    var newStaff by remember { mutableStateOf(false) }
    var people by remember { mutableStateOf<AsyncState<List<JSONObject>>>(AsyncState.InitialLoading()) }
    var next by remember { mutableStateOf<String?>(null) }
    BackHandler(onBack = close)
    LaunchedEffect(reload, query) {
        people = assignmentLoad({ reload++ }) {
            val page = staffPage(model, query)
            next = page.nextCursor
            page.data
        }
    }
    Column(
        Modifier.fillMaxSize().safeDrawingPadding().imePadding().verticalScroll(rememberScrollState()).padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        TextButton(onClick = close) { Text(stringResource(R.string.back)) }
        Text(stringResource(R.string.staff_assignments), style = MaterialTheme.typography.headlineMedium)
        Choice(!assigning, R.string.staff_profiles) { assigning = false }
        Choice(assigning, R.string.class_assignments) { assigning = true }
        Field(R.string.staff_find, search) { search = it.take(120) }
        TextButton(onClick = { query = search.trim() }) { Text(stringResource(R.string.staff_search)) }
        AsyncSurface(people) { rows ->
            if (assigning) ClassAssignments(model, commands, rows.filterNot { it.isNull("accountId") || it.getBoolean("disabled") })
            else {
                rows.forEach { row ->
                    FilterChip(
                        selected?.getString("id") == row.getString("id"),
                        onClick = { selected = row; newStaff = false },
                        label = { Text(isolate(row.getString("displayName"))) },
                    )
                }
                TextButton(onClick = { selected = null; newStaff = true }) { Text(stringResource(R.string.staff_add)) }
                if (newStaff || selected != null) key(selected?.getString("id"), selected?.optInt("revision")) {
                    StaffProfileForm(model, commands, selected) { selected = it; newStaff = false; reload++ }
                }
            }
            next?.let { cursor ->
                Submit(true, R.string.staff_more) {
                    val page = staffPage(model, query, cursor)
                    next = page.nextCursor
                    people = AsyncState.Ready(rows + page.data)
                }
            }
        }
    }
}

private suspend fun staffPage(model: IdentityViewModel, query: String, cursor: String? = null) =
    decodeData(model.schoolRequest("/school/staff?limit=100&query=${Uri.encode(query)}" +
        (cursor?.let { "&cursor=$it" } ?: ""))) { value -> (value as JSONArray).objects() }

@Composable
private fun StaffProfileForm(model: IdentityViewModel, commands: Commands, item: JSONObject?, saved: (JSONObject) -> Unit) {
    var name by remember { mutableStateOf(item.present("displayName")) }
    var role by remember { mutableStateOf(item.present("role").ifEmpty { "teacher" }) }
    var ar by remember { mutableStateOf(item.present("titleAr")) }
    var de by remember { mutableStateOf(item.present("titleDe")) }
    var email by remember { mutableStateOf(item.present("workEmail")) }
    var phone by remember { mutableStateOf(item.present("workPhone")) }
    var account by remember { mutableStateOf(item.present("accountId")) }
    var from by remember { mutableStateOf(item.present("activeFrom")) }
    var until by remember { mutableStateOf(item.present("activeUntil")) }
    var candidates by remember { mutableStateOf<AsyncState<List<JSONObject>>>(AsyncState.InitialLoading()) }
    var reload by remember { mutableStateOf(0) }
    LaunchedEffect(reload) { candidates = assignmentLoad({ reload++ }) { model.records("/school/staff/accounts") } }
    HorizontalDivider()
    Field(R.string.staff_name, name) { name = it.take(200) }
    assignmentRoles.forEach { (key, label) -> Choice(role == key, label) { role = key } }
    Field(R.string.staff_title_ar, ar) { ar = it.take(120) }
    Field(R.string.staff_title_de, de) { de = it.take(120) }
    Field(R.string.staff_email, email) { email = it.take(254) }
    Field(R.string.staff_phone, phone) { phone = it.take(48) }
    if (item.present("accountId").isEmpty()) AsyncSurface(candidates) { rows ->
        Text(stringResource(R.string.staff_account))
        Choice(account.isEmpty(), R.string.staff_no_account) { account = "" }
        rows.forEach { row ->
            val id = row.getString("accountId")
            FilterChip(account == id, onClick = { account = id }, label = { Text(isolate(row.getString("displayName"))) })
        }
    }
    Field(R.string.assignment_from, from) { from = it.take(10) }
    Field(R.string.assignment_until, until) { until = it.take(10) }
    Submit(name.isNotBlank() && ar.isNotBlank() && de.isNotBlank() && schoolDate(from) && (until.isEmpty() || dateRange(from, until))) {
        val input = JSONObject().put("displayName", name.trim()).put("role", role).put("titleAr", ar.trim()).put("titleDe", de.trim())
            .put("workEmail", nullable(email)).put("workPhone", nullable(phone)).put("accountId", nullable(account))
            .put("activeFrom", from).put("activeUntil", nullable(until))
        val path = item?.let { input.put("revision", it.getInt("revision")); "/school/staff/${it.getString("id")}" } ?: "/school/staff"
        saved(model.schoolCommand(commands, path, if (item == null) "POST" else "PATCH", input))
    }
}

@Composable
private fun ClassAssignments(model: IdentityViewModel, commands: Commands, people: List<JSONObject>) {
    val de = LocalConfiguration.current.locales[0].language == "de"
    var year by remember { mutableStateOf("") }
    var classId by remember { mutableStateOf("") }
    var reload by remember { mutableStateOf(0) }
    var retry by remember { mutableStateOf(0) }
    var years by remember { mutableStateOf<AsyncState<List<JSONObject>>>(AsyncState.InitialLoading()) }
    var classes by remember { mutableStateOf<AsyncState<List<JSONObject>>>(AsyncState.InitialLoading()) }
    var subjects by remember { mutableStateOf<AsyncState<List<JSONObject>>>(AsyncState.InitialLoading()) }
    var assignments by remember { mutableStateOf<AsyncState<List<JSONObject>>>(AsyncState.InitialLoading()) }
    LaunchedEffect(retry) {
        years = assignmentLoad({ retry++ }) { model.records("/school/years") }
        subjects = assignmentLoad({ retry++ }) { model.records("/school/subjects") }
    }
    LaunchedEffect(year,retry) {
        if (year.isNotEmpty()) classes = assignmentLoad({ retry++ }) { model.records("/school/classes?yearId=$year&limit=100") }
    }
    LaunchedEffect(classId,reload) {
        if (classId.isNotEmpty()) assignments = assignmentLoad({ reload++ }) { model.records("/school/classes/$classId/assignments") }
    }
    Text(stringResource(R.string.choose_year))
    AsyncSurface(years) { rows ->
        rows.forEach { row ->
            val id = row.getString("id")
            FilterChip(year == id, onClick = {
                if (year != id) { year = id; classId = ""; classes = AsyncState.InitialLoading() }
            }, label = { Text(isolate("${row.getString("startsOn")} – ${row.getString("endsExclusive")}")) })
        }
        if (year.isNotEmpty()) {
            Text(stringResource(R.string.choose_class))
            AsyncSurface(classes) { options ->
                options.forEach { row ->
                    val id = row.getString("id")
                    FilterChip(classId == id, onClick = {
                        if (classId != id) { classId = id; assignments = AsyncState.InitialLoading() }
                    }, label = { Text(classLabel(row, if (de) "de" else "ar")) })
                }
            }
        }
    }
    if (classId.isNotEmpty()) key(classId) {
        val base = "/school/classes/$classId/assignments"
        var create by remember { mutableStateOf(false) }
        TextButton(onClick = { create = !create }) { Text(stringResource(R.string.assignment_add)) }
        if (create) AsyncSurface(subjects) { catalog ->
            DatedAssignmentForm(people, catalog, de, actionLabels.keys, "new") { body ->
                model.schoolCommand(commands, base, "POST", body)
                create = false
                reload++
            }
        }
        AsyncSurface(assignments) { rows ->
            rows.forEach { row -> key(row.getString("id"),row.getInt("revision")) {
                AssignmentRow(model, commands, row, people, de) { reload++ }
            } }
        }
    }
}

@Composable
private fun AssignmentRow(model: IdentityViewModel, commands: Commands, row: JSONObject, people: List<JSONObject>, de: Boolean, saved: () -> Unit) {
    var operation by remember { mutableStateOf("") }
    val path = "/school/assignments/${row.getString("id")}"
    HorizontalDivider()
    AssignmentDetails(row,de)
    row.getJSONArray("substitutes").objects().forEach { entry ->
        Text(stringResource(R.string.assignment_substitute))
        Text(isolate(entry.getString("staffName")))
        Text(isolate("${entry.getString("from")} – ${entry.getString("untilExclusive")}"))
    }
    if (row.getBoolean("revoked")) return
    listOf("end" to R.string.assignment_end, "replace" to R.string.assignment_replace,
        "substitute" to R.string.assignment_substitute, "revoke" to R.string.assignment_revoke).forEach { (key,label) ->
        Choice(operation == key,label) { operation = if (operation == key) "" else key }
    }
    val revision = row.getInt("revision")
    when (operation) {
        "end" -> {
            var until by remember { mutableStateOf(row.getString("untilExclusive")) }
            Field(R.string.assignment_until, until) { until = it.take(10) }
            Submit(dateRange(row.getString("from"),until)) {
                model.schoolCommand(commands,path,"PATCH",JSONObject().put("revision",revision).put("untilExclusive",until))
                saved()
            }
        }
        "revoke" -> Submit(true,R.string.assignment_revoke) {
            model.schoolCommand(commands,path,"PATCH",JSONObject().put("revision",revision).put("revoke",true))
            saved()
        }
        "replace", "substitute" -> key(operation) {
            val actions = row.getJSONArray("capabilities").strings().toSet()
            DatedAssignmentForm(people, emptyList(), de, actions, operation) { body ->
                if (operation == "replace") model.schoolCommand(commands,path,"PATCH",JSONObject().put("revision",revision).put("replacement",body))
                else model.schoolCommand(commands,"$path/substitutes","POST",body.put("revision",revision))
                saved()
            }
        }
    }
}

@Composable
private fun DatedAssignmentForm(
    people: List<JSONObject>, subjects: List<JSONObject>, de: Boolean, actions: Set<String>, mode: String,
    save: suspend (JSONObject) -> Unit,
) {
    var staff by remember { mutableStateOf("") }
    var kind by remember { mutableStateOf("primary") }
    var subject by remember { mutableStateOf("") }
    var from by remember { mutableStateOf("") }
    var until by remember { mutableStateOf("") }
    var capabilities by remember { mutableStateOf(emptySet<String>()) }
    Text(stringResource(R.string.staff_profiles))
    people.forEach { row ->
        val id = row.getString("id")
        FilterChip(staff == id, onClick = { staff = id }, label = { Text(isolate(row.getString("displayName"))) })
    }
    if (mode == "new") {
        Choice(kind == "primary",R.string.assignment_primary) { kind = "primary" }
        Choice(kind == "subject",R.string.assignment_subject) { kind = "subject" }
        if (kind == "subject") subjects.forEach { row ->
            val id = row.getString("id")
            FilterChip(subject == id, onClick = { subject = id }, label = { Text(isolate(row.getString(if (de) "nameDe" else "nameAr"))) })
        }
    }
    Field(R.string.assignment_from,from) { from = it.take(10) }
    if (mode != "replace") Field(R.string.assignment_until,until) { until = it.take(10) }
    Text(stringResource(R.string.assignment_rights))
    actionLabels.filterKeys { it in actions }.forEach { (cap,label) ->
        Choice(cap in capabilities,label) { capabilities = if (cap in capabilities) capabilities - cap else capabilities + cap }
    }
    Submit(staff.isNotEmpty() && capabilities.isNotEmpty() && schoolDate(from) &&
        (mode == "replace" || dateRange(from,until)) && (mode != "new" || kind == "primary" || subject.isNotEmpty())) {
        val body = JSONObject().put("staffId",staff).put("from",from).put("capabilities",JSONArray(capabilities.toList()))
        if (mode != "replace") body.put("untilExclusive",until)
        if (mode == "new") body.put("kind",kind).put("subjectId",if (kind == "subject") subject else JSONObject.NULL)
        save(body)
    }
}

@Composable
fun TeachingSummary(model: IdentityViewModel) {
    val de = LocalConfiguration.current.locales[0].language == "de"
    var attempt by remember { mutableStateOf(0) }
    var state by remember { mutableStateOf<AsyncState<List<JSONObject>>>(AsyncState.InitialLoading()) }
    LaunchedEffect(attempt) {
        state = assignmentLoad({ attempt++ }) {
            model.records("/me/teaching")
        }
    }
    Text(stringResource(R.string.teaching_overview), style = MaterialTheme.typography.titleLarge)
    AsyncSurface(state) { rows ->
        if (rows.isEmpty()) Text(stringResource(R.string.no_teaching_assignments))
        rows.forEach { AssignmentDetails(it,de) }
    }
}

@Composable
private fun AssignmentDetails(row: JSONObject, de: Boolean) {
    val subject = row.present(if (de) "subjectNameDe" else "subjectNameAr")
    val className = row.getString(if (de) "classNameDe" else "classNameAr")
    Text(isolate(className), style = MaterialTheme.typography.titleMedium)
    Text(subject.ifEmpty { stringResource(R.string.assignment_primary) })
    Text(isolate("${row.getString("from")} – ${row.getString("untilExclusive")}"))
    if (row.optBoolean("substitute")) Text(stringResource(R.string.assignment_substitute))
    if (row.optBoolean("revoked")) Text(stringResource(R.string.assignment_revoked))
    row.getJSONArray("capabilities").strings().forEach { actionLabels[it]?.let { id -> Text(stringResource(id)) } }
}

@Composable
private fun Choice(chosen: Boolean, label: Int, choose: () -> Unit) {
    FilterChip(chosen, onClick = choose, label = { Text(stringResource(label)) })
}

private fun JSONObject?.present(key: String) = if (this == null || isNull(key)) "" else getString(key)
private fun JSONArray.objects() = List(length(), ::getJSONObject)
private fun JSONArray.strings() = List(length(), ::getString)
private fun nullable(value: String): Any = value.trim().takeIf(String::isNotEmpty) ?: JSONObject.NULL
private fun schoolDate(date: String) = date.length == 10 && runCatching { LocalDate.parse(date) }.isSuccess
private fun dateRange(from: String, until: String) = schoolDate(from) && schoolDate(until) && from < until

private suspend fun <T> assignmentLoad(retry: () -> Unit, action: suspend () -> T): AsyncState<T> =
    try { AsyncState.Ready(action()) }
    catch (error: CancellationException) { throw error }
    catch (error: HttpFailure) {
        if (error.status in listOf(401,403,404)) AsyncState.Forbidden() else AsyncState.Error(retry = retry)
    } catch (_: Exception) { AsyncState.Error(retry = retry) }
