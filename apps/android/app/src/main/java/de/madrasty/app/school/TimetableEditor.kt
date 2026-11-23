package de.madrasty.app.school

import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.res.stringResource
import de.madrasty.app.R
import de.madrasty.app.api.decodeData
import de.madrasty.app.identity.IdentityViewModel
import de.madrasty.app.ui.AsyncState
import de.madrasty.app.ui.AsyncSurface
import de.madrasty.app.ui.isolate
import org.json.JSONArray
import org.json.JSONObject

private data class Draft(val classId: String, val title: String, val data: JSONObject)
private val fields = mapOf(
    "assignmentId" to R.string.timetable_assignment,
    "staffId" to R.string.staff_role_teacher, "classId" to R.string.choose_class,
    "roomId" to R.string.timetable_room, "weekday" to R.string.timetable_weekday,
    "start" to R.string.timetable_start, "end" to R.string.timetable_end,
    "from" to R.string.timetable_from, "untilExclusive" to R.string.timetable_until,
)
private val messages = mapOf("unavailable" to R.string.timetable_unavailable, "interval" to R.string.timetable_interval,
    "clash" to R.string.timetable_clash)

@Composable
internal fun TimetableEditor(
    model: IdentityViewModel,
    language: String,
    initial: JSONObject?,
    occurrenceDate: String?,
    initialClass: String?,
    initialYear: String?,
    pickClass: (String) -> Unit,
    saved: (String?) -> Unit,
    close: () -> Unit,
) {
    val attempts = remember { mutableMapOf<String, Pair<String, String>>() }
    var yearId by remember { mutableStateOf(initial?.getString("yearId") ?: initialYear.orEmpty()) }
    var classId by remember { mutableStateOf(initial?.getString("classId") ?: initialClass.orEmpty()) }
    var subjectId by remember { mutableStateOf(initial?.optString("subjectId").orEmpty()) }
    var assignmentId by remember { mutableStateOf(initial?.getString("assignmentId").orEmpty()) }
    var roomId by remember { mutableStateOf(initial?.getString("roomId").orEmpty()) }
    var weekdays by remember { mutableStateOf(setOf(initial?.getInt("weekday") ?: 1)) }
    var scope by remember { mutableStateOf("single") }
    var startText by remember { mutableStateOf(initial?.getInt("start")?.let(::formatMinutes).orEmpty()) }
    var endText by remember { mutableStateOf(initial?.getInt("end")?.let(::formatMinutes).orEmpty()) }
    var from by remember { mutableStateOf(initial?.getString("from").orEmpty()) }
    var until by remember { mutableStateOf(initial?.getString("untilExclusive").orEmpty()) }
    var queue by remember { mutableStateOf(emptyList<Draft>()) }
    var review by remember { mutableStateOf<JSONObject?>(null) }
    var roomsOpen by remember { mutableStateOf(false) }
    var roomVersion by remember { mutableStateOf(0) }
    var cancel by remember { mutableStateOf(false) }
    val suffix = if (language == "de") "De" else "Ar"
    val rooms = scheduleRead("/school/rooms",roomVersion,model::records)
    val subjects = scheduleRead("/school/subjects",0,model::records)
    val years = scheduleRead("/school/years",0,model::records)
    val selectedYear = yearId.ifEmpty {
        (years as? AsyncState.Ready)?.content?.firstOrNull { it.getString("state") != "closed" }?.getString("id").orEmpty()
    }
    val classes = scheduleRead(selectedYear.takeIf(String::isNotEmpty)?.let { "/school/classes?yearId=$it&limit=100" },0,model::records)
    val terms = scheduleRead(classId.takeIf(String::isNotEmpty)?.let { "/school/classes/$it/assignments" },0,model::records)
    val candidates=(terms as? AsyncState.Ready)?.content?.filter {
        !it.getBoolean("revoked") && (it.getString("kind") != "subject" ||
            it.optString("subjectId") == subjectId)
    }?.distinctBy { it.getString("staffId") }.orEmpty()
    val term = candidates.find { it.getString("id") == assignmentId }

    fun replaceQueue(value: List<Draft>) { queue = value; review = null }
    fun edit(entry: Draft) {
        val row = entry.data
        classId = entry.classId
        pickClass(classId)
        assignmentId = row.getString("assignmentId")
        roomId = row.getString("roomId")
        weekdays = setOf(row.getInt("weekday"))
        subjectId = row.optString("subjectId")
        startText = formatMinutes(row.getInt("start"))
        endText = formatMinutes(row.getInt("end"))
        from = row.getString("from")
        until = row.getString("untilExclusive")
        replaceQueue(queue - entry)
    }

    HorizontalDivider()
    Text(stringResource(if (initial == null) R.string.timetable_build else R.string.timetable_edit),style = MaterialTheme.typography.titleLarge)
    TextButton(onClick = close) { Text(stringResource(R.string.close)) }
    TextButton(onClick = { roomsOpen = !roomsOpen }) { Text(stringResource(R.string.timetable_rooms)) }
    if (roomsOpen) AsyncSurface(rooms) { records ->
        RoomsEditor(model,attempts,records,language) { room ->
            roomId = room.getString("id")
            roomVersion++
            review = null
        }
    }
    Text(stringResource(R.string.choose_year))
    AsyncSurface(years) { rows ->
        rows.forEach { row ->
            val id = row.getString("id")
            FilterChip(selectedYear == id,enabled = initial == null && row.getString("state") != "closed",onClick = {
                if (yearId != id) {
                    yearId = id; classId = ""; assignmentId = ""; pickClass(""); replaceQueue(emptyList())
                }
            },label = { Text(isolate("${row.getString("startsOn")} – ${row.getString("endsExclusive")}")) })
        }
    }
    if (selectedYear.isNotEmpty()) {
        Text(stringResource(R.string.choose_class))
        AsyncSurface(classes) { rows ->
            rows.forEach { row ->
                val id = row.getString("id")
                FilterChip(id == classId,enabled = initial == null,onClick = {
                    if (classId != id) { classId = id; assignmentId = ""; pickClass(id); review = null }
                },label = { Text(classLabel(row,language)) })
            }
        }
    }
    Text(if (language=="de") "Fach" else "المادة")
    AsyncSurface(subjects) { rows ->
        rows.forEach { item ->
            val id=item.getString("id")
            FilterChip(id==subjectId,onClick={
                if(subjectId!=id){subjectId=id;assignmentId="";review=null}
            },label={Text(isolate(item.getString("name$suffix")))})
        }
    }
    if (classId.isNotEmpty()) {
        Text(stringResource(R.string.timetable_assignment))
        AsyncSurface(terms) { rows ->
            val options=rows.filter { !it.getBoolean("revoked") &&
                (it.getString("kind")!="subject"||it.optString("subjectId")==subjectId) }
                .distinctBy { it.getString("staffId") }
            if (options.isEmpty()) Text(if(language=="de") "Zuerst Lehrkräfte zuordnen." else "اربط المدرسين بالفصل أولًا.")
            options.forEach { row ->
                val id = row.getString("id")
                FilterChip(id == assignmentId,onClick = {
                    assignmentId = id
                    if(initial == null){from = row.getString("from");until = row.getString("untilExclusive")}
                    review = null
                },label = { Text(isolate(row.getString("staffName"))) })
            }
        }
    }
    Text(stringResource(R.string.timetable_room))
    AsyncSurface(rooms) { rows ->
        rows.forEach { row ->
            val id = row.getString("id")
            FilterChip(id == roomId,onClick = { roomId = id },label = {
                Text("${isolate(row.getString("code"))} · ${isolate(row.getString("name$suffix"))}")
            })
        }
    }
    Text(stringResource(R.string.timetable_weekday))
    if(initial != null && occurrenceDate != null){
        Text(isolate(occurrenceDate)+" · "+timetableDay(initial.getInt("weekday"),language))
        FilterChip(scope=="single",onClick={scope="single";replaceQueue(emptyList())},
            label={Text(if(language=="de") "Nur diesen Termin" else "الحصة دي بس")})
        FilterChip(scope=="future",onClick={scope="future";replaceQueue(emptyList())},
            label={Text(if(language=="de") "Alle künftigen Termine dieses Wochentags" else "نفس اليوم في كل الأسابيع الجاية")})
    } else {
        for (day in 1..7) FilterChip(day in weekdays,onClick = {
            weekdays=if(day in weekdays) weekdays-day else weekdays+day
        },label = { Text(timetableDay(day,language)) })
    }
    Field(R.string.timetable_start,startText) { startText = it.take(5) }
    Field(R.string.timetable_end,endText) { endText = it.take(5) }
    if(initial == null) {
        Field(R.string.timetable_from,from) { from = it.take(10) }
        Field(R.string.timetable_until,until) { until = it.take(10) }
    }
    val start = parseTime(startText)
    val end = parseTime(endText)
    val room = (rooms as? AsyncState.Ready)?.content?.find { it.getString("id") == roomId }
    TextButton(enabled = (queue.size+weekdays.size <= 60 || initial != null) && term != null && room != null && subjectId.isNotEmpty() && weekdays.isNotEmpty() &&
        start in 0..1439 && end in 1..1440 && timetableDate(from) && timetableDate(until),onClick = {
        if (term != null && room != null) {
            val drafts=weekdays.sorted().map { day ->
                val rangeStart=if(initial!=null&&occurrenceDate!=null) occurrenceDate else from
                val rangeEnd=if(initial!=null&&occurrenceDate!=null)
                    if(scope=="single") java.time.LocalDate.parse(occurrenceDate).plusDays(1).toString()
                    else initial.getString("untilExclusive")
                    else until
                val record = JSONObject().put("assignmentId",assignmentId).put("subjectId",subjectId)
                    .put("roomId",roomId).put("weekday",day).put("start",start).put("end",end)
                    .put("from",rangeStart).put("untilExclusive",rangeEnd)
                val subjectName=(subjects as? AsyncState.Ready)?.content?.find { it.getString("id")==subjectId }
                    ?.optString("name$suffix").orEmpty()
                Draft(classId,listOf(subjectName,term.getString("staffName"),room.getString("code"))
                    .joinToString(" · ",transform = ::isolate),record)
            }
            replaceQueue(if (initial == null) queue + drafts else drafts)
        }
    }) { Text(stringResource(R.string.timetable_add)) }

    if (queue.isNotEmpty()) {
        Text(stringResource(R.string.timetable_queued),style = MaterialTheme.typography.titleLarge)
        val entries = review?.getJSONArray("entries")?.tableRows()
        queue.forEachIndexed { index,draft ->
            val row = draft.data
            HorizontalDivider()
            Text(draft.title)
            Text(timetableDay(row.getInt("weekday"),language) +
                " · " + isolate("${formatMinutes(row.getInt("start"))} – ${formatMinutes(row.getInt("end"))}"))
            Text(isolate("${row.getString("from")} – ${row.getString("untilExclusive")}"))
            entries?.getOrNull(index)?.getJSONArray("issues")?.tableRows()?.forEach { issue ->
                val field = fields.getValue(issue.getString("field"))
                val message = messages.getValue(issue.getString("kind"))
                Text("${stringResource(field)} · ${stringResource(message)}")
            }
            TextButton(onClick = { edit(draft) }) { Text(stringResource(R.string.timetable_edit)) }
            TextButton(onClick = { replaceQueue(queue - draft) }) { Text(stringResource(R.string.timetable_remove)) }
        }
        Submit(true,R.string.timetable_review,success = null) {
            val options = queue
            val request = JSONObject().put("yearId",selectedYear).put("slots",JSONArray(options.map(Draft::data)))
            if (initial != null) request.put("editingId",initial.getString("id"))
            review = null
            val result = decodeData(model.schoolRequest("/school/timetable/preview",request,"POST")) { it as JSONObject }.data
            if (queue == options) review = result
        }
        review?.let { latest ->
            if (latest.getBoolean("canSave")) {
                Text(stringResource(R.string.timetable_ready))
                Submit(true,R.string.timetable_save) {
                    val checked = latest.getJSONArray("entries").tableRows().map { it.getJSONObject("slot") }
                    if (initial == null) {
                        val input = JSONObject().put("yearId",selectedYear).put("yearRevision",latest.getInt("yearRevision"))
                            .put("slots",JSONArray(checked))
                        model.schoolCommand(attempts,"/school/timetable","POST",input)
                        replaceQueue(emptyList())
                    } else {
                        val input = JSONObject().put("revision",initial.getInt("revision"))
                            .put("yearRevision",latest.getInt("yearRevision")).put("slot",checked.single())
                        if(occurrenceDate!=null) input.put("date",occurrenceDate).put("scope",scope)
                        model.schoolCommand(attempts,"/school/timetable/${initial.getString("id")}","PATCH",input)
                    }
                    saved(checked.first().getString("from"))
                }
            }
        }
    }
    if (initial != null && occurrenceDate != null && !initial.getBoolean("canceled")) {
        TextButton(onClick = { cancel = !cancel }) { Text(stringResource(R.string.timetable_cancel)) }
        if (cancel) Submit(true,R.string.timetable_confirm_cancel) {
            model.schoolCommand(attempts,"/school/timetable/${initial.getString("id")}","PATCH",
                JSONObject().put("revision",initial.getInt("revision")).put("cancel",true)
                    .apply { if(occurrenceDate!=null) put("date",occurrenceDate).put("scope",scope) })
            saved(null)
        }
    }
}

