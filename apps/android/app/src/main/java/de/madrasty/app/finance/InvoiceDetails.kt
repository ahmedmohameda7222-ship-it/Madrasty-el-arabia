package de.madrasty.app.finance

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
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.res.stringResource
import de.madrasty.app.R
import de.madrasty.app.academics.academicPages
import de.madrasty.app.academics.academicRead
import de.madrasty.app.comms.StartConversation
import de.madrasty.app.identity.IdentityViewModel
import de.madrasty.app.school.Field
import de.madrasty.app.school.Submit
import de.madrasty.app.school.schoolCommand
import de.madrasty.app.ui.AsyncSurface
import de.madrasty.app.ui.ConfirmedAt
import de.madrasty.app.ui.isolate
import org.json.JSONObject

@Composable
internal fun InvoiceDetails(
    model: IdentityViewModel, id: String?, student: String?, period: String?,
    open: (String) -> Unit, thread: (String) -> Unit, receipt: (String) -> Unit, payment: ((String) -> Unit)?, close: () -> Unit, issue: (() -> Unit)? = null,
) {
    FinancePage(R.string.fee_invoices, close) {
        if (id != null) {
            var refresh by remember(id) { mutableIntStateOf(0) }
            val details = academicRead("/finance/invoices/$id", model.attendanceNetworkRevision + refresh) { model.financeObject(it) }
            AsyncSurface(details) { item ->
                InvoiceDocument(model, item, thread, receipt, payment)
                key(item.getInt("revision")) { InvoiceCorrectionPanel(model, item, open) { refresh++ } }
            }
        } else {
            if(issue!=null) Button(onClick=issue){Text(stringResource(R.string.fee_issue))}
            InvoiceList(model, student, period, open, payment)
        }
    }
}

@Composable
private fun InvoiceList(model: IdentityViewModel, student: String?, period: String?, open: (String) -> Unit, payment: ((String) -> Unit)?) {
    var month by remember(period) { mutableStateOf(period.orEmpty()) }
    var state by remember { mutableStateOf("") }
    Field(R.string.fee_month, month) { month = financeDigits(it).take(7) }
    var showFilters by remember { mutableStateOf(false) }
    TextButton(onClick = { showFilters = !showFilters }) { Text(stringResource(R.string.finance_filters)) }
    if (showFilters) FlowRow {
        FilterChip(state.isEmpty(), { state = "" }, label = { Text(stringResource(R.string.fee_all_states)) })
        for ((key, title) in invoiceStates) {
            FilterChip(state == key, { state = key }, label = { Text(stringResource(title)) })
        }
    }
    val filter = buildString {
        student?.let { append("&studentId=").append(it) }
        if (validBillingMonth(month)) append("&period=").append(month)
        if (state.isNotEmpty()) append("&state=").append(state)
    }
    academicPages(model, "/finance/invoices?limit=25$filter", model.attendanceNetworkRevision) { rows ->
        for (item in rows) {
            HorizontalDivider()
            val stateLabel = invoiceStates.getValue(item.getString("state"))
            FinanceRecordRow(
                title = isolate(item.getString("studentName")),
                subtitle = isolate(item.getString("period")) + " · " + isolate(item.getString("invoiceNumber")),
                amount = financeMoney(item.getLong("balanceMinor").takeIf { it > 0L } ?: item.getLong("totalMinor"), item.getString("currency")),
                status = stringResource(stateLabel),
                onClick = { open(item.getString("id")) },
            )
            if (payment != null && item.getLong("balanceMinor") > 0L && item.getString("state") != "cancelled") {
                TextButton(onClick = { payment(item.getString("id")) }) { Text(stringResource(R.string.receipt_record)) }
            }
        }
    }
}

