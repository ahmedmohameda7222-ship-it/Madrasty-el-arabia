package de.madrasty.app.school

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import de.madrasty.app.R
import de.madrasty.app.api.decodeData
import de.madrasty.app.identity.HttpFailure
import de.madrasty.app.identity.IdentityViewModel
import de.madrasty.app.ui.AsyncState
import de.madrasty.app.ui.AsyncSurface
import de.madrasty.app.ui.formatSchoolDate
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate
import java.util.Locale
import java.util.UUID

private data class Period(val id: String, val start: String, val end: String, val state: String, val days: Set<Int>, val revision: Int)
private data class Calendar(val settings: JSONObject?, val years: List<Period>)

private fun period(obj: JSONObject): Period {
    val days = obj.getJSONArray("teachingWeekdays")
    return Period(obj.getString("id"), obj.getString("startsOn"), obj.getString("endsExclusive"),
        obj.getString("state"), (0 until days.length()).map(days::getInt).toSet(), obj.getInt("revision"))
}

internal suspend fun IdentityViewModel.schoolCommand(
    attempts: MutableMap<String, Pair<String, String>>, path: String, method: String, input: JSONObject,
): JSONObject {
    val serialized = input.toString()
    val id = "$method:$path"
    val key = attempts[id]?.takeIf { it.first == serialized }?.second ?: UUID.randomUUID().toString()
    attempts[id] = serialized to key
    try {
        return decodeData(schoolRequest(path, input, method, key)) { it as JSONObject }.data
            .also { attempts.remove(id) }
    } catch (error: HttpFailure) {
        if (error.status < 500) attempts.remove(id)
        throw error
    }
}

@Composable
fun CalendarScreen(model: IdentityViewModel, close: () -> Unit) {
    var state by remember { mutableStateOf<AsyncState<Calendar>>(AsyncState.InitialLoading()) }
    var attempt by remember { mutableStateOf(0) }
    var selected by remember { mutableStateOf<String?>(null) }
    val requests = remember { mutableMapOf<String, Pair<String, String>>() }
    val locale = Locale.forLanguageTag(if (LocalConfiguration.current.locales[0].language == "de") "de" else "ar")
    BackHandler(onBack = close)

    LaunchedEffect(attempt) {
        state = AsyncState.InitialLoading()
        state = try {
            val settings = decodeData(model.schoolRequest("/school/settings")) { it as? JSONObject }.data
            val years = decodeData(model.schoolRequest("/school/years")) { body ->
                val list = body as JSONArray
                List(list.length()) { period(list.getJSONObject(it)) }
            }.data
            AsyncState.Ready(Calendar(settings, years))
        } catch (error: CancellationException) { throw error }
        catch (error: HttpFailure) {
            if (error.status == 401 || error.status == 403) AsyncState.Forbidden(close)
            else AsyncState.Error(retry = { attempt++ })
        } catch (_: Exception) {
            AsyncState.Error(retry = { attempt++ })
        }
    }

    Column(
        Modifier.fillMaxSize().safeDrawingPadding().imePadding().verticalScroll(rememberScrollState()).padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        TextButton(onClick = close) { Text(stringResource(R.string.back)) }
        Text(stringResource(R.string.school_calendar), Modifier.semantics { heading() }, style = MaterialTheme.typography.headlineMedium)
        AsyncSurface(state) { calendar ->
            SettingsForm(calendar.settings, command = { model.schoolCommand(requests, "/school/settings", "PATCH", it) })
            HorizontalDivider()
            Text(stringResource(R.string.school_years), style = MaterialTheme.typography.titleLarge)
            TextButton(onClick = { selected = null }) { Text(stringResource(R.string.school_new_year)) }
            calendar.years.forEach { year ->
                TextButton(onClick = { selected = year.id }) {
                    Text("${formatSchoolDate(year.start, locale)} – ${formatSchoolDate(year.end, locale)}")
                }
            }
            val year = calendar.years.find { it.id == selected }
            key(year?.id) {
                YearForm(year, command = { input ->
                    val saved = period(model.schoolCommand(requests, year?.let { "/school/years/${it.id}" } ?: "/school/years",
                        if (year == null) "POST" else "PATCH", input))
                    selected = saved.id
                    state = AsyncState.Ready(calendar.copy(years = listOf(saved) + calendar.years.filter { it.id != saved.id }))
                })
                if (year != null) {
                    HorizontalDivider()
                    DayForm(model, year, requests)
                }
            }
        }
    }
}

