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
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import de.madrasty.app.R
import de.madrasty.app.api.decodeData
import de.madrasty.app.identity.IdentityViewModel
import de.madrasty.app.ui.AsyncState
import de.madrasty.app.ui.AsyncSurface
import de.madrasty.app.ui.isolate
import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate

@Composable
fun EnrollmentScreen(model: IdentityViewModel, manageClasses: Boolean, manageEnrollment: Boolean, close: () -> Unit, student:String?=null) {
    val requests = remember { mutableMapOf<String, Pair<String, String>>() }
    var years by remember { mutableStateOf<AsyncState<List<JSONObject>>>(AsyncState.InitialLoading()) }
    var generation by remember { mutableStateOf(0) }
    var selectedYear by remember { mutableStateOf("") }
    var classes by remember { mutableStateOf<AsyncState<List<JSONObject>>>(AsyncState.InitialLoading()) }
    var selectedClass by remember { mutableStateOf("") }
    var introducing by remember { mutableStateOf(false) }
    var rollover by remember { mutableStateOf(false) }
    val locale = if (LocalConfiguration.current.locales[0].language == "de") "de" else "ar"
    BackHandler(onBack = close)

    LaunchedEffect(generation) { years = load({ generation++ }) { model.records("/school/years") } }
    LaunchedEffect(selectedYear, generation) {
        if (selectedYear.isNotEmpty()) classes = load({ generation++ }) {
            model.records("/school/classes?yearId=$selectedYear&limit=100")
        }
    }

    Column(
        Modifier.fillMaxSize().safeDrawingPadding().imePadding().verticalScroll(rememberScrollState()).padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        TextButton(onClick = close) { Text(stringResource(R.string.back)) }
        Text(stringResource(R.string.enrollments), Modifier.semantics { heading() }, style = MaterialTheme.typography.headlineMedium)
        Text(stringResource(R.string.choose_year))
        AsyncSurface(years) { schoolYears ->
            schoolYears.forEach { year ->
                val id = year.getString("id")
                FilterChip(id == selectedYear, onClick = {
                    if (id != selectedYear) classes = AsyncState.InitialLoading()
                    selectedYear = id
                    selectedClass = ""
                    introducing = false
                    rollover = false
                }, label = { Text(yearLabel(year)) })
            }
            val year = schoolYears.find { it.getString("id") == selectedYear }
            if (year != null) AsyncSurface(classes) { available ->
                val editable = year.getString("state") != "closed"
                val current = available.find { it.getString("id") == selectedClass }
                HorizontalDivider()
                Text(stringResource(R.string.choose_class), style = MaterialTheme.typography.titleLarge)
                available.forEach { item ->
                    FilterChip(selectedClass == item.getString("id"), onClick = {
                        selectedClass = item.getString("id")
                        introducing = false
                    }, label = { Text(classLabel(item, locale)) })
                }
                if (manageClasses && editable) TextButton(onClick = { introducing = true; selectedClass = "" }) {
                    Text(stringResource(R.string.new_class))
                }
                if (manageClasses && editable && (introducing || current != null)) key(selectedClass) {
                    ClassForm(current, selectedYear) { input ->
                        val saved = model.schoolCommand(requests,
                            current?.let { "/school/classes/${it.getString("id")}" } ?: "/school/classes",
                            if (current == null) "POST" else "PATCH", input)
                        val id = saved.getString("id")
                        classes = AsyncState.Ready(listOf(saved) + available.filter { it.getString("id") != id })
                        selectedClass = id
                        introducing = false
                    }
                }
                if (manageEnrollment && current != null) key(selectedClass) {
                    HorizontalDivider()
                    ClassRoster(model, requests, current, available, locale, editable,student)
                }
                if (manageEnrollment && editable) TextButton(onClick = { rollover = !rollover }) {
                    Text(stringResource(R.string.year_rollover))
                }
                if (rollover) key(selectedYear) {
                    RolloverEditor(model, requests, year, schoolYears, available, locale, manageClasses) { generation++ }
                }
            }
        }
    }
}

