package de.madrasty.app.finance

import androidx.compose.foundation.layout.Row
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import de.madrasty.app.R
import de.madrasty.app.academics.academicRead
import de.madrasty.app.academics.string
import de.madrasty.app.identity.HttpFailure
import de.madrasty.app.identity.IdentityViewModel
import de.madrasty.app.school.Field
import de.madrasty.app.school.Submit
import de.madrasty.app.school.schoolCommand
import de.madrasty.app.ui.AsyncSurface
import de.madrasty.app.ui.isolate
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

@Composable
internal fun IssueInvoices(
    model: IdentityViewModel, initialStudent: String?, configureBank: (() -> Unit)?, feeSettings: (String?) -> Unit,
    invoice: (String?, String?) -> Unit, close: () -> Unit,
) {
    val context = academicRead("/finance/billing-options", 0) { model.financeObject(it) }
    FinancePage(R.string.fee_issue, close) {
        TextButton(onClick = { feeSettings(null) }) { Text(stringResource(R.string.fee_settings)) }
        TextButton(onClick = { invoice(null, null) }) { Text(stringResource(R.string.fee_invoices)) }
        AsyncSurface(context) { settings ->
            InvoiceIssueForm(model, settings, initialStudent, configureBank, feeSettings, invoice)
        }
    }
}

@Composable
private fun InvoiceIssueForm(
    model: IdentityViewModel, initial: JSONObject, initialStudent: String?, configureBank: (() -> Unit)?,
    feeSettings: (String?) -> Unit, invoice: (String?, String?) -> Unit,
) {
    val firstMonth = initial.getString("period")
    var month by remember(firstMonth) { mutableStateOf(firstMonth) }
    var manual by remember { mutableStateOf(false) }
    var explicit by remember(initialStudent) { mutableStateOf(initialStudent != null) }
    var missing by remember { mutableStateOf(true) }
    var selected by remember(initialStudent) { mutableStateOf(listOfNotNull(initialStudent)) }
    var classId by remember { mutableStateOf<String?>(null) }
    var dueDate by remember { mutableStateOf("") }
    var source by remember { mutableStateOf<String?>(null) }
    var lines by remember { mutableStateOf(listOf(DraftFeeLine())) }
    var preview by remember { mutableStateOf<JSONObject?>(null) }
    var receipt by remember { mutableStateOf<Pair<String, JSONObject>?>(null) }
    var refresh by remember { mutableIntStateOf(0) }
    var stale by remember { mutableStateOf(false) }
    val attempts = remember { mutableMapOf<String, Pair<String, String>>() }
    val validMonth = validBillingMonth(month)
    val prepared = preview
    receipt?.let { (period, result) ->
        val ids = result.getJSONArray("issuedIds")
        Text(stringResource(
            R.string.fee_batch_result, ids.length(), result.getJSONArray("existingIds").length(), result.getJSONArray("skipped").length(),
        ))
        TextButton(onClick = { if (ids.length() == 1) invoice(ids.getString(0), null) else invoice(null, period) }) {
            Text(stringResource(R.string.fee_invoices))
        }
    }
    if (stale) Text(stringResource(R.string.fee_stale))
    if (prepared != null) {
        InvoiceIssueReview(prepared, feeSettings, invoice)
        TextButton(onClick = { preview = null }) { Text(stringResource(R.string.fee_edit)) }
        val eligible = prepared.financeRows("rows").any { it.getString("outcome") == "ready" }
        Submit(eligible, R.string.fee_confirm, success = null) {
            val input = JSONObject().put("previewId", prepared.getString("previewId")).put("revision", prepared.getInt("revision"))
            try {
                val result = model.schoolCommand(attempts, "/finance/invoice-batches", "POST", input)
                receipt = prepared.getString("period") to result
                preview = null
                if (manual) {
                    source = null
                    lines = listOf(DraftFeeLine())
                }
                refresh++
            } catch (error: HttpFailure) {
                if (error.status != 409) throw error
                preview = null
                stale = true
                refresh++
            }
        }
        return
    }
    Field(R.string.fee_month, month) {
        month = financeDigits(it).take(7)
        classId = null
        selected = emptyList()
    }
    Row {
        FilterChip(!manual, { manual = false; selected = listOfNotNull(initialStudent) }, label = {
            Text(stringResource(R.string.fee_monthly))
        })
        FilterChip(manual, { manual = true; explicit = true; selected = listOfNotNull(initialStudent) }, label = {
            Text(stringResource(R.string.fee_manual))
        })
    }
    Field(R.string.fee_due, dueDate) { dueDate = financeDigits(it).take(10) }
    if (!validMonth) return
    val options = academicRead("/finance/billing-options?period=$month", refresh) { model.financeObject(it) }
    AsyncSurface(options) { settings ->
        if (!settings.getBoolean("bankReady")) {
            Text(stringResource(R.string.finance_bank_empty))
            configureBank?.let { TextButton(onClick = it) { Text(stringResource(R.string.finance_bank)) } }
        }
        InvoiceClassFilter(settings.financeRows("classes"), classId) { classId = it; selected = emptyList() }
        if (!manual) FilterChip(explicit, { explicit = !explicit }, label = { Text(stringResource(R.string.fee_pick_pupils)) })
        if (explicit) {
            if (!manual) FilterChip(missing, { missing = !missing }, label = { Text(stringResource(R.string.fee_missing)) })
            Text(stringResource(R.string.fee_selected, selected.size))
            if (selected.isNotEmpty()) TextButton(onClick = { selected = emptyList() }) { Text(stringResource(R.string.clear_filter)) }
            PupilFinancePicker(model, month, classId, !manual && missing, refresh) { pupil ->
                val id = pupil.getString("id")
                FilterChip(id in selected, {
                    selected = when {
                        id in selected -> selected - id
                        manual -> listOf(id)
                        selected.size < 1000 -> selected + id
                        else -> selected
                    }
                }, label = { Text(pupilFinanceLabel(pupil)) })
            }
        }
        val currency = settings.string("currency")
        if (manual) FeeLineFields(lines, { lines = it }, currency)
        val manualLines = if (manual) feeLineInput(lines, currency) else null
        val ready = (!explicit || selected.isNotEmpty()) && (!manual || selected.size == 1 && manualLines != null) &&
            (dueDate.isEmpty() || validFinanceDate(dueDate))
        Submit(ready, R.string.fee_preview, success = null) {
            val input = JSONObject().put("period", month).put("kind", if (manual) "manual" else "monthly")
            classId?.let { input.put("classId", it) }
            if (dueDate.isNotEmpty()) input.put("dueDate", dueDate)
            if (explicit) input.put("studentIds", JSONArray(selected))
            if (manual) {
                val id = source ?: UUID.randomUUID().toString().also { source = it }
                input.put("chargeSourceId", id).put("lineItems", manualLines)
            }
            stale = false
            receipt = null
            preview = model.financeObject("/finance/invoice-previews", input)
        }
    }
}

