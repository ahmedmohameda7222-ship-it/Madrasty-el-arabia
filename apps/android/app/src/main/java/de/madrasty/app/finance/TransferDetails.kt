package de.madrasty.app.finance

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import de.madrasty.app.R
import de.madrasty.app.ui.CopyValue
import java.math.BigDecimal
import java.util.Currency
import org.json.JSONObject

internal fun groupedIban(value:String)=value.chunked(4).joinToString(" ")

@Composable
internal fun TransferDetails(details:JSONObject){
    val iban=details.getString("iban")
    val currency=details.getString("currency")
    val digits=Currency.getInstance(currency).defaultFractionDigits.coerceAtLeast(0)
    val amount=BigDecimal.valueOf(details.getLong("amountMinor"),digits).toPlainString()
    Text(stringResource(R.string.finance_transfer),style=MaterialTheme.typography.titleMedium)
    if(details.getBoolean("bankChanged"))Text(stringResource(R.string.finance_bank_changed))
    CopyValue(stringResource(R.string.finance_beneficiary),details.getString("beneficiary"))
    CopyValue(stringResource(R.string.finance_iban),iban,groupedIban(iban))
    CopyValue(stringResource(R.string.finance_amount),amount,"$amount $currency")
    CopyValue(stringResource(R.string.finance_reference),details.getString("reference"))
    Text(stringResource(R.string.finance_external))
}
