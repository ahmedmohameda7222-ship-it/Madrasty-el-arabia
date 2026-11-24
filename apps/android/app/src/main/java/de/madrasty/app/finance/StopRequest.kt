package de.madrasty.app.finance

import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.res.stringResource
import de.madrasty.app.R
import de.madrasty.app.academics.academicPages
import de.madrasty.app.academics.academicRead
import de.madrasty.app.identity.IdentityViewModel
import de.madrasty.app.school.Field
import de.madrasty.app.school.Submit
import de.madrasty.app.school.schoolCommand
import de.madrasty.app.ui.AsyncSurface
import de.madrasty.app.ui.isolate
import org.json.JSONObject
import java.time.YearMonth

@Composable
internal fun StopRequest(model: IdentityViewModel, student: String?, open: (String) -> Unit, updated: () -> Unit) {
    val options = academicRead("/enrollment-stops/options", 0) { model.financeObject(it) }
    Text(stringResource(R.string.stop_new_request), style = MaterialTheme.typography.titleLarge)
    AsyncSurface(options) {
        RequestForm(model, student, it.getString("schoolMonth"), open, updated)
    }
}

@Composable
private fun RequestForm(model: IdentityViewModel, initial: String?, todayMonth: String, open: (String) -> Unit, updated: () -> Unit) {
    var student by remember(initial) { mutableStateOf(initial) }
    var last by remember(todayMonth) { mutableStateOf(todayMonth) }
    var temporary by remember { mutableStateOf(true) }
    var reason by remember { mutableStateOf("") }
    var review by remember { mutableStateOf<JSONObject?>(null) }
    var saved by remember { mutableStateOf<String?>(null) }
    val attempts = remember { mutableMapOf<String, Pair<String, String>>() }
    val begins = nextStopMonth(last)
    val ends = begins?.let(::nextStopMonth).takeIf { temporary }
    val chosen = student
    val proposal = review
    val confirmation = saved
    if (confirmation != null) {
        Text(stringResource(R.string.stop_approved))
        TextButton(onClick = { open(confirmation) }) { Text(stringResource(R.string.stop_open_request)) }
        TextButton(onClick = { saved = null }) { Text(stringResource(R.string.stop_new_request)) }
        return
    }

    if (proposal != null && chosen != null && begins != null) {
        val child = academicRead("/me/children/$chosen", 0) { model.financeObject(it) }
        AsyncSurface(child) { item ->
            Text(isolate(item.getString("displayName")) + " · " + isolate(item.getString("studentNumber")))
            StopMonths(last, begins, ends)
            Text(stringResource(R.string.stop_reason) + " · " + isolate(reason.trim()))
            TextButton(onClick = { review = null }) { Text(stringResource(R.string.fee_edit)) }
            Submit(true, R.string.stop_submit, success = null) {
                val result = model.schoolCommand(attempts, "/enrollment-stops", "POST", proposal)
                saved = result.getString("id")
                reason = ""
                review = null
                updated()
            }
        }
        return
    }
    Text(stringResource(R.string.stop_child))
    academicPages(model, "/me/children?limit=50", 0) { pupils ->
        for (child in pupils) {
            val id = child.getString("id")
            FilterChip(id == chosen, { student = id }, label = {
                Text(isolate(child.getString("displayName")) + " · " + isolate(child.getString("studentNumber")))
            })
        }
    }
    Field(R.string.stop_last, last) { last = financeDigits(it).take(7) }
    FilterChip(temporary, { temporary = true }, label = { Text(stringResource(R.string.stop_one_month)) })
    FilterChip(!temporary, { temporary = false }, label = { Text(stringResource(R.string.stop_indefinite)) })
    Field(R.string.stop_reason, reason) { reason = it.take(800) }
    Button(enabled = chosen != null && begins != null && last >= todayMonth && (!temporary || ends != null) ,
        onClick = {
            review = JSONObject().put("studentId", chosen).put("lastAttendanceMonth", last)
                .put("duration", if (temporary) "one_month" else "indefinite").put("reason", reason.trim().ifBlank { "Teilnahmepause" })
        }
    ) { Text(stringResource(R.string.fee_preview)) }
}

private fun nextStopMonth(month: String): String? =
    if (validBillingMonth(month)) YearMonth.parse(month).plusMonths(1).takeIf { it.year <= 9999 }?.toString() else null

@Composable
internal fun StopMonths(last: String, start: String, end: String?) {
    Text(stringResource(R.string.stop_last) + " · " + isolate(last))
    Text(stringResource(R.string.stop_start) + " · " + isolate(start))
    if (end == null) Text(stringResource(R.string.stop_indefinite))
    else Text(stringResource(R.string.stop_end) + " · " + isolate(end))
}