@Composable
private fun ClassForm(current: JSONObject?, year: String, save: suspend (JSONObject) -> Unit) {
    var code by remember { mutableStateOf(current?.optString("code").orEmpty()) }
    var ar by remember { mutableStateOf(current?.optString("nameAr").orEmpty()) }
    var de by remember { mutableStateOf(current?.optString("nameDe").orEmpty()) }
    var capacity by remember { mutableStateOf(if (current == null || current.isNull("capacity")) "" else current.getInt("capacity").toString()) }
    Field(R.string.class_code, code, editable = current == null) { code = it.uppercase() }
    Field(R.string.school_name_ar, ar) { ar = it }
    Field(R.string.school_name_de, de) { de = it }
    Field(R.string.class_cap, capacity) { capacity = it.filter(Char::isDigit).take(4) }
    Submit(enabled = code.matches(Regex("[A-Z0-9][A-Z0-9_-]{0,23}")) && ar.isNotBlank() && de.isNotBlank() &&
        (capacity.isBlank() || capacity.toIntOrNull() in 1..1000)) {
        val input = JSONObject().put("nameAr", ar.trim()).put("nameDe", de.trim())
            .put("capacity", capacity.toIntOrNull() ?: JSONObject.NULL)
        if (current == null) input.put("code", code).put("yearId", year)
        else input.put("revision", current.getInt("revision"))
        save(input)
    }
}

@Composable
private fun ClassRoster(model: IdentityViewModel, requests: SchoolCommandAttempts, current: JSONObject,
    classes: List<JSONObject>, locale: String, editable: Boolean, student:String?,
) {
    val id = current.getString("id")
    var date by remember { mutableStateOf("") }
    var opened by remember { mutableStateOf("") }
    var rows by remember { mutableStateOf<JSONObject?>(null) }
    var cursor by remember { mutableStateOf<String?>(null) }
    var query by remember { mutableStateOf("") }
    var students by remember { mutableStateOf(emptyList<JSONObject>()) }
    var selected by remember { mutableStateOf(emptySet<String>()) }
    var entry by remember { mutableStateOf<Pair<JSONObject, String>?>(null) }
    var history by remember { mutableStateOf(emptyList<JSONObject>()) }
    var from by remember { mutableStateOf("") }
    var pupil by remember(student) { mutableStateOf<AsyncState<JSONObject>?>(null) }
    LaunchedEffect(student,editable) {
        if (student != null && editable) {
            pupil = load({}) { decodeData(model.schoolRequest("/school/students/$student")) { it as JSONObject }.data }
            val data = (pupil as? AsyncState.Ready<JSONObject>)?.content
            if (data != null && data.getString("state") == "active") {
                students = listOf(data)
                selected = setOf(student)
            }
        }
    }

    suspend fun read(day: String, after: String? = null) {
        val page = decodeData(model.schoolRequest("/school/classes/$id/roster?date=$day" +
            (after?.let { "&cursor=$it" } ?: ""))) { it as JSONObject }
        val prior = if (after == null) emptyList() else rows?.optJSONArray("rows")?.objects().orEmpty()
        val received = page.data.getJSONArray("rows").objects()
        rows = page.data.put("rows", JSONArray(prior + received))
        cursor = page.nextCursor
        opened = day
    }

    Text(stringResource(R.string.class_roster), style = MaterialTheme.typography.titleLarge)
    Field(R.string.school_day, date) { date = it }
    Submit(dateOk(date), R.string.open_roster) { read(date) }

    rows?.let { roster ->
        Text(if (roster.getBoolean("teachingDay")) opened else "$opened · ${stringResource(R.string.school_cancelled)}")
        val pupils = roster.getJSONArray("rows").objects()
        if (pupils.isEmpty()) Text(stringResource(R.string.empty))
        pupils.forEach { row ->
            val enrollment = row.getJSONObject("enrollment")
            Text("${isolate(row.getString("displayName"))} · \u2066${row.getString("studentNumber")}\u2069")
            Submit(true, R.string.enrollment_history) {
                history = model.records("/school/students/${enrollment.getString("studentId")}/enrollments")
            }
            if (editable) {
                TextButton(onClick = { entry = enrollment to "transfer" }) { Text(stringResource(R.string.transfer_student)) }
                TextButton(onClick = { entry = enrollment to "withdraw" }) { Text(stringResource(R.string.withdraw_student)) }
            }
        }
        cursor?.let { after -> Submit(true, R.string.staff_more) { read(opened, after) } }
    }
    history.forEach { row ->
        Text("${row.getString("effectiveFrom")} – ${row.getString("effectiveUntil")} · ${row.optString("endingReason").takeUnless { it == "null" }.orEmpty()}")
    }
    entry?.let { (record, operation) -> key(record.getString("id"), operation) {
        TransferForm(classes.filter { it.getString("id") != id }, locale, operation == "transfer",
            close = { entry = null }) { payload ->
            payload.put("revision", record.getInt("revision"))
            model.schoolCommand(requests, "/school/enrollments/${record.getString("id")}/$operation", "POST", payload)
            entry = null
            if (opened.isNotEmpty()) read(opened)
        }
    } }
    if (editable) {
        Text(stringResource(R.string.place_students), style = MaterialTheme.typography.titleLarge)
        Field(R.string.family_query, query) { query = it }
        Submit(true, R.string.search_family) {
            students = model.records("/school/students?query=${Uri.encode(query.trim())}&limit=100")
                .filter { it.getString("state") == "active" }
        }
        students.forEach { pupil ->
            val child = pupil.getString("id")
            FilterChip(child in selected, onClick = { selected = if (child in selected) selected - child else selected + child },
                label = { Text(isolate(pupil.getString("displayName"))) })
        }
        Field(R.string.enrollment_from, from) { from = it }
        Submit(selected.size in 1..100 && dateOk(from), R.string.place_students) {
            model.schoolCommand(requests, "/school/classes/$id/enrollments", "POST",
                JSONObject().put("studentIds", JSONArray(selected.toList())).put("from", from)
                    .put("revision", current.getInt("revision")))
            selected = emptySet()
            if (opened.isNotEmpty()) read(opened)
        }
    }
}