@Composable
private fun InvoiceClassFilter(classes: List<JSONObject>, classId: String?, change: (String?) -> Unit) {
    if (classes.isEmpty()) return
    Text(stringResource(R.string.fee_classes), style = MaterialTheme.typography.titleMedium)
    FilterChip(classId == null, { change(null) }, label = { Text(stringResource(R.string.fee_all_classes)) })
    val ar = LocalConfiguration.current.locales[0].language == "ar"
    for (item in classes) {
        val id = item.getString("id")
        FilterChip(classId == id, { change(id) }, label = {
            Text(isolate(item.getString("code")) + " · " + isolate(item.getString(if (ar) "nameAr" else "nameDe")))
        })
    }
}

@Composable
private fun InvoiceIssueReview(
    preview: JSONObject, feeSettings: (String?) -> Unit, invoice: (String?, String?) -> Unit,
) {
    Text(stringResource(R.string.fee_preview) + " · " + isolate(preview.getString("period")), style = MaterialTheme.typography.titleLarge)
    val rows = preview.financeRows("rows")
    if (rows.isEmpty()) Text(stringResource(R.string.empty))
    for (row in rows) {
        HorizontalDivider()
        Text(pupilFinanceLabel(row), style = MaterialTheme.typography.titleMedium)
        val outcome = row.getString("outcome")
        Text(stringResource(previewStates[outcome] ?: R.string.generic_error))
        row.string("payerName")?.let { Text(stringResource(R.string.fee_payer) + " · " + isolate(it)) }
        row.string("dueDate")?.let { Text(stringResource(R.string.fee_due) + " · " + isolate(it)) }
        row.string("currency")?.takeIf { row.getJSONArray("lines").length() > 0 }?.let { currency ->
            FeeLineSummary(row.financeRows("lines"), currency)
            Text(stringResource(R.string.fee_total) + " · " + financeMoney(row.getLong("totalMinor"), currency))
        }
        if (outcome in setOf("payer_missing", "payer_inactive")) {
            TextButton(onClick = { feeSettings(row.getString("studentId")) }) { Text(stringResource(R.string.fee_payer)) }
        }
        if (outcome == "tariff_missing") {
            TextButton(onClick = { feeSettings(null) }) { Text(stringResource(R.string.fee_tariffs)) }
        }
        row.string("existingId")?.let { id ->
            TextButton(onClick = { invoice(id, null) }) { Text(stringResource(R.string.fee_open_invoice)) }
        }
    }
}

private val previewStates = mapOf(
    "ready" to R.string.fee_ready, "existing" to R.string.fee_existing, "stopped" to R.string.fee_stopped,
    "not_enrolled" to R.string.fee_not_enrolled, "payer_missing" to R.string.fee_payer_missing,
    "payer_inactive" to R.string.fee_payer_inactive, "bank_missing" to R.string.finance_bank_empty,
    "tariff_missing" to R.string.fee_tariff_missing, "currency_mismatch" to R.string.fee_currency_mismatch,
    "monthly_charge" to R.string.fee_duplicate_charge,
)
