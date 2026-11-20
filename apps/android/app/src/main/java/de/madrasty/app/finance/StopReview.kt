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
import org.json.JSONArray
import org.json.JSONObject

@Composable
internal fun StopReview(
    model: IdentityViewModel, id: String?, open: (String) -> Unit, invoice: (String) -> Unit,
    receipt: (String) -> Unit, close: () -> Unit,
) {
    var refresh by remember { mutableIntStateOf(0) }
    var message by remember { mutableStateOf<Int?>(null) }
    FinancePage(R.string.stop_review_title, close) {
        message?.let { Text(stringResource(it)) }
        if (id == null) ReviewQueue(model, open)
        else {
            val read = academicRead("/finance/stop-reviews/$id", refresh + model.attendanceNetworkRevision) { model.financeObject(it) }
            AsyncSurface(read) { item ->
                key(item.getInt("revision"), refresh) {
                    ReviewDocument(model, item, invoice, receipt) { label -> message = label; refresh++ }
                }
            }
        }
    }
}

@Composable
private fun ReviewQueue(model: IdentityViewModel, open: (String) -> Unit) {
    var filter by remember { mutableStateOf("open") }
    FlowRow {
        FilterChip(filter.isEmpty(), { filter = "" }, label = { Text(stringResource(R.string.fee_all_states)) })
        for ((key, label) in reviewStates) FilterChip(filter == key, { filter = key }, label = { Text(stringResource(label)) })
    }
    val status = if (filter.isEmpty()) "" else "&status=$filter"
    academicPages(model, "/finance/stop-reviews?limit=25$status", model.attendanceNetworkRevision) { rows ->
        for (one in rows) {
            HorizontalDivider()
            TextButton(onClick = { open(one.getString("id")) }) { Text(pupilFinanceLabel(one) + " · " + isolate(one.getString("invoiceNumber"))) }
            Text(stringResource(reviewStates.getValue(one.getString("state"))) + " · " + isolate(one.getString("period")))
            ReviewMoney(R.string.stop_original_paid, one.getLong("originalAllocatedMinor"), one.getString("currency"))
        }
    }
}

@Composable
private fun ReviewDocument(
    model: IdentityViewModel, request: JSONObject, invoice: (String) -> Unit, receipt: (String) -> Unit, updated: (Int) -> Unit,
) {
    val currency = request.getString("currency")
    val canPost = request.getBoolean("canPost")
    val funds = request.financeRows("funds")
    val evidence = request.financeRows("evidence")
    var refund by remember { mutableStateOf<String?>(null) }
    Text(pupilFinanceLabel(request), style = MaterialTheme.typography.titleLarge)
    TextButton(onClick = { invoice(request.getString("invoiceId")) }) { Text(isolate(request.getString("invoiceNumber"))) }
    Text(stringResource(reviewStates.getValue(request.getString("state"))) + " · " + isolate(request.getString("period")))
    ConfirmedAt(request.string("resolvedAt") ?: request.getString("openedAt"))
    ReviewMoney(R.string.stop_original, request.getLong("originalMinor"), currency)
    ReviewMoney(R.string.stop_collectible, request.getLong("collectibleMinor"), currency)
    ReviewMoney(R.string.stop_original_paid, request.getLong("originalAllocatedMinor"), currency)
    ReviewMoney(R.string.stop_active_paid, request.getLong("currentAllocatedMinor"), currency)
    request.string("reason")?.let { Text(stringResource(R.string.stop_finance_reason) + " · " + isolate(it)) }
    request.string("adjustmentId")?.let { Text(stringResource(R.string.stop_adjustment) + " · " + isolate(it)) }

    for (fund in funds) {
        HorizontalDivider()
        val receiptId = fund.getString("receiptId")
        val active = fund.getLong("activeMinor")
        val available = minOf(fund.getLong("unmatchedMinor"), fund.getLong("sourceMinor") - active - fund.getLong("refundedMinor")).coerceAtLeast(0)
        TextButton(onClick = { receipt(receiptId) }) {
            Text(stringResource(R.string.stop_original_receipt) + " · " + isolate(fund.getString("receiptNumber")))
        }
        ReviewMoney(R.string.stop_original_paid, fund.getLong("sourceMinor"), currency)
        ReviewMoney(R.string.stop_active_paid, active, currency)
        ReviewMoney(R.string.stop_available, available, currency)
        if (canPost && active > 0) Text(stringResource(R.string.stop_unapply_help))
        if (canPost && available > 0) {
            TextButton(onClick = { refund = if (refund == receiptId) null else receiptId }) { Text(stringResource(R.string.stop_refund)) }
            if (refund == receiptId) RefundEditor(model, request, receiptId, available, updated)
        }
    }
    if (canPost) ResolutionEditor(model, request, funds, evidence, updated)
    else for (proof in evidence) Text(proofLabel(proof, currency))
}