@Composable
private fun TransferForm(classes: List<JSONObject>, locale: String, transfer: Boolean,
    close: () -> Unit, submit: suspend (JSONObject) -> Unit,
) {
    var date by remember { mutableStateOf("") }
    var reason by remember { mutableStateOf("") }
    var to by remember { mutableStateOf("") }
    Text(stringResource(if (transfer) R.string.transfer_student else R.string.withdraw_student))
    Field(R.string.enrollment_from, date) { date = it }
    Field(R.string.link_reason, reason) { reason = it }
    if (transfer) classes.forEach { item ->
        val id = item.getString("id")
        FilterChip(to == id, onClick = { to = id }, label = { Text(classLabel(item, locale)) })
    }
    Submit(dateOk(date) && reason.trim().length in 1..400 && (!transfer || to.isNotEmpty())) {
        val payload = JSONObject().put("effectiveDate", date).put("reason", reason.trim())
        if (transfer) payload.put("toClassId", to)
        submit(payload)
    }
    TextButton(onClick = close) { Text(stringResource(R.string.close)) }
}

@Composable
private fun RolloverEditor(model: IdentityViewModel, requests: SchoolCommandAttempts, source: JSONObject, years: List<JSONObject>,
    classes: List<JSONObject>, locale: String, confirmable: Boolean, confirmed: () -> Unit,
) {
    var target by remember { mutableStateOf("") }
    var targets by remember { mutableStateOf<AsyncState<List<JSONObject>>>(AsyncState.InitialLoading()) }
    var retry by remember { mutableStateOf(0) }
    var mapping by remember { mutableStateOf(emptyMap<String, String>()) }
    var overrides by remember { mutableStateOf(emptyMap<String, Pair<String, String?>>()) }
    var preview by remember { mutableStateOf<JSONObject?>(null) }
    var dirty by remember { mutableStateOf(true) }
    val sourceId = source.getString("id")

    LaunchedEffect(target, retry) {
        if (target.isNotEmpty()) targets = load({ retry++ }) {
            model.records("/school/classes?yearId=$target&limit=100")
        }
    }
    Text(stringResource(R.string.rollover_target), style = MaterialTheme.typography.titleLarge)
    years.filter { it.getString("startsOn") >= source.getString("endsExclusive") && it.getString("state") != "closed" }.forEach { year ->
        val id = year.getString("id")
        FilterChip(target == id, onClick = {
            target = id; targets = AsyncState.InitialLoading(); mapping = emptyMap(); overrides = emptyMap(); preview = null; dirty = true
        }, label = { Text(yearLabel(year)) })
    }
    if (target.isNotEmpty()) AsyncSurface(targets) { options ->
        classes.forEach { item ->
            val origin = item.getString("id")
            Text(classLabel(item, locale))
            options.forEach { option ->
                val id = option.getString("id")
                FilterChip(mapping[origin] == id, onClick = { mapping = mapping + (origin to id); dirty = true },
                    label = { Text(classLabel(option, locale)) })
            }
        }
        Submit(overrides.values.none { (mode, id) -> mode in listOf("repeat", "target") && id == null }, R.string.rollover_preview) {
            val assigned = JSONArray(mapping.map { (from, to) -> JSONObject().put("fromClassId", from).put("toClassId", to) })
            val exceptions = JSONArray(overrides.map { (student, change) ->
                JSONObject().put("studentId", student).put("action", change.first).apply {
                    change.second?.let { put("toClassId", it) }
                }
            })
            preview = model.schoolCommand(requests, "/school/years/$sourceId/rollovers/preview", "POST",
                JSONObject().put("targetYearId", target).put("classMap", assigned).put("exceptions", exceptions))
            dirty = false
        }
        preview?.let { view ->
            val counts = view.getJSONObject("counts")
            Text(stringResource(R.string.rollover_count, counts.getInt("changes"), counts.getInt("conflicts"), counts.getInt("noPlacement")))
            view.getJSONArray("rows").objects().forEach { row ->
                val child = row.getString("studentId")
                Text(isolate(row.getString("displayName")))
                val conflict = when (row.optString("conflict")) {
                    "already_enrolled" -> R.string.enrollment_conflict
                    "student_inactive" -> R.string.enrollment_inactive
                    "target_missing" -> R.string.enrollment_no_target
                    "class_full" -> R.string.enrollment_class_full
                    else -> null
                }
                conflict?.let { Text(stringResource(it)) }
                val value = overrides[child]
                val actions = mapOf("place" to R.string.rollover_place, "repeat" to R.string.rollover_repeat,
                    "withdraw" to R.string.withdraw_student, "skip" to R.string.rollover_skip, "target" to R.string.rollover_override)
                actions.forEach { (mode, label) ->
                    FilterChip((value?.first ?: "place") == mode, onClick = {
                        overrides = if (mode == "place") overrides - child else overrides + (child to (mode to null))
                        dirty = true
                    }, enabled = !view.getBoolean("confirmed"), label = { Text(stringResource(label)) })
                }
                if (value?.first in listOf("repeat", "target")) options.forEach { option ->
                    val id = option.getString("id")
                    FilterChip(value?.second == id, onClick = {
                        overrides = overrides + (child to (checkNotNull(value).first to id)); dirty = true
                    }, label = { Text(classLabel(option, locale)) })
                }
            }
            if (confirmable && !view.getBoolean("confirmed")) Submit(!dirty && counts.getInt("conflicts") == 0, R.string.rollover_confirm) {
                preview = model.schoolCommand(requests, "/school/rollovers/${view.getString("id")}/confirm", "POST",
                    JSONObject().put("revision", view.getInt("revision")))
                confirmed()
            }
        }
    }
}

internal suspend fun IdentityViewModel.records(path: String) =
    decodeData(schoolRequest(path)) { (it as JSONArray).objects() }.data
internal fun classLabel(row: JSONObject, locale: String) =
    "\u2066${row.getString("code")}\u2069 · ${isolate(row.getString(if (locale == "de") "nameDe" else "nameAr"))}"
private fun yearLabel(row: JSONObject) = "${row.getString("startsOn")} – ${row.getString("endsExclusive")}"
private fun JSONArray.objects() = List(length(), ::getJSONObject)
private fun dateOk(input: String) = input.length == 10 && runCatching { LocalDate.parse(input) }.isSuccess

private suspend fun <T> load(retry: () -> Unit, read: suspend () -> T): AsyncState<T> =
    try { AsyncState.Ready(read()) }
    catch (error: kotlinx.coroutines.CancellationException) { throw error }
    catch (error: de.madrasty.app.identity.HttpFailure) {
        if (error.status in listOf(401,403,404)) AsyncState.Forbidden() else AsyncState.Error(retry = retry)
    } catch (_: Exception) { AsyncState.Error(retry = retry) }
