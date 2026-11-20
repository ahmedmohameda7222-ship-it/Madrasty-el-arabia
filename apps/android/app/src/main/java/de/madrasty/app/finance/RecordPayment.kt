package de.madrasty.app.finance

import android.net.Uri
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
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

@Composable
internal fun RecordPayment(
    model: IdentityViewModel, invoiceId: String?, openReceipt: (String) -> Unit, openQueue: () -> Unit, close: () -> Unit,
) {
    FinancePage(R.string.receipt_record, close) {
        TextButton(onClick = openQueue) { Text(stringResource(R.string.receipt_queue)) }
        val options = academicRead("/finance/receipt-options", 0) { model.financeObject(it) }
        AsyncSurface(options) { setup ->
            if (invoiceId == null) PaymentForm(model, setup, null, openReceipt)
            else {
                val invoice = academicRead("/finance/invoices/$invoiceId", 0) { model.financeObject(it) }
                AsyncSurface(invoice) { selected -> PaymentForm(model, setup, selected, openReceipt) }
            }
        }
    }
}

@Composable
private fun PaymentForm(model: IdentityViewModel, setup: JSONObject, initial: JSONObject?, openReceipt: (String) -> Unit) {
    val currency = setup.getString("currency")
    val today = setup.getString("schoolDate")
    val attempts = remember { mutableMapOf<String, Pair<String, String>>() }
    var method by remember { mutableStateOf("bank") }
    var date by remember(today) { mutableStateOf(today) }
    var reference by remember { mutableStateOf("") }
    var amount by remember { mutableStateOf("") }
    var verified by remember { mutableStateOf(false) }
    var invoice by remember(initial) { mutableStateOf(initial) }
    var choose by remember { mutableStateOf(false) }
    var review by remember { mutableStateOf<JSONObject?>(null) }
    var result by remember { mutableStateOf<JSONObject?>(null) }
    val selected = invoice
    val prepared = review
    result?.let { receipt ->
        Text(isolate(receipt.getString("receiptNumber")) + " · " + stringResource(receiptStateLabel(receipt.getString("state"))))
        TextButton(onClick = { openReceipt(receipt.getString("id")) }) { Text(stringResource(R.string.receipt_open)) }
    }
    if (prepared != null) {
        Text(stringResource(receiptMethodLabel(prepared.getString("method"))) + " · " + isolate(prepared.getString("receivedDate")))
        Text(isolate(prepared.getString("externalReceiptRef")))
        Text(financeMoney(prepared.getLong("amountMinor"), currency))
        selected?.let { Text(receiptInvoiceLabel(it)) }
        val exact = selected != null && selected.optString("currency") == currency && selected.optLong("balanceMinor") == prepared.getLong("amountMinor")
        Text(stringResource(if (exact) R.string.receipt_exact else R.string.receipt_unmatched))
        TextButton(onClick = { review = null }) { Text(stringResource(R.string.fee_edit)) }
        Submit(true, R.string.receipt_confirm, success = null) {
            val resultRow = model.schoolCommand(attempts, "/finance/receipts", "POST", prepared)
            result = resultRow
            review = null
            reference = ""
            amount = ""
            verified = false
            invoice = null
        }
        return
    }
    if (setup.getBoolean("cashEnabled")) {
        FilterChip(method == "bank", { method = "bank" }, label = { Text(stringResource(R.string.receipt_bank)) })
        FilterChip(method == "cash", { method = "cash" }, label = { Text(stringResource(R.string.receipt_cash)) })
    } else Text(stringResource(R.string.receipt_bank))
    Field(R.string.receipt_reference, reference) { reference = it.take(160) }
    Field(R.string.receipt_date, date) { date = financeDigits(it).take(10) }
    Text(isolate(currency))
    Field(R.string.finance_amount, amount) { amount = it.take(24) }
    selected?.let {
        Text(receiptInvoiceLabel(it))
        TextButton(onClick = { invoice = null }) { Text(stringResource(R.string.receipt_without_invoice)) }
    }
    TextButton(onClick = { choose = !choose }) { Text(stringResource(R.string.receipt_optional_invoice)) }
    if (choose) ReceiptInvoicePicker(model, currency) { invoice = it; choose = false }
    FilterChip(verified, { verified = !verified }, label = { Text(stringResource(R.string.receipt_confirmed_external)) })
    val minor = financeMinor(amount, currency, 100_000_000_000_000)
    val ref = reference.trim()
    val ready = minor != null && verified && ref.isNotEmpty() && ref.none { it.isISOControl() || Character.getType(it) == Character.FORMAT.toInt() } &&
        validFinanceDate(date) && date >= "1900-01-01" && date <= today
    Button(onClick = {
        val input = JSONObject().put("externalReceiptRef", ref).put("receivedDate", date).put("method", method)
            .put("currency", currency).put("amountMinor", minor).put("verified", true)
        selected?.let { input.put("invoiceId", it.getString("id")) }
        review = input
        result = null
        choose = false
    }, enabled = ready) { Text(stringResource(R.string.fee_preview)) }
}

@Composable
internal fun ReceiptInvoicePicker(
    model: IdentityViewModel, currency: String, excluded: Set<String> = emptySet(), pick: (JSONObject) -> Unit,
) {
    var month by remember { mutableStateOf("") }
    var value by remember { mutableStateOf("") }
    var search by remember { mutableStateOf("") }
    var partial by remember { mutableStateOf(false) }
    Field(R.string.receipt_invoice_search, value) { value = it.take(100) }
    Field(R.string.fee_month, month) { month = financeDigits(it).take(7) }
    Button(onClick = { search = value.trim() }) { Text(stringResource(R.string.fee_search)) }
    FilterChip(!partial, { partial = false }, label = { Text(stringResource(R.string.fee_unpaid)) })
    FilterChip(partial, { partial = true }, label = { Text(stringResource(R.string.fee_partial)) })
    val byMonth = if (validBillingMonth(month)) "&period=$month" else ""
    val state = if (partial) "partial" else "unpaid"
    academicPages(model, "/finance/invoices?limit=20&q=${Uri.encode(search)}&state=$state$byMonth", model.attendanceNetworkRevision) { rows ->
        for (row in rows.filter { it.getString("currency") == currency && it.getLong("balanceMinor") > 0L && it.getString("id") !in excluded }) {
            HorizontalDivider()
            Text(receiptInvoiceLabel(row))
            Text(financeMoney(row.getLong("balanceMinor"), currency))
            TextButton(onClick = { pick(row) }) { Text(stringResource(R.string.receipt_choose_invoice)) }
        }
    }
}

internal fun receiptInvoiceLabel(row: JSONObject): String =
    pupilFinanceLabel(row) + " · " + isolate(row.getString("invoiceNumber")) + " · " + isolate(row.getString("period"))

internal fun receiptMethodLabel(method: String) = if (method == "cash") R.string.receipt_cash else R.string.receipt_bank
internal fun receiptStateLabel(state: String) = when (state) {
    "needs_matching" -> R.string.receipt_needs_matching
    "voided" -> R.string.receipt_voided
    else -> R.string.receipt_allocated_status
}
