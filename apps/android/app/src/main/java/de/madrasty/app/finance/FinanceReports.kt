package de.madrasty.app.finance

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.FlowRow
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
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import de.madrasty.app.R
import de.madrasty.app.academics.academicPages
import de.madrasty.app.academics.academicRead
import de.madrasty.app.academics.string
import de.madrasty.app.identity.IdentityViewModel
import de.madrasty.app.school.Field
import de.madrasty.app.ui.AsyncSurface
import de.madrasty.app.ui.ConfirmedAt
import de.madrasty.app.ui.isolate
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject

private data class ReportFilters(
    val period: String = "", val classId: String? = null, val student: String? = null,
    val asOf: String = "", val dateFrom: String = "", val dateThrough: String = "", val status: String = "",
) {
    fun query(cutoff: String? = null): String =
        listOf("period" to period, "classId" to classId, "studentId" to student, "asOf" to asOf,
            "receivedFrom" to dateFrom, "receivedThrough" to dateThrough, "status" to status, "cutoff" to cutoff)
            .mapNotNull { (key, value) -> value?.takeIf { it.isNotBlank() }?.let { "$key=${Uri.encode(it)}" } }
            .joinToString("&")

    fun valid(today: String?): Boolean =
        (period.isEmpty() || validBillingMonth(period)) && (asOf.isEmpty() || validFinanceDate(asOf) && (today == null || asOf <= today)) &&
            (dateFrom.isEmpty() || validFinanceDate(dateFrom)) && (dateThrough.isEmpty() || validFinanceDate(dateThrough)) &&
            (dateFrom.isEmpty() || dateThrough.isEmpty() || dateFrom <= dateThrough)
}

@Composable
internal fun FinanceReports(
    model: IdentityViewModel, initialStudent: String?, staff: Boolean,
    openInvoice: (String) -> Unit, openReceipt: (String) -> Unit, openMatching: () -> Unit, close: () -> Unit,
) {
    var draft by remember(initialStudent) { mutableStateOf(ReportFilters(student = initialStudent)) }
    var filters by remember(initialStudent) { mutableStateOf(ReportFilters(student = initialStudent)) }
    var version by remember { mutableIntStateOf(0) }
    var showFilters by remember { mutableStateOf(false) }
    val read = academicRead("/finance/reports/summary?${filters.query()}", version) { model.financeObject(it) }
    FinancePage(R.string.finance_report_title, close) {
        AsyncSurface(read) { data ->
            TextButton(onClick = { showFilters = !showFilters }) { Text(stringResource(R.string.finance_filters)) }
            if (showFilters) {
                ReportForm(draft, { draft = it }, data, staff)
                Button(onClick = { filters = draft; version++; showFilters = false }, enabled = draft.valid(data.getString("schoolDate"))) {
                    Text(stringResource(R.string.finance_report_apply))
                }
            }
            if (filters.student != null) {
                Text(stringResource(R.string.finance_report_selected))
                TextButton(onClick = {
                    filters = filters.copy(student = null)
                    draft = filters
                    version++
                }) { Text(stringResource(R.string.finance_report_all_pupils)) }
            }
            ReportResults(model, data, filters, version, openInvoice, openReceipt, openMatching, focus = { selected ->
                filters = selected
                draft = selected
                version++
            })
        }
    }
}

