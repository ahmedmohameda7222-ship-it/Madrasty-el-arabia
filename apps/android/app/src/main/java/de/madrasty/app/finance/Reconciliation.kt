package de.madrasty.app.finance

import androidx.compose.foundation.layout.FlowRow
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
    record: () -> Unit, open: (String) -> Unit, close: () -> Unit, review: () -> Unit) {
    var state by remember(initial) { mutableStateOf(initial ?: "") }
    var cashbook by remember(initial) { mutableStateOf(initial==null) }
    var showOptions by remember { mutableStateOf(false) }
    FinancePage(R.string.finance_cash_bank, close) {
        FlowRow {
            FilterChip(!cashbook,{cashbook=false},label={Text(stringResource(R.string.finance_payment_history))})
            FilterChip(cashbook,{cashbook=true},label={Text(stringResource(R.string.cashbook_title))})
        }
        if(cashbook){CashbookPanel(model)}else{
        TextButton(onClick={showOptions=!showOptions}){Text(stringResource(R.string.finance_more_details))}
        if(showOptions){
            if(canPost) TextButton(onClick=record){Text(stringResource(R.string.receipt_special))}
            TextButton(onClick=review){Text(stringResource(R.string.stop_review_title))}
        }
        var showFilters by remember { mutableStateOf(false) }
        TextButton(onClick={showFilters=!showFilters}) { Text(stringResource(R.string.finance_filters)) }
        if (showFilters) FlowRow {
            FilterChip(state.isEmpty(), { state = "" }, label = { Text(stringResource(R.string.receipt_all)) })
            for (key in listOf("needs_matching", "allocated", "voided")) {
                FilterChip(state == key, { state = key }, label = { Text(stringResource(receiptStateLabel(key))) })
            }
        }
        val filter = if (state.isEmpty()) "" else "&state=$state"
        academicPages(model, "/finance/receipts?limit=25$filter", model.attendanceNetworkRevision) { rows ->
            for (row in rows) {
                HorizontalDivider()
                val currency = row.getString("currency")
                FinanceRecordRow(
                    title = isolate(row.getString("receiptNumber")),
                    subtitle = isolate(row.getString("receivedDate")) + " · " + stringResource(receiptMethodLabel(row.getString("method"))),
                    amount = financeMoney(row.getLong("amountMinor"), currency),
                    status = stringResource(receiptStateLabel(row.getString("state"))),
                    onClick = { open(row.getString("id")) },
                )
                if (row.getLong("remainderMinor") > 0) Text(stringResource(R.string.receipt_remainder) + " · " + financeMoney(row.getLong("remainderMinor"), currency))
            }
        }
        }
    }
}