@Composable
private fun SettingsForm(initial: JSONObject?, command: suspend (JSONObject) -> JSONObject) {
    Text(stringResource(R.string.school_settings), style = MaterialTheme.typography.titleLarge)
    var arabic by remember { mutableStateOf(initial?.optString("nameAr").orEmpty()) }
    var german by remember { mutableStateOf(initial?.optString("nameDe").orEmpty()) }
    var timezone by remember { mutableStateOf(initial?.optString("timezone").orEmpty()) }
    var currency by remember { mutableStateOf(initial?.optString("currency").orEmpty()) }
    var due by remember { mutableStateOf(initial?.optString("dueDay").orEmpty()) }
    var revision by remember { mutableStateOf(initial?.optInt("revision") ?: 0) }
    Field(R.string.school_name_ar, arabic) { arabic = it }
    Field(R.string.school_name_de, german) { german = it }
    Field(R.string.school_timezone, timezone) { timezone = it }
    Field(R.string.school_currency, currency) { currency = it.uppercase(Locale.ROOT).take(3) }
    OutlinedTextField(due, { due = it.filter(Char::isDigit).take(2) }, modifier = Modifier.fillMaxWidth(), singleLine = true,
        label = { Text(stringResource(R.string.school_due)) }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number))
    Submit(enabled = arabic.isNotBlank() && german.isNotBlank() && timezone.isNotBlank() &&
        currency.length == 3 && (due.toIntOrNull() ?: 0) in 1..31) {
        val input = JSONObject().put("nameAr", arabic.trim()).put("nameDe", german.trim()).put("timezone", timezone.trim())
            .put("currency", currency).put("dueDay", due.toInt()).put("revision", revision)
        revision = command(input).getInt("revision")
    }
}

private val weekdays = listOf(R.string.school_week_1, R.string.school_week_2, R.string.school_week_3,
    R.string.school_week_4, R.string.school_week_5, R.string.school_week_6, R.string.school_week_7)

@Composable
private fun YearForm(year: Period?, command: suspend (JSONObject) -> Unit) {
    var start by remember { mutableStateOf(year?.start.orEmpty()) }
    var end by remember { mutableStateOf(year?.end.orEmpty()) }
    var state by remember { mutableStateOf(year?.state ?: "draft") }
    var days by remember { mutableStateOf(year?.days ?: emptySet()) }
    val editable = year?.state != "closed"
    Field(R.string.school_start, start, editable) { start = it }
    Field(R.string.school_end, end, editable) { end = it }
    val states = when (year?.state) {
        "active" -> listOf("active", "closed")
        "closed" -> listOf("closed")
        else -> listOf("draft", "active")
    }
    states.forEach { key ->
        val label = when (key) { "active" -> R.string.school_active; "closed" -> R.string.school_closed; else -> R.string.school_draft }
        FilterChip(selected = key == state, onClick = { state = key }, enabled = editable, label = { Text(stringResource(label)) })
    }
    Text(stringResource(R.string.school_weekdays))
    weekdays.forEachIndexed { index, label ->
        val day = index + 1
        Row(verticalAlignment = Alignment.CenterVertically) {
            Checkbox(day in days, { active -> days = if (active) days + day else days - day }, enabled = editable)
            Text(stringResource(label))
        }
    }
    if (editable) {
        Submit(enabled = validDate(start) && validDate(end) && start < end && days.isNotEmpty()) {
            val input = JSONObject().put("startsOn", start).put("endsExclusive", end).put("state", state)
                .put("teachingWeekdays", JSONArray(days.sorted()))
            year?.let { input.put("revision", it.revision) }
            command(input)
        }
    }
}

