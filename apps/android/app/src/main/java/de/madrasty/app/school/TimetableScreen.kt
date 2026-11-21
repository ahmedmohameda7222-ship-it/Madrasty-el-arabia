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
import de.madrasty.app.api.decodeData
import de.madrasty.app.identity.IdentityViewModel
import de.madrasty.app.identity.loadAccountSurface
import de.madrasty.app.ui.AsyncState
import de.madrasty.app.ui.AsyncSurface
import de.madrasty.app.ui.Persona
import de.madrasty.app.ui.isolate
import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate
import java.time.DayOfWeek
import java.time.format.DateTimeFormatter
import java.time.format.TextStyle
import java.util.Locale

@Composable
fun TimetableScreen(model: IdentityViewModel, persona: Persona, initialChild: String?, close: () -> Unit) {
    val language = LocalConfiguration.current.locales[0].language
    var refresh by remember { mutableStateOf(0) }
    var chosenChild by remember(initialChild) { mutableStateOf(initialChild) }
    var dateText by remember { mutableStateOf("") }
    var date by remember { mutableStateOf("") }
    var classId by remember { mutableStateOf("") }
    var editId by remember { mutableStateOf<String?>(null) }
    var editor by remember { mutableStateOf(false) }
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    BackHandler {
        if (editor) { editor = false; editId = null } else close()
    }
    DisposableEffect(lifecycle) {
        val observer = LifecycleEventObserver { _, event -> if (event == Lifecycle.Event.ON_RESUME) refresh++ }
        lifecycle.addObserver(observer)
        onDispose { lifecycle.removeObserver(observer) }
    }
    val children = scheduleRead(if (persona == Persona.Guardian) "/me/children?limit=100" else null, refresh, model::records)
    val available = (children as? AsyncState.Ready)?.content
    val child = if (chosenChild == null) available?.firstOrNull()?.getString("id")
    else available?.find { it.getString("id") == chosenChild }?.getString("id")
    val query = buildList {
        if (date.isNotBlank()) add("weekOf=$date")
        if (classId.isNotBlank()) add("classId=$classId")
        if (child != null) add("childId=$child")
    }.joinToString("&")
    val path = if (persona == Persona.Guardian && child == null) null else "/school/timetable?$query"
    val week = scheduleRead(path,refresh,model::timetableObject)
    val monday = (week as? AsyncState.Ready)?.content?.getString("weekOf")

    fun openWeek(selected: String) {
        date = selected
        dateText = selected
    }
    fun saved(starts: String?) {
        if (starts != null) openWeek(starts)
        editId = null
        refresh++
    }

    Column(
        Modifier.fillMaxSize().safeDrawingPadding().imePadding().verticalScroll(rememberScrollState()).padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        TextButton(onClick = close) { Text(stringResource(R.string.back)) }
        Text(stringResource(R.string.timetable_title),style=MaterialTheme.typography.headlineMedium)
        if (persona == Persona.Guardian) AsyncSurface(children) { rows ->
            if (rows.isEmpty()) Text(stringResource(R.string.empty))
            else Text(stringResource(R.string.timetable_child))
            rows.forEach { row ->
                val id = row.getString("id")
                FilterChip(child == id, onClick = { chosenChild = id }, label = { Text(isolate(row.getString("displayName"))) })
            }
        }
        if (path == null && chosenChild != null && available != null) AsyncSurface<Unit>(AsyncState.Forbidden()) {}
        if (path != null) {
            TextButton(enabled = monday != null, onClick = { monday?.let { openWeek(LocalDate.parse(it).minusWeeks(1).toString()) } }) {
                Text(stringResource(R.string.timetable_previous))
            }
            TextButton(enabled = date.isNotEmpty(),onClick = { openWeek("") }) { Text(stringResource(R.string.timetable_current)) }
            TextButton(enabled = monday != null, onClick = { monday?.let { openWeek(LocalDate.parse(it).plusWeeks(1).toString()) } }) {
                Text(stringResource(R.string.timetable_next))
            }
            Field(R.string.timetable_date,dateText) { dateText = it.take(10) }
            TextButton(enabled = timetableDate(dateText) && dateText != date,onClick = { openWeek(dateText) }) {
                Text(stringResource(R.string.timetable_open_week))
            }
            if (persona == Persona.Admin) {
                if (classId.isNotEmpty()) TextButton(onClick = { classId = "" }) { Text(stringResource(R.string.timetable_all_classes)) }
                TextButton(onClick = { editId = null; editor = !editor }) { Text(stringResource(R.string.timetable_build)) }
                if (editor) {
                    val slot = editId
                    if (slot == null) TimetableEditor(model,language,null,{ classId = it },::saved){ editor = false }
                    else key(slot) {
                        val detail = scheduleRead("/school/timetable/$slot",refresh,model::timetableObject)
                        AsyncSurface(detail) { record ->
                            key(record.getInt("revision")) {
                                TimetableEditor(model,language,record,{ classId = it },::saved){ editor = false; editId = null }
                            }
                        }
                    }
                }
            }
            AsyncSurface(week) { data ->
                WeekRows(data,language,if (persona == Persona.Admin) {
                    { id -> editId = id; editor = true }
                } else null)
            }
        }
    }
}