@Composable
private fun InvoiceDocument(model: IdentityViewModel, item: JSONObject, thread: (String) -> Unit, receipt: (String) -> Unit, payment: ((String) -> Unit)?) {
    val currency = item.getString("currency")
    var snapshot by remember(item.getString("id")) { mutableStateOf(false) }
    Text(isolate(item.getString("studentName")), style = MaterialTheme.typography.titleLarge)
    FinanceBalanceCard(stringResource(R.string.fee_balance), financeMoney(item.getLong("balanceMinor"), currency))
    Text(isolate(item.getString("invoiceNumber")), style = MaterialTheme.typography.bodyMedium)
    FinancePdfButton(model,"invoices",item.getString("id"),item.getString("invoiceNumber"))
    Text(pupilFinanceLabel(item))
    val kind = if (item.getString("kind") == "monthly") R.string.fee_monthly else R.string.fee_manual
    Text(isolate(item.getString("period")) + " · " + stringResource(kind))
    Text(stringResource(R.string.fee_payer) + " · " + isolate(item.getString("payerName")))
    Text(stringResource(R.string.fee_due) + " · " + isolate(item.getString("dueDate")))
    Text(stringResource(invoiceStates.getValue(item.getString("state"))))
    ConfirmedAt(item.getString("issuedAt"))
    FeeLineSummary(item.financeRows("lines"), currency)
    Text(stringResource(R.string.fee_total) + " · " + financeMoney(item.getLong("totalMinor"), currency))
    Text(stringResource(R.string.fee_allocated) + " · " + financeMoney(item.getLong("allocatedMinor"), currency))
    item.optJSONObject("paymentInstructions")?.let { TransferDetails(it) }
    TextButton(onClick = { snapshot = !snapshot }) { Text(stringResource(R.string.fee_snapshot)) }
    if (snapshot) item.optJSONObject("issueInstructions")?.let { TransferDetails(it) }
    val receipts = item.getJSONArray("receiptIds")
    for (index in 0 until receipts.length()) {
        TextButton(onClick = { receipt(receipts.getString(index)) }) { Text(stringResource(R.string.receipt_open) + " " + (index + 1)) }
    }
    if (payment != null && item.getLong("balanceMinor") > 0L) {
        TextButton(onClick = { payment(item.getString("id")) }) { Text(stringResource(R.string.receipt_record)) }
    }
    if (item.getBoolean("canInquire")) {
        StartConversation(model, "office", "accounts", "invoice", item.getString("id"), R.string.fee_ask, thread)
    }
}

private val invoiceStates = mapOf(
    "unpaid" to R.string.fee_unpaid, "partial" to R.string.fee_partial,
    "paid" to R.string.fee_paid, "cancelled" to R.string.fee_cancelled,
)

@Composable
private fun InvoiceCorrectionPanel(model: IdentityViewModel, item: JSONObject, openInvoice: (String) -> Unit, refresh: () -> Unit) {
    val options = item.optJSONObject("correction") ?: return
    var expanded by remember { mutableStateOf(false) }
    var reason by remember { mutableStateOf("") }
    val attempts = remember { mutableMapOf<String, Pair<String, String>>() }
    TextButton(onClick = { expanded = !expanded }) { Text(stringResource(R.string.finance_invoice_correction)) }
    if (!expanded) return
    options.optString("reason").takeIf { !options.isNull("reason") && it.isNotBlank() }?.let { Text(isolate(it)) }
    options.optString("replacementId").takeIf { !options.isNull("replacementId") && it.isNotBlank() }?.let { id ->
        TextButton(onClick = { openInvoice(id) }) { Text(stringResource(R.string.finance_replacement_open)) }
    }
    if (options.optBoolean("canCancel")) {
        Text(stringResource(R.string.finance_cancel_hint))
        Field(R.string.receipt_reason, reason) { reason = it.take(500) }
        Submit(reason.trim().length >= 3, R.string.finance_cancel_invoice, success = null) {
            model.schoolCommand(attempts, "/finance/invoices/${item.getString("id")}/corrections", "POST",
                JSONObject().put("kind", "cancel").put("revision", item.getInt("revision")).put("reason", reason.trim()))
            refresh()
        }
    }
    if (options.optBoolean("canReissue")) {
        Text(stringResource(R.string.finance_reissue_hint))
        Submit(true, R.string.finance_reissue_invoice, success = null) {
            val result = model.schoolCommand(attempts, "/finance/invoices/${item.getString("id")}/corrections", "POST",
                JSONObject().put("kind", "reissue").put("revision", item.getInt("revision")))
            openInvoice(result.getString("id"))
        }
    }
}
