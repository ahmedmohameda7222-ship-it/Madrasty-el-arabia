package de.madrasty.app.finance

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
import de.madrasty.app.identity.IdentityViewModel
import de.madrasty.app.ui.isolate

@Composable
internal fun Reconciliation(model: IdentityViewModel, initial: String?, canPost: Boolean,
    record: () -> Unit, open: (String) -> Unit, close: () -> Unit) {
    var state by remember(initial) { mutableStateOf(initial ?: "needs_matching") }
    FinancePage(R.string.receipt_queue, close) {
        if (canPost) TextButton(onClick = record) { Text(stringResource(R.string.receipt_record)) }
        FilterChip(state.isEmpty(), { state = "" }, label = { Text(stringResource(R.string.receipt_all)) })
        for (key in listOf("needs_matching", "allocated", "voided")) {
            FilterChip(state == key, { state = key }, label = { Text(stringResource(receiptStateLabel(key))) })
        }
        val filter = if (state.isEmpty()) "" else "&state=$state"
        academicPages(model, "/finance/receipts?limit=25$filter", model.attendanceNetworkRevision) { rows ->
            for (row in rows) {
                HorizontalDivider()
                TextButton(onClick = { open(row.getString("id")) }) { Text(isolate(row.getString("receiptNumber"))) }
                Text(stringResource(receiptStateLabel(row.getString("state"))) + " · " + isolate(row.getString("receivedDate")))
                Text(stringResource(receiptMethodLabel(row.getString("method"))) + " · " +
                    financeMoney(row.getLong("amountMinor"), row.getString("currency")))
                Text(stringResource(R.string.receipt_remainder) + " · " + financeMoney(row.getLong("remainderMinor"), row.getString("currency")))
            }
        }
    }
}