@Composable
private fun ReportForm(draft: ReportFilters, edit: (ReportFilters) -> Unit, data: JSONObject, staff: Boolean) {
    Field(R.string.finance_report_period, draft.period) { edit(draft.copy(period = financeDigits(it).take(7), classId = null)) }
    val classes = data.financeRows("classes")
    if (staff && classes.isNotEmpty()) {
        Text(stringResource(R.string.finance_report_class))
        val ar = LocalConfiguration.current.locales[0].language == "ar"
        FlowRow {
            FilterChip(draft.classId == null, { edit(draft.copy(classId = null)) }, label = { Text(stringResource(R.string.fee_all_classes)) })
            for (item in classes) {
                val id = item.getString("id")
                FilterChip(draft.classId == id, { edit(draft.copy(classId = id)) }, label = {
                    Text(isolate(item.getString("code")) + " · " + isolate(item.getString(if (ar) "nameAr" else "nameDe")) +
                        " · " + isolate(item.getString("yearStart").take(4)))
                })
            }
        }
    }
    FlowRow {
        FilterChip(draft.status.isEmpty(), { edit(draft.copy(status = "")) }, label = { Text(stringResource(R.string.fee_all_states)) })
        for ((key, label) in reportStatuses) {
            FilterChip(draft.status == key, { edit(draft.copy(status = key)) }, label = { Text(stringResource(label)) })
        }
    }
    Field(R.string.finance_report_asof, draft.asOf) { edit(draft.copy(asOf = financeDigits(it).take(10))) }
    Field(R.string.finance_report_received_from, draft.dateFrom) { edit(draft.copy(dateFrom = financeDigits(it).take(10))) }
    Field(R.string.finance_report_received_through, draft.dateThrough) { edit(draft.copy(dateThrough = financeDigits(it).take(10))) }
}

@Composable
private fun ReportResults(
    model: IdentityViewModel, data: JSONObject, filters: ReportFilters, version: Int, openInvoice: (String) -> Unit,
    openReceipt: (String) -> Unit, openMatching: () -> Unit, focus: (ReportFilters) -> Unit,
) {
    val asOf = data.getString("asOf")
    val cutoff = data.getString("cutoff")
    val query = filters.copy(asOf = asOf).query(cutoff)
    Text(stringResource(R.string.finance_report_asof) + " · " + isolate(asOf))
    ConfirmedAt(cutoff)
    for (total in data.financeRows("totals")) {
        ReportTotals(total, { focus(filters.copy(status = "overdue", asOf = asOf)) }, openMatching)
    }
    if (data.getString("scope") == "staff" && filters.student == null && filters.classId == null) {
        Text(stringResource(R.string.finance_report_school_scope))
    }
    HorizontalDivider()
    Text(stringResource(R.string.finance_report_statement), style = MaterialTheme.typography.titleLarge)
    if (data.getBoolean("canExport")) ExportStatement(model, asOf, query)
    academicPages(model, "/finance/reports/statement?limit=25&$query", version) { rows ->
        for (row in rows) {
            ReportLine(row, openInvoice, openReceipt, if (filters.student == null) ({ id -> focus(filters.copy(student = id)) }) else null)
        }
    }
}

@Composable
private fun ReportTotals(row: JSONObject, overdue: () -> Unit, matching: () -> Unit) {
    HorizontalDivider()
    val currency = row.getString("currency")
    Text(isolate(currency), style = MaterialTheme.typography.titleMedium)
    var showDetails by remember { mutableStateOf(false) }
    val keyFields = setOf("collectibleMinor", "appliedMinor", "outstandingMinor", "overdueMinor")
    for ((field, label) in totalLabels.filterKeys { it in keyFields }) {
        if (!row.isNull(field)) FinanceBalanceCard(stringResource(label), financeMoney(row.getLong(field), currency))
    }
    TextButton(onClick = { showDetails = !showDetails }) { Text(stringResource(R.string.finance_more_details)) }
    if (showDetails) {
        Text(stringResource(R.string.finance_report_invoices, row.getLong("invoiceCount")))
        for ((field, label) in totalLabels.filterKeys { it !in keyFields }) {
            if (!row.isNull(field)) Text(stringResource(label) + " · " + financeMoney(row.getLong(field), currency))
        }
        Text(stringResource(R.string.finance_report_receipts, row.getLong("receiptCount")))
    }
    val late = row.getLong("overdueCount")
    if (late > 0) TextButton(onClick = overdue) { Text(stringResource(R.string.finance_report_late_queue, late)) }
    val unmatched = row.optLong("matchingCount", 0)
    if (unmatched > 0) TextButton(onClick = matching) { Text(stringResource(R.string.finance_report_matching_queue, unmatched)) }
}