@Composable
private fun DayForm(model: IdentityViewModel, year: Period, attempts: MutableMap<String, Pair<String, String>>) {
    var rows by remember { mutableStateOf<AsyncState<List<JSONObject>>>(AsyncState.InitialLoading()) }
    var reload by remember { mutableStateOf(0) }
    var date by remember { mutableStateOf("") }
    var reason by remember { mutableStateOf("") }
    var teaching by remember { mutableStateOf(false) }
    var classId by remember { mutableStateOf("") }
    var classes by remember { mutableStateOf(emptyList<JSONObject>()) }
    val locale = LocalConfiguration.current.locales[0].language
    val path = "/school/years/${year.id}/days"
    LaunchedEffect(reload) {
        rows = try {
            classes = model.records("/school/classes?yearId=${year.id}&limit=100")
            val result = decodeData(model.schoolRequest(path)) { body ->
                val list = body as JSONArray
                List(list.length()) { list.getJSONObject(it) }
            }.data
            AsyncState.Ready(result)
        } catch (error: CancellationException) { throw error }
        catch (_: Exception) { AsyncState.Error(retry = { reload++ }) }
    }
    Text(stringResource(R.string.school_exceptions), style = MaterialTheme.typography.titleLarge)
    AsyncSurface(rows) { saved ->
        if (saved.isEmpty()) Text(stringResource(R.string.empty))
        saved.forEach { value ->
            val day = value.getString("schoolDate")
            TextButton(onClick = {
                date = day
                classId = if (value.isNull("classId")) "" else value.getString("classId")
                reason = value.getString("reason")
                teaching = value.getBoolean("teaching")
            }) {
                Column {
                    Text("$day · ${stringResource(if (value.getBoolean("teaching")) R.string.school_teaching else R.string.school_cancelled)}")
                    Text(value.getString("reason"), style = MaterialTheme.typography.bodySmall)
                }
            }
        }
        if (year.state != "closed") {
            Field(R.string.school_day, date) { date = it }
            FilterChip(classId.isEmpty(), { classId = "" }, label = { Text(stringResource(R.string.whole_school)) })
            classes.forEach { item ->
                val id = item.getString("id")
                FilterChip(classId == id, { classId = id }, label = { Text(classLabel(item, locale)) })
            }
            Field(R.string.school_reason, reason) { reason = it }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Checkbox(teaching, { teaching = it })
                Text(stringResource(if (teaching) R.string.school_teaching else R.string.school_cancelled))
            }
            Submit(enabled = validDate(date) && date >= year.start && date < year.end && reason.isNotBlank()) {
                val revision = saved.find { it.getString("schoolDate") == date && (if (it.isNull("classId")) "" else it.getString("classId")) == classId }?.getInt("revision") ?: 0
                val change = model.schoolCommand(attempts, "$path/$date", "PUT", JSONObject().put("teaching", teaching)
                    .put("reason", reason.trim()).put("revision", revision).put("classId", classId.ifEmpty { null } ?: JSONObject.NULL))
                rows = AsyncState.Ready((saved.filter { it.getString("id") != change.getString("id") } + change)
                    .sortedBy { it.getString("schoolDate") })
            }
        }
    }
}

private fun validDate(value: String) = value.length == 10 && runCatching { LocalDate.parse(value) }.isSuccess

@Composable
internal fun Field(label: Int, value: String, editable: Boolean = true, edit: (String) -> Unit) {
    OutlinedTextField(value, edit, Modifier.fillMaxWidth(), label = { Text(stringResource(label)) },
        singleLine = true, enabled = editable)
}

@Composable
internal fun Submit(enabled: Boolean, label: Int = R.string.school_save, action: suspend () -> Unit) {
    val scope = rememberCoroutineScope()
    var pending by remember { mutableStateOf(false) }
    var status by remember { mutableStateOf<Int?>(null) }
    Button(enabled = enabled && !pending, onClick = { scope.launch {
        pending = true
        status = null
        try { action(); status = R.string.saved }
        catch (error: CancellationException) { throw error }
        catch (error: HttpFailure) { status = if (error.status == 409) R.string.conflict else R.string.generic_error }
        catch (_: Exception) { status = R.string.generic_error }
        finally { pending = false }
    } }) {
        Text(stringResource(if (pending) R.string.pending else label))
    }
    status?.let { Text(stringResource(it), Modifier.semantics { liveRegion = LiveRegionMode.Polite }) }
}
