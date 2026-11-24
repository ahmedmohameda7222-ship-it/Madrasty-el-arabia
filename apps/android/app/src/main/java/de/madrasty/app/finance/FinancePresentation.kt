package de.madrasty.app.finance

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.res.stringResource
import de.madrasty.app.R
import org.json.JSONObject

@Composable
internal fun FinanceBalanceCard(label: String, amount: String) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(label, style = MaterialTheme.typography.labelLarge)
            Text(amount, style = MaterialTheme.typography.headlineSmall)
        }
    }
}

@Composable
internal fun FinanceRecordRow(title: String, subtitle: String, amount: String, status: String, onClick: () -> Unit) {
    BoxWithConstraints(modifier = Modifier.fillMaxWidth()) {
        val compact = maxWidth <= 400.dp
        ListItem(
            modifier = Modifier.fillMaxWidth().clickable(role = Role.Button, onClick = onClick),
            headlineContent = { Text(title) },
            supportingContent = {
                if (compact) {
                    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        Text(subtitle, modifier = Modifier.weight(1f))
                        FinanceRecordAmount(amount, status)
                    }
                } else Text(subtitle)
            },
            trailingContent = if (compact) null else {{ FinanceRecordAmount(amount, status) }},
        )
    }
}

@Composable
private fun FinanceRecordAmount(amount: String, status: String) {
    Column(horizontalAlignment = Alignment.End) {
        Text(amount, style = MaterialTheme.typography.titleSmall, textAlign = TextAlign.End)
        Text(status, style = MaterialTheme.typography.labelSmall, textAlign = TextAlign.End)
    }
}

@Composable
internal fun FinancePayerSummary(totals: List<JSONObject>, onInvoices: () -> Unit) {
    if (totals.isEmpty()) {
        Text(stringResource(R.string.finance_no_invoices), style = MaterialTheme.typography.titleMedium)
        Text(stringResource(R.string.finance_no_invoices_hint), style = MaterialTheme.typography.bodyMedium)
    }
    for (total in totals) {
        val currency = total.getString("currency")
        FinanceBalanceCard(stringResource(R.string.fee_balance), financeMoney(total.getLong("outstandingMinor"), currency))
        Text(stringResource(R.string.finance_fees_total) + " · " + financeMoney(total.getLong("collectibleMinor"), currency))
        Text(stringResource(R.string.fee_paid) + " · " + financeMoney(total.getLong("appliedMinor"), currency))
    }
    Button(onClick = onInvoices, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.finance_my_invoices)) }
}
