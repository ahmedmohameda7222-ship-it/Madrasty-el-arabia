package de.madrasty.app.school

import android.net.Uri
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.AlertDialog
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
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import de.madrasty.app.R
import de.madrasty.app.api.WirePage
import de.madrasty.app.api.decodeData
import de.madrasty.app.identity.HttpFailure
import de.madrasty.app.identity.IdentityViewModel
import de.madrasty.app.ui.AsyncState
import de.madrasty.app.ui.AsyncSurface
import de.madrasty.app.ui.isolate
import kotlinx.coroutines.CancellationException
import org.json.JSONArray
import org.json.JSONObject

private typealias Picker = AsyncState<WirePage<List<JSONObject>>>

@Composable
fun FamiliesScreen(model: IdentityViewModel) {
    var mode by remember { mutableStateOf("students") }
    var target by remember { mutableStateOf<String?>(null) }
    var run by remember { mutableStateOf(0) }
    val requests = remember { mutableMapOf<String, Pair<String, String>>() }
    FilterChip(mode == "students", onClick = { mode = "students"; target = null },
        label = { Text(stringResource(R.string.nav_students)) })
    FilterChip(mode == "guardians", onClick = { mode = "guardians"; target = null },
        label = { Text(stringResource(R.string.families)) })
    key(mode, run) {
        RecordPicker(model, mode) { target = it.getString("id") }
    }
    TextButton(onClick = { target = "new" }) {
        Text(stringResource(if (mode == "students") R.string.add_student else R.string.add_guardian))
    }
    target?.let { id ->
        HorizontalDivider()
        key(mode, id) {
            FamilyRecord(model, mode, id, requests) { updated ->
                target = updated
                run++
            }
        }
    }
}

@Composable
private fun RecordPicker(model: IdentityViewModel, mode: String, select: (JSONObject) -> Unit) {
    var query by remember { mutableStateOf("") }
    var filter by remember { mutableStateOf("") }
    var generation by remember { mutableStateOf(0) }
    var after by remember { mutableStateOf<String?>(null) }
    var currentRows by remember { mutableStateOf(emptyList<JSONObject>()) }
    var state by remember { mutableStateOf<Picker>(AsyncState.InitialLoading()) }
    LaunchedEffect(generation) {
        state = AsyncState.InitialLoading()
        state = try {
            val cursor = after?.let { "&cursor=${Uri.encode(it)}" }.orEmpty()
            val page = listPage(model, "/school/$mode?query=${Uri.encode(filter)}$cursor")
            currentRows = if (after == null) page.data else currentRows + page.data
            AsyncState.Ready(page.copy(data = currentRows))
        } catch (error: CancellationException) { throw error }
        catch (error: HttpFailure) {
            if (error.status in listOf(401, 403)) AsyncState.Forbidden()
            else AsyncState.Error(retry = { generation++ })
        } catch (_: Exception) { AsyncState.Error(retry = { generation++ }) }
    }
    Field(R.string.family_query, query) { query = it }
    TextButton(onClick = { filter = query.trim(); after = null; currentRows = emptyList(); generation++ }) {
        Text(stringResource(R.string.search_family))
    }
    AsyncSurface(state) { page ->
        if (page.data.isEmpty()) Text(stringResource(if (filter.isEmpty()) R.string.empty else R.string.filtered_empty))
        page.data.forEach { row ->
            TextButton(onClick = { select(row) }) {
                Column(Modifier.fillMaxWidth()) {
                    Text(isolate(row.getString("displayName")))
                    if (row.has("studentNumber")) Text("\u2066${row.getString("studentNumber")}\u2069")
                }
            }
        }
        page.nextCursor?.let { cursor -> TextButton(onClick = { after = cursor; generation++ }) {
            Text(stringResource(R.string.staff_more))
        } }
    }
}