@Composable
private fun RefundEditor(model: IdentityViewModel, review: JSONObject, receipt: String, available: Long, updated: (Int) -> Unit) {
    val currency = review.getString("currency")
    var reference by remember(receipt) { mutableStateOf("") }
    var date by remember(receipt) { mutableStateOf("") }
    var amount by remember(receipt) { mutableStateOf("") }
    var verified by remember(receipt) { mutableStateOf(false) }
    var preview by remember(receipt) { mutableStateOf<JSONObject?>(null) }
    val attempts = remember(receipt) { mutableMapOf<String, Pair<String, String>>() }
    val prepared = preview
    Text(stringResource(R.string.stop_refund_help))
    if (prepared != null) {
        Text(isolate(prepared.getString("externalRefundRef")) + " · " + isolate(prepared.getString("refundedDate")))
        Text(financeMoney(prepared.getLong("amountMinor"), currency))
        TextButton(onClick = { preview = null }) { Text(stringResource(R.string.fee_edit)) }
        Submit(true, R.string.receipt_confirm, success = null) {
            try {
                model.schoolCommand(attempts, "/finance/stop-reviews/${review.getString("id")}/refunds", "POST", prepared)
                updated(R.string.stop_refund_saved)
            } catch (error: HttpFailure) {
                if (error.status != 409) throw error
                updated(R.string.stop_stale)
            }
        }
    } else {
        Field(R.string.stop_refund_reference, reference) { reference = it.take(160) }
        Field(R.string.stop_refund_date, date) { date = financeDigits(it).take(10) }
        Field(R.string.stop_refund_amount, amount) { amount = it.take(24) }
        FilterChip(verified, { verified = !verified }, label = { Text(stringResource(R.string.stop_verify_refund)) })
        val minor = financeMinor(amount, currency, available)
        val ref = reference.trim()
        Button(enabled = verified && minor != null && validFinanceDate(date) && ref.isNotEmpty() &&
            ref.none { it.isISOControl() || Character.getType(it) == Character.FORMAT.toInt() }, onClick = {
            preview = JSONObject().put("receiptId", receipt).put("externalRefundRef", ref)
                .put("refundedDate", date).put("amountMinor", minor).put("verified", true).put("revision", review.getInt("revision"))
        }) { Text(stringResource(R.string.fee_preview)) }
    }
}

@Composable
private fun ResolutionEditor(
    model: IdentityViewModel, review: JSONObject, funds: List<JSONObject>, evidence: List<JSONObject>, updated: (Int) -> Unit,
) {
    val currency = review.getString("currency")
    val refunds = evidence.filter { it.getString("kind") == "refund" }.map { it.getString("id") }.toSet()
    var retain by remember { mutableStateOf(false) }
    var selected by remember { mutableStateOf(refunds) }
    var reason by remember { mutableStateOf("") }
    var preview by remember { mutableStateOf<JSONObject?>(null) }
    val attempts = remember { mutableMapOf<String, Pair<String, String>>() }
    val prepared = preview

    HorizontalDivider()
    val manual = review.getString("kind") == "manual"
    val action = if (retain) R.string.stop_retain_manual else R.string.stop_waive
    if (prepared != null) {
        Text(stringResource(action), style = MaterialTheme.typography.titleMedium)
        Text(isolate(prepared.getString("reason")))
        if (!retain) for (proof in evidence.filter { it.getString("id") in selected }) Text(proofLabel(proof, currency))
        TextButton(onClick = { preview = null }) { Text(stringResource(R.string.fee_edit)) }
        Submit(true, R.string.stop_confirm_resolution, success = null) {
            try {
                val result = model.schoolCommand(attempts, "/finance/stop-reviews/${review.getString("id")}", "PATCH", prepared)
                updated(reviewStates.getValue(result.getString("state")))
            } catch (error: HttpFailure) {
                if (error.status != 409) throw error
                updated(R.string.stop_stale)
            }
        }
        return
    }
    Text(stringResource(R.string.stop_review_title), style = MaterialTheme.typography.titleMedium)
    if (manual) {
        FilterChip(!retain, { retain = false }, label = { Text(stringResource(R.string.stop_waive)) })
        FilterChip(retain, { retain = true }, label = { Text(stringResource(R.string.stop_retain_manual)) })
    } else Text(stringResource(action))
    if (!retain) for (proof in evidence) {
        val id = proof.getString("id")
        val label = proofLabel(proof, currency)
        FilterChip(id in selected, { selected = if (id in selected) selected - id else selected + id },
            enabled = id !in refunds, label = { Text(label) })
    }
    val documented = evidence.filter { it.getString("id") in selected }.groupBy { it.getString("receiptId") }
    val disposed = funds.all { source ->
        source.getLong("sourceMinor") == (documented[source.getString("receiptId")]?.sumOf { it.getLong("amountMinor") } ?: 0L)
    }
    val current = review.getLong("currentAllocatedMinor")
    val eligible = if (retain) manual && current == review.getLong("originalAllocatedMinor") && refunds.isEmpty()
        else disposed && current == 0L && selected.size <= 100
    if (!retain && !eligible) Text(stringResource(R.string.stop_proof_required))
    Field(R.string.stop_finance_reason, reason) { reason = it.take(800) }
    Button(enabled = eligible && reason.trim().length >= 3, onClick = {
        val input = JSONObject().put("resolution", if (retain) "retain_manual" else "waive")
            .put("reason", reason.trim()).put("revision", review.getInt("revision"))
        if (!retain) {
            val ids = selected.sorted()
            ids.firstOrNull()?.let { input.put("receiptOrAdjustmentRef", it) }
            if (ids.size > 1) input.put("references", JSONArray(ids.drop(1)))
        }
        preview = input
    }) { Text(stringResource(R.string.fee_preview)) }
}

@Composable
private fun ReviewMoney(label: Int, value: Long, currency: String) {
    Text(stringResource(label) + " · " + financeMoney(value, currency))
}

@Composable
private fun proofLabel(proof: JSONObject, currency: String): String {
    val kind = if (proof.getString("kind") == "refund") R.string.stop_refund_proof else R.string.stop_reallocation
    return stringResource(kind) + " · " + isolate(proof.getString("reference")) + " · " + financeMoney(proof.getLong("amountMinor"), currency)
}

private val reviewStates = mapOf("open" to R.string.stop_open, "waived" to R.string.stop_waived, "retained" to R.string.stop_retained)