@Composable
private fun RoomsEditor(model: IdentityViewModel, attempts: SchoolCommandAttempts, records: List<JSONObject>, language: String, saved: (JSONObject) -> Unit) {
    var selected by remember { mutableStateOf("") }
    val suffix = if (language == "de") "De" else "Ar"
    FilterChip(selected.isBlank(), onClick = { selected = "" },label = { Text(stringResource(R.string.timetable_new_room)) })
    records.forEach { row ->
        val id = row.getString("id")
        FilterChip(id == selected,onClick = { selected = id },label = {
            Text("${isolate(row.getString("code"))} · ${isolate(row.getString("name$suffix"))}")
        })
    }
    val current = records.find { it.getString("id") == selected }
    key(selected,current?.optInt("revision")) {
        var code by remember { mutableStateOf(current?.getString("code").orEmpty()) }
        var ar by remember { mutableStateOf(current?.getString("nameAr").orEmpty()) }
        var de by remember { mutableStateOf(current?.getString("nameDe").orEmpty()) }
        Field(R.string.timetable_room_code,code) { code = it.take(24) }
        Field(R.string.school_name_ar,ar) { ar = it.take(120) }
        Field(R.string.school_name_de,de) { de = it.take(120) }
        Submit(Regex("[A-Za-z0-9][A-Za-z0-9_-]{0,23}").matches(code.trim()) && ar.isNotBlank() && de.isNotBlank(),
            R.string.timetable_save_room) {
            val body = JSONObject().put("code",code.trim()).put("nameAr",ar.trim()).put("nameDe",de.trim())
            if (current != null) body.put("revision",current.getInt("revision"))
            val room = if (current == null) model.schoolCommand(attempts,"/school/rooms","POST",body)
            else model.schoolCommand(attempts,"/school/rooms/$selected","PATCH",body)
            selected = room.getString("id")
            saved(room)
        }
    }
}

private fun parseTime(text: String): Int {
    if (text == "24:00") return 1440
    val match = Regex("([01][0-9]|2[0-3]):([0-5][0-9])").matchEntire(text) ?: return -1
    return match.groupValues[1].toInt() * 60 + match.groupValues[2].toInt()
}