@Composable
private fun FamilyRecord(model: IdentityViewModel, mode: String, id: String,
    requests: MutableMap<String, Pair<String, String>>, saved: (String) -> Unit,
) {
    var generation by remember { mutableStateOf(0) }
    var value by remember { mutableStateOf<AsyncState<JSONObject>>(AsyncState.InitialLoading()) }
    val new = id == "new"
    val isStudent = mode == "students"
    val path = if (new) "/school/$mode" else "/school/$mode/$id"
    LaunchedEffect(generation) {
        value = try {
            AsyncState.Ready(if (new) JSONObject() else item(model, path))
        } catch (error: CancellationException) { throw error }
        catch (error: HttpFailure) {
            if (error.status in listOf(401, 403, 404)) AsyncState.Forbidden()
            else AsyncState.Error(retry = { generation++ })
        } catch (_: Exception) { AsyncState.Error(retry = { generation++ }) }
    }
    Text(stringResource(if (isStudent) R.string.student_profile else R.string.guardian_profile),
        Modifier.semantics { heading() }, style = MaterialTheme.typography.titleLarge)
    AsyncSurface(value) { record ->
        key(record.optInt("revision")) {
            ProfileForm(record, isStudent, new) { input ->
                val response = model.schoolCommand(requests, path, if (new) "POST" else "PATCH", input)
                saved(response.getString("id"))
                if (!new) generation++
            }
        }
        if (!new && !isStudent) RelationshipEditor(model, record, requests) { generation++ }
    }
}

@Composable
private fun ProfileForm(record: JSONObject, student: Boolean, new: Boolean, command: suspend (JSONObject) -> Unit) {
    val uiLocale = if (LocalConfiguration.current.locales[0].language == "de") "de" else "ar"
    var name by remember { mutableStateOf(record.optString("displayName")) }
    var state by remember { mutableStateOf(record.optString("state", "active")) }
    var email by remember { mutableStateOf(record.stringOrEmpty("contactEmail")) }
    var phone by remember { mutableStateOf(record.stringOrEmpty("contactPhone")) }
    var locale by remember { mutableStateOf(record.optString("correspondenceLocale", uiLocale)) }

    if (student && !new) Text("${stringResource(R.string.student_number)} · \u2066${record.getString("studentNumber")}\u2069")
    Field(R.string.family_name, name) { name = it }
    if (student && !new) {
        FilterChip(state == "active", { state = "active" }, label = { Text(stringResource(R.string.record_active)) })
        FilterChip(state == "inactive", { state = "inactive" }, label = { Text(stringResource(R.string.record_inactive)) })
    }
    if (!student) {
        Field(R.string.guardian_email, email, editable = !record.optBoolean("linkedAccount")) { email = it }
        if (record.optBoolean("linkedAccount")) Text(stringResource(R.string.activated_email))
        Field(R.string.guardian_phone, phone) { phone = it }
        Text(stringResource(R.string.guardian_locale))
        FilterChip(locale == "ar", { locale = "ar" }, label = { Text("العربية") })
        FilterChip(locale == "de", { locale = "de" }, label = { Text("Deutsch") })
    }
    Submit(enabled = name.trim().length in 1..200 && phone.length <= 48 && email.length <= 254) {
        val input = JSONObject().put("displayName", name.trim())
        if (!new) input.put("revision", record.getInt("revision"))
        if (student && !new) input.put("state", state)
        if (!student) {
            input.put("contactEmail", email.trim().takeIf { it.isNotEmpty() } ?: JSONObject.NULL)
                .put("contactPhone", phone.trim().takeIf { it.isNotEmpty() } ?: JSONObject.NULL)
                .put("correspondenceLocale", locale)
        }
        command(input)
    }
}

