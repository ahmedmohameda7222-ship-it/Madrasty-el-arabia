package de.madrasty.app.finance

import androidx.compose.material3.Button
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
import org.json.JSONArray
import org.json.JSONObject

@Composable
internal fun ReceiptDetails(model: IdentityViewModel, id: String, invoice: (String) -> Unit, close: () -> Unit) {
    var refresh by remember { mutableIntStateOf(0) }
    var notice by remember { mutableStateOf<Int?>(null) }
    val read = academicRead("/finance/receipts/$id", refresh + model.attendanceNetworkRevision) { model.financeObject(it) }
    FinancePage(R.string.receipt_title, close) {
        notice?.let { Text(stringResource(it)) }
        AsyncSurface(read) { item ->
            FinancePdfButton(model,"receipts",item.getString("id"),item.getString("receiptNumber"))
            ReceiptDocument(item, invoice)
            if (item.getString("scope") == "staff" && item.getBoolean("canPost")) {
                key(item.getInt("revision"), refresh) {
                    ReceiptActions(model, item) { message -> notice = message; refresh++ }
                }
            }
        }
    }
}

@Composable
private fun ReceiptDocument(item: JSONObject, invoice: (String) -> Unit) {
    val currency = item.getString("currency")
    Text(isolate(item.getString("receiptNumber")), style = MaterialTheme.typography.titleLarge)
    Text(stringResource(receiptMethodLabel(item.getString("method"))) + " · " + isolate(item.getString("receivedDate")))
    ConfirmedAt(item.getString("recordedAt"))
    MoneyFact(R.string.receipt_total, item.getLong("amountMinor"), currency)
    val staff = item.getString("scope") == "staff"
    if (staff) {
        Text(stringResource(receiptStateLabel(item.getString("state"))) + " · " + isolate(item.getString("externalReceiptRef")))
        MoneyFact(R.string.receipt_active, item.getLong("activeMinor"), currency)
        MoneyFact(R.string.receipt_remainder, item.getLong("remainderMinor"), currency)
        item.string("suggestedInvoiceId")?.let { id ->
            TextButton(onClick = { invoice(id) }) { Text(stringResource(R.string.receipt_suggested_invoice)) }
        }
    }
    MoneyFact(R.string.fee_allocated, item.getLong("appliedMinor"), currency)
    Text(stringResource(R.string.receipt_allocations), style = MaterialTheme.typography.titleMedium)
    for (entry in item.financeRows("allocations")) {
        HorizontalDivider()
        TextButton(onClick = { invoice(entry.getString("invoiceId")) }) { Text(receiptInvoiceLabel(entry)) }
        Text(financeMoney(entry.getLong("amountMinor"), currency))
        ConfirmedAt(entry.getString("postedAt"))
        entry.string("reversedAt")?.let { reversed ->
            Text(stringResource(R.string.receipt_corrected))
            ConfirmedAt(reversed)
        }
        entry.string("reason")?.let { Text(isolate(it)) }
    }
    if (staff) {
        var showHistory by remember { mutableStateOf(false) }
        TextButton(onClick = { showHistory = !showHistory }) { Text(stringResource(R.string.receipt_history)) }
        if (showHistory) for (row in item.financeRows("history")) {
            val kind = when (row.getString("kind")) {
                "record" -> R.string.receipt_recorded
                "allocate" -> R.string.receipt_allocated_event
                "unapply" -> R.string.receipt_unapplied
                "refund" -> R.string.finance_report_refund
                else -> R.string.receipt_voided
            }
            Text(stringResource(kind))
            ConfirmedAt(row.getString("postedAt"))
            row.string("reason")?.let { Text(isolate(it)) }
        }
    }
}

@Composable
private fun MoneyFact(label: Int, minor: Long, currency: String) {
    Text(stringResource(label) + " · " + financeMoney(minor, currency))
}

private enum class ReceiptAction(val title: Int, val endpoint: String, val kind: String) {
    Allocate(R.string.receipt_allocate, "allocations", "allocate"),
    Unapply(R.string.receipt_unapply, "reversals", "unapply"),
    Void(R.string.receipt_void, "reversals", "void_receipt"),
}

private data class ApplyRow(val invoice: JSONObject, val amount: String)
private data class LedgerPreview(val input: JSONObject, val balances: List<BalanceChange>, val remainder: Long)
private data class BalanceChange(val invoiceNumber: String, val before: Long, val after: Long)

