package de.madrasty.app.finance

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
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
    ListItem(
        modifier = Modifier.fillMaxWidth().clickable(role = Role.Button, onClick = onClick),
        headlineContent = { Text(title) },
        supportingContent = { Text(subtitle) },
        trailingContent = {
            Column(horizontalAlignment = Alignment.End) {
                Text(amount, style = MaterialTheme.typography.titleSmall, textAlign = TextAlign.End)
                Text(status, style = MaterialTheme.typography.labelSmall, textAlign = TextAlign.End)
            }
        },
    )
}