@Composable
private fun RelationshipEditor(model: IdentityViewModel, record: JSONObject,
    requests: MutableMap<String, Pair<String, String>>, changed: () -> Unit,
) {
    var picker by remember { mutableStateOf(false) }
    var selected by remember { mutableStateOf<JSONObject?>(null) }
    var dialog by remember { mutableStateOf<Pair<JSONObject, String>?>(null) }
    var reason by remember { mutableStateOf("") }
    var immediate by remember { mutableStateOf(false) }

    Text(stringResource(R.string.family_links), style = MaterialTheme.typography.titleLarge)
    val records = record.getJSONArray("links").objects()
    if (records.isEmpty()) Text(stringResource(R.string.empty))
    records.forEach { value ->
        val state = value.getString("state")
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text("${isolate(value.getString("studentName"))} · \u2066${value.getString("studentNumber")}\u2069")
            Text(stringResource(when (state) { "approved" -> R.string.approved_link; "revoked" -> R.string.revoked_link; else -> R.string.pending_link }))
            if (state == "pending") TextButton(onClick = { reason = ""; dialog = value to "approve" }) {
                Text(stringResource(R.string.approve_link))
            }
            if (state != "revoked") TextButton(onClick = { reason = ""; dialog = value to "revoke" }) {
                Text(stringResource(R.string.revoke_link))
            }
        }
        HorizontalDivider()
    }
    TextButton(onClick = { picker = !picker; selected = null; reason = "" }) {
        Text(stringResource(if (picker) R.string.close else R.string.create_link))
    }
    if (picker) {
        RecordPicker(model, "students") { selected = it; reason = ""; immediate = false }
        val student = selected
        if (student != null) {
            Text(isolate(student.getString("displayName")))
            FilterChip(immediate, onClick = { immediate = !immediate },
                label = { Text(stringResource(R.string.immediate_link)) })
            if (immediate) Field(R.string.link_reason, reason) { reason = it }
            Submit(enabled = !immediate || reason.trim().length in 1..400) {
                val data = JSONObject().put("guardianId", record.getString("id")).put("studentId", student.getString("id"))
                if (immediate) data.put("approvalReason", reason.trim())
                model.schoolCommand(requests, "/school/guardian-links", "POST", data)
                picker = false
                selected = null
                changed()
            }
        }
    }
    val action = dialog
    if (action != null) {
        val (child, operation) = action
        AlertDialog(
            onDismissRequest = { dialog = null },
            title = { Text(stringResource(if (operation == "approve") R.string.approve_link else R.string.revoke_link)) },
            text = { Column {
                Text(isolate(child.getString("studentName")))
                OutlinedTextField(reason, { reason = it }, label = { Text(stringResource(R.string.link_reason)) })
            } },
            confirmButton = { Submit(enabled = reason.trim().length in 1..400) {
                model.schoolCommand(requests, "/school/guardian-links/${child.getString("id")}/$operation",
                    "POST", JSONObject().put("revision", child.getInt("revision")).put("reason", reason.trim()))
                dialog = null
                changed()
            } },
            dismissButton = { TextButton(onClick = { dialog = null }) { Text(stringResource(R.string.cancel)) } },
        )
    }
}

@Composable
fun ChildrenScreen(model: IdentityViewModel) {
    var state by remember { mutableStateOf<Picker>(AsyncState.InitialLoading()) }
    var chosen by remember { mutableStateOf<String?>(null) }
    var selected by remember { mutableStateOf<AsyncState<JSONObject>>(AsyncState.InitialLoading()) }
    var count by remember { mutableStateOf(0) }
    LaunchedEffect(count) {
        state = try { AsyncState.Ready(listPage(model, "/me/children?limit=100")) }
        catch (error: CancellationException) { throw error }
        catch (error: HttpFailure) {
            if (error.status in listOf(401,403,404)) AsyncState.Forbidden() else AsyncState.Error(retry = { count++ })
        } catch (_: Exception) { AsyncState.Error(retry = { count++ }) }
    }
    LaunchedEffect(chosen, count) {
        val id = chosen ?: return@LaunchedEffect
        selected = AsyncState.InitialLoading()
        selected = try { AsyncState.Ready(item(model, "/me/children/$id")) }
        catch (error: CancellationException) { throw error }
        catch (error: HttpFailure) {
            if (error.status in listOf(401,403,404)) AsyncState.Forbidden() else AsyncState.Error(retry = { count++ })
        } catch (_: Exception) { AsyncState.Error(retry = { count++ }) }
    }
    AsyncSurface(state) { records ->
        if (records.data.isEmpty()) Text(stringResource(R.string.empty))
        records.data.forEach { child ->
            val id = child.getString("id")
            FilterChip(chosen == id, onClick = { if (chosen != id) selected = AsyncState.InitialLoading(); chosen = id },
                label = { Text(isolate(child.getString("displayName"))) })
        }
        if (chosen != null && records.data.any { it.getString("id") == chosen }) {
            HorizontalDivider()
            AsyncSurface(selected) { child ->
                Text(isolate(child.getString("displayName")), Modifier.semantics { heading() }, style = MaterialTheme.typography.titleLarge)
                val language = LocalConfiguration.current.locales[0].language
                child.optJSONObject("currentClass")?.let { Text(classLabel(it, language)) }
                Text("${stringResource(R.string.student_number)} · \u2066${child.getString("studentNumber")}\u2069")
            }
        }
    }
}

private suspend fun listPage(model: IdentityViewModel, path: String) =
    decodeData(model.schoolRequest(path)) { (it as JSONArray).objects() }
private suspend fun item(model: IdentityViewModel, path: String) =
    decodeData(model.schoolRequest(path)) { it as JSONObject }.data
private fun JSONArray.objects() = List(length(), ::getJSONObject)
private fun JSONObject.stringOrEmpty(key: String) = if (isNull(key)) "" else optString(key)