@Composable
private fun ReceiptActions(model: IdentityViewModel, item: JSONObject, changed: (Int) -> Unit) {
    val attempts = remember { mutableMapOf<String, Pair<String, String>>() }
    val open = item.getLong("remainderMinor")
    val currency = item.getString("currency")
    val active = item.financeRows("allocations").filter { it.isNull("reversedAt") }
    var action by remember { mutableStateOf<ReceiptAction?>(null) }
    val current = action
    var proposal by remember { mutableStateOf<LedgerPreview?>(null) }
    var drafts by remember { mutableStateOf(listOf<ApplyRow>()) }
    var ids by remember(current) { mutableStateOf(emptySet<String>()) }
    var reason by remember(current) { mutableStateOf("") }
    val reviewed = proposal
    if (current != null && reviewed != null) {
        Text(stringResource(current.title), style = MaterialTheme.typography.titleMedium)
        for (row in reviewed.balances) {
            Text(isolate(row.invoiceNumber))
            MoneyFact(R.string.receipt_balance_before, row.before, currency)
            MoneyFact(R.string.receipt_balance_after, row.after, currency)
        }
        MoneyFact(R.string.receipt_remainder, reviewed.remainder, currency)
        reviewed.input.optString("reason").takeIf { it.isNotEmpty() }?.let { Text(isolate(it)) }
        if (current != ReceiptAction.Allocate) Text(stringResource(R.string.receipt_no_external_refund))
        TextButton(onClick = { proposal = null }) { Text(stringResource(R.string.fee_edit)) }
        Submit(true, R.string.receipt_confirm, success = null) {
            try {
                model.schoolCommand(attempts, "/finance/receipts/${item.getString("id")}/${current.endpoint}", "POST", reviewed.input)
                changed(if (current == ReceiptAction.Allocate) R.string.receipt_allocated_event else R.string.receipt_corrected)
            } catch (error: HttpFailure) {
                if (error.status != 409) throw error
                changed(R.string.receipt_stale)
            }
        }
    } else {
        if (open > 0L) FilterChip(current == ReceiptAction.Allocate, { action = ReceiptAction.Allocate }, label = {
            Text(stringResource(ReceiptAction.Allocate.title))
        })
        if (active.isNotEmpty()) FilterChip(current == ReceiptAction.Unapply, { action = ReceiptAction.Unapply }, label = {
            Text(stringResource(ReceiptAction.Unapply.title))
        })
        FilterChip(current == ReceiptAction.Void, { action = ReceiptAction.Void }, label = { Text(stringResource(ReceiptAction.Void.title)) })
        when (current) {
            ReceiptAction.Allocate -> AllocationEditor(model, item.getInt("revision"), currency, open, drafts, { drafts = it }) { proposal = it }
            ReceiptAction.Unapply, ReceiptAction.Void ->
                ReversalEditor(current, item.getInt("revision"), currency, open, active, ids, { ids = it }, reason, { reason = it }) { proposal = it }
            null -> Unit
        }
    }
}

@Composable
private fun AllocationEditor(
    model: IdentityViewModel, revision: Int, currency: String, remainder: Long,
    drafts: List<ApplyRow>, change: (List<ApplyRow>) -> Unit, preview: (LedgerPreview) -> Unit,
) {
    val amounts = drafts.map { financeMinor(it.amount, currency, it.invoice.getLong("balanceMinor")) }
    val total = amounts.sumOf { it ?: 0L }
    for ((index, row) in drafts.withIndex()) {
        Text(receiptInvoiceLabel(row.invoice))
        MoneyFact(R.string.fee_balance, row.invoice.getLong("balanceMinor"), currency)
        Field(R.string.receipt_allocation_amount, row.amount) { value ->
            change(drafts.mapIndexed { i, item -> if (i == index) item.copy(amount = value.take(24)) else item })
        }
        TextButton(onClick = { change(drafts.filterIndexed { i, _ -> i != index }) }) { Text(stringResource(R.string.fee_remove_line)) }
    }
    if (drafts.size < 100) ReceiptInvoicePicker(model, currency, drafts.map { it.invoice.getString("id") }.toSet()) { candidate ->
        val default = minOf(candidate.getLong("balanceMinor"), (remainder - total).coerceAtLeast(0))
        change(drafts + ApplyRow(candidate, financePlainAmount(default, currency)))
    }
    Button(enabled = drafts.isNotEmpty() && amounts.none { it == null } && total <= remainder, onClick = {
        val lines = JSONArray()
        val balances = drafts.mapIndexed { index, one ->
            val amount = requireNotNull(amounts[index])
            val before = one.invoice.getLong("balanceMinor")
            lines.put(JSONObject().put("invoiceId", one.invoice.getString("id"))
                .put("invoiceRevision", one.invoice.getInt("revision")).put("amountMinor", amount))
            BalanceChange(one.invoice.getString("invoiceNumber"), before, before - amount)
        }
        preview(LedgerPreview(JSONObject().put("lines", lines).put("revision", revision), balances, remainder - total))
    }) { Text(stringResource(R.string.fee_preview)) }
}

@Composable
private fun ReversalEditor(
    action: ReceiptAction, revision: Int, currency: String, remainder: Long, active: List<JSONObject>,
    ids: Set<String>, select: (Set<String>) -> Unit, reason: String, explain: (String) -> Unit, preview: (LedgerPreview) -> Unit,
) {
    if (action == ReceiptAction.Unapply) for (row in active) {
        val id = row.getString("id")
        FilterChip(id in ids, { select(if (id in ids) ids - id else if (ids.size < 100) ids + id else ids) }, label = {
            Text(receiptInvoiceLabel(row) + " · " + financeMoney(row.getLong("amountMinor"), currency))
        })
    }
    Field(R.string.receipt_reason, reason) { explain(it.take(500)) }
    Text(stringResource(R.string.receipt_no_external_refund))
    Button(enabled = reason.trim().length >= 3 && (action == ReceiptAction.Void || ids.isNotEmpty()), onClick = {
        val rows = if (action == ReceiptAction.Void) active else active.filter { it.getString("id") in ids }
        val balances = rows.groupBy { it.getString("invoiceId") }.values.map { group ->
            val first = group.first()
            val before = first.optLong("invoiceBalanceMinor")
            BalanceChange(first.getString("invoiceNumber"), before, before + group.sumOf { it.getLong("amountMinor") })
        }
        val input = JSONObject().put("kind", action.kind).put("revision", revision).put("reason", reason.trim())
        if (action == ReceiptAction.Unapply) input.put("allocationIds", JSONArray(ids.toList().sorted()))
        val after = if (action == ReceiptAction.Void) 0 else remainder + rows.sumOf { it.getLong("amountMinor") }
        preview(LedgerPreview(input, balances, after))
    }) { Text(stringResource(R.string.fee_preview)) }
}
