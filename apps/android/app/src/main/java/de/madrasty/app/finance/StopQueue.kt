package de.madrasty.app.finance

import androidx.compose.foundation.layout.FlowRow
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.res.stringResource
import de.madrasty.app.R
import de.madrasty.app.academics.academicPages
import de.madrasty.app.academics.academicRead
import de.madrasty.app.academics.string
import de.madrasty.app.identity.HttpFailure
import de.madrasty.app.identity.IdentityViewModel
import de.madrasty.app.school.Field
import de.madrasty.app.school.Submit
import de.madrasty.app.school.schoolCommand
import de.madrasty.app.ui.AsyncSurface
import de.madrasty.app.ui.ConfirmedAt
import de.madrasty.app.ui.isolate
import org.json.JSONObject

@Composable
internal fun StopQueue(model: IdentityViewModel, id: String?, student: String?, staff: Boolean, open: (String) -> Unit, close: () -> Unit) {
    var refresh by remember { mutableIntStateOf(0) }
    var notice by remember { mutableStateOf<Int?>(null) }
    FinancePage(if (staff) R.string.stop_staff_queue else R.string.stop_title, close) {
        notice?.let { Text(stringResource(it)) }
        if (id == null) {
            if (!staff) StopRequest(model, student, open) { refresh++ }
            StopRows(model, student, staff, refresh, open)
        } else {
            val detail = academicRead("/enrollment-stops/$id", refresh + model.attendanceNetworkRevision) { model.financeObject(it) }
            AsyncSurface(detail) { item ->
                StopDetail(item)
                key(item.getInt("revision"), refresh) {
                    StopDecision(model, item) { message -> notice = message; refresh++ }
                }
            }
        }
    }
}

@Composable
private fun StopRows(model: IdentityViewModel, student: String?, staff: Boolean, refresh: Int, open: (String) -> Unit) {
    var state by remember(staff) { mutableStateOf("") }
    HorizontalDivider()
    FlowRow {
        FilterChip(state.isEmpty(), { state = "" }, label = { Text(stringResource(R.string.fee_all_states)) })
        for ((key, label) in stopStates) FilterChip(state == key, { state = key }, label = { Text(stringResource(label)) })
    }
    val filtered = (student?.let { "&studentId=$it" }.orEmpty()) + (state.takeIf { it.isNotEmpty() }?.let { "&status=$it" }.orEmpty())
    academicPages(model, "/enrollment-stops?limit=25$filtered", refresh + model.attendanceNetworkRevision) { rows ->
        for (one in rows) {
            HorizontalDivider()
            TextButton(onClick = { open(one.getString("id")) }) { Text(pupilFinanceLabel(one)) }
            Text(stringResource(stopStates.getValue(one.getString("state"))) + " · " + isolate(one.getString("startMonth")))
        }
    }
}

@Composable
private fun StopDetail(item: JSONObject) {
    Text(pupilFinanceLabel(item), style = MaterialTheme.typography.titleLarge)
    Text(stringResource(stopStates.getValue(item.getString("state"))))
    StopMonths(item.getString("lastAttendanceMonth"), item.getString("startMonth"), item.string("endMonthExclusive"))
    Text(stringResource(R.string.stop_reason) + " · " + isolate(item.getString("reason")))
    item.string("note")?.let { Text(stringResource(R.string.stop_note) + " · " + isolate(it)) }
    ConfirmedAt(item.string("resolvedAt") ?: item.getString("createdAt"))
}

@Composable
private fun StopDecision(model: IdentityViewModel, item: JSONObject, updated: (Int) -> Unit) {
    val attempts = remember { mutableMapOf<String, Pair<String, String>>() }
    var operation by remember { mutableStateOf<String?>(null) }
    var note by remember { mutableStateOf("") }
    val choice = operation
    if (choice == null) {
        if (item.getBoolean("canWithdraw")) TextButton(onClick = { operation = "withdraw" }) { Text(stringResource(R.string.stop_withdraw)) }
        if (item.getBoolean("canDecide")) {
            TextButton(onClick = { operation = "approve" }) { Text(stringResource(R.string.stop_approve)) }
            TextButton(onClick = { operation = "reject" }) { Text(stringResource(R.string.stop_reject)) }
        }
        return
    }
    Text(stringResource(when (choice) {
        "withdraw" -> R.string.stop_withdraw
        "approve" -> R.string.stop_approve
        else -> R.string.stop_reject
    }), style = MaterialTheme.typography.titleMedium)
    val withdraw = choice == "withdraw"
    if (!withdraw) Field(R.string.stop_note, note) { note = it.take(800) }
    TextButton(onClick = { operation = null }) { Text(stringResource(R.string.fee_edit)) }
    Submit(true, R.string.receipt_confirm, success = null) {
        val path = "/enrollment-stops/${item.getString("id")}"
        val payload = JSONObject().put("revision", item.getInt("revision"))
        if (withdraw) payload.put("action", "withdraw")
        else {
            payload.put("decision", choice)
            if (note.isNotBlank()) payload.put("note", note.trim())
        }
        try {
            val result = model.schoolCommand(attempts, if (withdraw) path else "$path/decision", if (withdraw) "PATCH" else "POST", payload)
            updated(stopStates.getValue(result.getString("state")))
        } catch (error: HttpFailure) {
            if (error.status != 409) throw error
            updated(R.string.stop_stale)
        }
    }
}

private val stopStates = mapOf("pending" to R.string.stop_pending, "withdrawn" to R.string.stop_withdrawn,
    "approved" to R.string.stop_approved, "rejected" to R.string.stop_rejected)
