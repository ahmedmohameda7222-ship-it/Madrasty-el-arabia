package de.madrasty.app.identity

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import de.madrasty.app.R
import de.madrasty.app.api.decodeData
import de.madrasty.app.ui.Persona
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant

private data class AccessTarget(val id: String, val email: String)
private data class AccessGrant(val key: String, val start: String, val end: String) {
    fun json() = JSONObject().put("key", key).put("validFrom", Instant.parse(start).toString())
        .put("validUntil", end.takeIf { it.isNotBlank() }?.let { Instant.parse(it).toString() } ?: JSONObject.NULL)
}

private data class AccessSummary(
    val revision: Int, val personas: Set<String>, val caps: List<AccessGrant>,
    val inboxes: List<AccessGrant>, val verified: Boolean,
) {
    fun json() = JSONObject().put("revision", revision).put("personas", JSONArray(personas.toList()))
        .put("capabilities", JSONArray(caps.map(AccessGrant::json)))
        .put("inboxAssignments", JSONArray(inboxes.map(AccessGrant::json)))

    companion object {
        fun parse(body: String) = decodeData(body) { payload ->
            val data = payload as JSONObject
            fun read(key: String) = data.getJSONArray(key).objects().map {
                AccessGrant(it.getString("key"), it.getString("validFrom"),
                    if (it.isNull("validUntil")) "" else it.getString("validUntil"))
            }
            val personas = data.getJSONArray("personas")
            AccessSummary(
                data.getInt("revision"), (0 until personas.length()).map(personas::getString).toSet(),
                read("capabilities"), read("inboxAssignments"), data.getBoolean("verifiedMfa"),
            )
        }.data
    }
}

private val capabilities = mapOf(
    "access.manage" to R.string.permission_access_manage,
    "school.manage" to R.string.permission_school_manage,
    "students.manage" to R.string.permission_students_manage,
    "staff.invite" to R.string.permission_staff_invite,
    "attendance.supervise" to R.string.permission_attendance_supervise,
    "academics.supervise" to R.string.permission_academics_supervise,
    "comms.publish" to R.string.permission_comms_publish,
    "finance.read" to R.string.permission_finance_read,
    "finance.issue" to R.string.permission_finance_issue,
    "finance.post" to R.string.permission_finance_post,
    "finance.export" to R.string.permission_finance_export,
    "bank.configure" to R.string.permission_bank_configure,
    "audit.read" to R.string.permission_audit_read,
)
private val inboxes = mapOf(
    "student_affairs" to R.string.permission_student_affairs,
    "accounts" to R.string.permission_accounts,
)