@Composable
private fun ReportLine(row: JSONObject, invoice: (String) -> Unit, receipt: (String) -> Unit, focus: ((String) -> Unit)?) {
    HorizontalDivider()
    val currency = row.getString("currency")
    val kind = when (row.getString("kind")) {
        "invoice" -> R.string.finance_report_invoice
        "allocation" -> R.string.receipt_allocate
        "reversal" -> R.string.receipt_unapplied
        "void_receipt" -> R.string.receipt_voided
        "adjustment" -> R.string.finance_report_adjustment
        "refund" -> R.string.finance_report_refund
        else -> R.string.receipt_title
    }
    val state = row.getString("state")
    Text(stringResource(kind) + " · " + financeMoney(row.getLong("amountMinor"), currency), style = MaterialTheme.typography.titleMedium)
    row.string("studentId")?.let { id ->
        val identity = listOfNotNull(row.string("studentName"), row.string("studentNumber"), row.string("classCode"))
            .joinToString(" · ", transform = ::isolate)
        if (focus != null) TextButton(onClick = { focus(id) }) { Text(identity) } else Text(identity)
    }
    val stateLabel = reportStatuses[state] ?: receiptStateLabel(state)
    Text(stringResource(stateLabel) + " · " + stringResource(R.string.finance_report_balance) + " · " + financeMoney(row.getLong("balanceMinor"), currency))
    row.string("invoiceId")?.let { id ->
        TextButton(onClick = { invoice(id) }) { Text(isolate(row.getString("invoiceNumber"))) }
    }
    row.string("receiptId")?.let { id ->
        TextButton(onClick = { receipt(id) }) { Text(isolate(row.getString("receiptNumber"))) }
    }
    row.string("period")?.let { Text(isolate(it)) }
    row.string("receivedDate")?.let { Text(isolate(it)) }
    ConfirmedAt(row.getString("occurredAt"))
}

@Composable
private fun ExportStatement(model: IdentityViewModel, asOf: String, query: String) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val actor = model.session?.actor
    var request by remember(actor) { mutableStateOf<String?>(null) }
    var message by remember(actor) { mutableStateOf<Int?>(null) }
    val create = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("text/csv")) { uri ->
        val path = request
        if (uri == null || path == null || actor == null) {
            request = null
        } else scope.launch {
            try {
                if (model.session?.actor != actor) return@launch
                val contents = model.schoolRequest(path)
                if (model.session?.actor != actor) return@launch
                withContext(Dispatchers.IO) {
                    require(contents.removePrefix("\uFEFF").startsWith("\"row_type\","))
                    requireNotNull(context.contentResolver.openOutputStream(uri, "w")).use { stream ->
                        stream.write(contents.toByteArray(Charsets.UTF_8))
                    }
                }
                message = R.string.saved
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (_: Exception) {
                message = R.string.finance_report_export_failed
            } finally {
                request = null
            }
        }
    }
    Button(enabled = request == null, onClick = {
        message = null
        request = "/finance/reports/export?$query"
        create.launch("madrasty-finance-$asOf.csv")
    }) { Text(stringResource(R.string.finance_report_export)) }
    message?.let { Text(stringResource(it)) }
}

private val reportStatuses = mapOf("unpaid" to R.string.fee_unpaid, "partial" to R.string.fee_partial,
    "paid" to R.string.fee_paid, "cancelled" to R.string.fee_cancelled, "overdue" to R.string.finance_report_status_late)

private val totalLabels = mapOf(
    "billedMinor" to R.string.finance_report_billed, "collectibleMinor" to R.string.finance_report_collectible,
    "appliedMinor" to R.string.fee_allocated, "outstandingMinor" to R.string.finance_report_outstanding,
    "overdueMinor" to R.string.finance_report_overdue, "receivedMinor" to R.string.finance_report_received,
    "netReceivedMinor" to R.string.finance_report_net, "matchedReceivedMinor" to R.string.finance_report_matched,
    "reversedMinor" to R.string.finance_report_reversed, "voidedMinor" to R.string.finance_report_voided,
    "refundedMinor" to R.string.finance_report_refunded, "unmatchedMinor" to R.string.receipt_remainder,
)
