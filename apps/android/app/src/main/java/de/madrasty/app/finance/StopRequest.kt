package de.madrasty.app.finance

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
    var saved by remember { mutableStateOf<String?>(null) }
    val attempts = remember { mutableMapOf<String, Pair<String, String>>() }
    val begins = nextStopMonth(todayMonth)
    val ends = begins?.let(::nextStopMonth)
    val chosen = student
    val confirmation = saved
    if (confirmation != null) {
        Text(stringResource(R.string.stop_approved))
        TextButton(onClick = { open(confirmation) }) { Text(stringResource(R.string.stop_open_request)) }
        TextButton(onClick = { saved = null }) { Text(stringResource(R.string.stop_new_request)) }
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
    if (begins != null && ends != null) {
        StopMonths(todayMonth, begins, ends)
        Text(stringResource(R.string.stop_next_month_only))
    }
    Submit(chosen != null && begins != null && ends != null, R.string.stop_submit, success = null) {
        val proposal = JSONObject().put("studentId", chosen).put("lastAttendanceMonth", todayMonth)
            .put("duration", "one_month").put("reason", "Teilnahmepause")
        val result = model.schoolCommand(attempts, "/enrollment-stops", "POST", proposal)
        saved = result.getString("id")
        updated()
    }
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