@Composable
fun StaffAccessScreen(model: IdentityViewModel, session: SchoolSession, close: () -> Unit) {
    val coroutine = rememberCoroutineScope()
    var targets by remember { mutableStateOf(emptyList<AccessTarget>()) }
    var cursor by remember { mutableStateOf<String?>(null) }
    var target by remember { mutableStateOf<String?>(null) }
    var edit by remember { mutableStateOf<AccessSummary?>(null) }
    var pending by remember { mutableStateOf(false) }
    var status by remember { mutableStateOf<Int?>(null) }
    var deactivate by remember { mutableStateOf<String?>(null) }
    var reason by remember { mutableStateOf("") }

    suspend fun action(run: suspend () -> Unit) {
        pending = true
        status = null
        try { run() } catch (error: CancellationException) { throw error }
        catch (error: Exception) {
            status = when {
                error is HttpFailure && error.status == 403 -> R.string.access_reauth
                error is HttpFailure && error.status == 409 -> R.string.conflict
                else -> R.string.generic_error
            }
        } finally { pending = false }
    }

    suspend fun list(after: String?) {
        val result = model.schoolRequest("/staff/access-targets" + (after?.let { "?cursor=$it" } ?: ""))
        val page = decodeData(result) { (it as JSONArray).objects().map { row ->
            val id = row.getString("accountId")
            AccessTarget(id, if (row.isNull("email")) id else row.getString("email"))
        } }
        targets = if (after == null) page.data else targets + page.data
        cursor = page.nextCursor
    }

    LaunchedEffect(Unit) { action { list(null) } }

    Column(
        Modifier.fillMaxSize().safeDrawingPadding().imePadding().verticalScroll(rememberScrollState()).padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        TextButton(onClick = close) { Text(stringResource(R.string.back)) }
        Text(stringResource(R.string.staff_access), Modifier.semantics { heading() }, style = MaterialTheme.typography.headlineMedium)
        Text(stringResource(R.string.choose_staff))
        targets.forEach { person -> TextButton(enabled = !pending, onClick = {
            target = person.id
            edit = null
            coroutine.launch { action { edit = AccessSummary.parse(model.schoolRequest("/staff/${person.id}/grants")) } }
        }) { Text("\u2066${person.email}\u2069") } }
        cursor?.let { after -> TextButton(enabled = !pending, onClick = { coroutine.launch { action { list(after) } } }) {
            Text(stringResource(R.string.staff_more))
        } }
        if (targets.isEmpty() && status != null) {
            TextButton(enabled = !pending, onClick = { coroutine.launch { action { list(null) } } }) { Text(stringResource(R.string.retry)) }
        }

        val draft = edit
        val id = target
        if (draft != null && id != null) {
            val editable = !pending && id != session.actor.accountId
            HorizontalDivider()
            Text(stringResource(if (draft.verified) R.string.mfa_enabled else R.string.mfa_disabled))
            Text(stringResource(R.string.access_roles), style = MaterialTheme.typography.titleLarge)
            Persona.entries.forEach { persona ->
                val role = persona.name.lowercase()
                val checked = role in draft.personas
                val label = when (persona) {
                    Persona.Admin -> R.string.persona_admin
                    Persona.Teacher -> R.string.persona_teacher
                    Persona.Guardian -> R.string.persona_guardian
                }
                EditableCheck(label, checked, editable && persona != Persona.Guardian) {
                    edit = if (persona == Persona.Admin && checked) {
                        draft.copy(personas = draft.personas - role, caps = emptyList(), inboxes = emptyList())
                    } else draft.copy(personas = if (checked) draft.personas - role else draft.personas + role)
                }
            }
            if ("admin" in draft.personas) {
                EditableGrants(R.string.access_permissions, capabilities, draft.caps, editable, draft.verified) {
                    edit = draft.copy(caps = it)
                }
                EditableGrants(R.string.access_inboxes, inboxes, draft.inboxes, editable, draft.verified) {
                    edit = draft.copy(inboxes = it)
                }
            }
            Text(stringResource(R.string.access_reauth), style = MaterialTheme.typography.bodySmall)
            Button(enabled = editable, onClick = { coroutine.launch {
                action {
                    edit = AccessSummary.parse(model.schoolRequest("/staff/$id/grants", draft.json(), "PATCH"))
                    status = R.string.accesschanged
                }
            } }) { Text(stringResource(R.string.access_save)) }
            TextButton(enabled = editable, onClick = { reason = ""; deactivate = "staff" }) { Text(stringResource(R.string.staff_suspend)) }
            TextButton(enabled = editable, onClick = { reason = ""; deactivate = "account" }) { Text(stringResource(R.string.account_suspend)) }
        }

        if (pending) Text(stringResource(R.string.loading), Modifier.semantics { liveRegion = LiveRegionMode.Polite })
        status?.let { Text(stringResource(it), Modifier.semantics { liveRegion = LiveRegionMode.Polite }) }
        val scope = deactivate
        if (scope != null && draft != null && id != null) {
            AlertDialog(
                title = { Text(stringResource(if (scope == "staff") R.string.staff_suspend else R.string.account_suspend)) },
                text = { Column {
                    if (scope == "staff") Text(stringResource(R.string.suspendfamily))
                    OutlinedTextField(reason, { reason = it }, label = { Text(stringResource(R.string.suspend_reason)) })
                } },
                onDismissRequest = { deactivate = null },
                confirmButton = { TextButton(enabled = reason.trim().length in 4..400 && !pending, onClick = {
                    deactivate = null
                    coroutine.launch { action {
                        model.schoolRequest("/staff/$id/deactivate", JSONObject().put("scope", scope)
                            .put("reason", reason).put("revision", draft.revision), "POST")
                        edit = null
                        target = null
                        status = R.string.accesschanged
                    } }
                }) { Text(stringResource(R.string.suspendconfirm)) } },
                dismissButton = { TextButton(onClick = { deactivate = null }) { Text(stringResource(R.string.cancel)) } },
            )
        }
    }
}

@Composable
private fun EditableCheck(label: Int, checked: Boolean, editable: Boolean, onToggle: () -> Unit) {
    Row(Modifier.fillMaxWidth().heightIn(min = 48.dp)
        .toggleable(checked, enabled = editable, role = Role.Checkbox, onValueChange = { onToggle() }),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Checkbox(checked = checked, onCheckedChange = null, enabled = editable)
        Text(stringResource(label))
    }
}

@Composable
private fun EditableGrants(
    heading: Int, labels: Map<String, Int>, grants: List<AccessGrant>, editable: Boolean, verified: Boolean,
    onChange: (List<AccessGrant>) -> Unit,
) {
    Text(stringResource(heading), style = MaterialTheme.typography.titleLarge)
    labels.forEach { (key, label) ->
        val current = grants.find { it.key == key }
        EditableCheck(label, current != null, editable && (key != "access.manage" || verified || current != null)) {
            onChange(if (current == null) grants + AccessGrant(key, Instant.now().toString(), "") else grants - current)
        }
        if (current != null && key != "access.manage") {
            OutlinedTextField(current.start, { value -> onChange(grants.map { if (it == current) it.copy(start = value) else it }) },
                enabled = editable, singleLine = true, label = { Text(stringResource(R.string.access_start)) })
            OutlinedTextField(current.end, { value -> onChange(grants.map { if (it == current) it.copy(end = value) else it }) },
                enabled = editable, singleLine = true, label = { Text(stringResource(R.string.access_end)) })
        }
    }
}

private fun JSONArray.objects() = List(length(), ::getJSONObject)