@Composable
internal fun WeekRows(week: JSONObject, language: String, edit: ((String) -> Unit)? = null) {
    val days = week.getJSONArray("days").tableRows()
    val lessons = week.getJSONArray("slots").tableRows()
    val formatter = DateTimeFormatter.ofPattern("EEEE, d MMMM",Locale.forLanguageTag(language))
    if (lessons.isEmpty()) Text(stringResource(R.string.timetable_empty))
    days.forEach { day ->
        val date = day.getString("date")
        HorizontalDivider()
        Text(LocalDate.parse(date).format(formatter),style=MaterialTheme.typography.titleLarge)
        if (!day.getBoolean("teaching")) Text(stringResource(R.string.timetable_closed))
        lessons.filter { it.getString("date") == date }.forEach { row ->
            val suffix = if (language == "de") "De" else "Ar"
            val hours = "${formatMinutes(row.getInt("start"))} – ${formatMinutes(row.getInt("end"))}"
            Text(isolate(hours),style=MaterialTheme.typography.bodySmall)
            Text(isolate(row.getString("subjectName$suffix")),style=MaterialTheme.typography.titleMedium)
            Text(listOf(row.getString("className$suffix"),row.getString("roomCode"),row.getString("teacherName"))
                .joinToString(" · ", transform = ::isolate))
            if (row.getBoolean("substitute")) Text(stringResource(R.string.timetable_substitute))
            if (day.getBoolean("teaching") && !row.getBoolean("teaching")) Text(stringResource(R.string.timetable_closed))
            if (edit != null) TextButton(onClick={edit(row.getString("id"))}) { Text(stringResource(R.string.timetable_edit)) }
        }
    }
}

@Composable
internal fun <T> scheduleRead(path: String?,refresh: Int,fetch: suspend (String) -> T): AsyncState<T> {
    var retry by remember(path) { mutableStateOf(0) }
    var state by remember(path,refresh) { mutableStateOf<AsyncState<T>>(AsyncState.InitialLoading()) }
    LaunchedEffect(path,refresh,retry) {
        if (path != null) {
            state = AsyncState.InitialLoading()
            state = loadAccountSurface({ retry++ }) { fetch(path) }
        }
    }
    return state
}

internal suspend fun IdentityViewModel.timetableObject(path: String) =
    decodeData(schoolRequest(path)) { it as JSONObject }.data
internal fun JSONArray.tableRows() = List(length(),::getJSONObject)
internal fun timetableDate(value: String) = value.length == 10 && runCatching { LocalDate.parse(value) }.isSuccess
internal fun formatMinutes(value: Int) = String.format(Locale.ROOT,"%02d:%02d",value / 60,value % 60)
internal fun timetableDay(day: Int,language: String) = DayOfWeek.of(day).getDisplayName(TextStyle.FULL,Locale.forLanguageTag(language))
