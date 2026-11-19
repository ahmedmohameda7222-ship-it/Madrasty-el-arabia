package de.madrasty.app.ui

import android.content.ClipData
import android.content.ClipboardManager
import android.os.Build
import android.os.PersistableBundle
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import de.madrasty.app.R
import java.math.BigDecimal
import java.text.NumberFormat
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Currency
import java.util.Locale

fun isolate(value: String) = "\u2068$value\u2069"
private fun leftToRight(value: String) = "\u2066$value\u2069"

fun formatSchoolDate(date: String, locale: Locale): String =
    LocalDate.parse(date).format(DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM).withLocale(locale))

fun formatMoney(minorUnits: Long, currencyCode: String, locale: Locale): String {
    val currency = Currency.getInstance(currencyCode)
    val scale = currency.defaultFractionDigits.coerceAtLeast(0)
    return NumberFormat.getCurrencyInstance(locale).apply {
        this.currency = currency
        minimumFractionDigits = scale
        maximumFractionDigits = scale
    }.format(BigDecimal.valueOf(minorUnits, scale))
}

@Composable
internal fun ConfirmedAt(value: String) {
    val locales = LocalContext.current.resources.configuration.locales
    val locale = Locale.forLanguageTag(if (locales[0].language == "de") "de" else "ar")
    val formatted = DateTimeFormatter.ofLocalizedDateTime(FormatStyle.SHORT).withLocale(locale)
        .withZone(ZoneId.systemDefault()).format(Instant.parse(value))
    Text("${stringResource(R.string.confirmed_at)} ${isolate(formatted)}", style = MaterialTheme.typography.bodySmall)
}

@Composable
fun CopyValue(label: String, value: String, display: String = value) {
    val clipboard = LocalContext.current.getSystemService(ClipboardManager::class.java)
    val description = stringResource(R.string.copy_value, label)
    var copied by remember(value) { mutableStateOf(false) }
    Column {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(label, style = MaterialTheme.typography.bodySmall)
                SelectionContainer { Text(leftToRight(display)) }
            }
            TextButton(
                onClick = {
                    val clip = ClipData.newPlainText(label, value)
                    clip.description.extras = PersistableBundle().apply {
                        putBoolean("android.content.extra.IS_SENSITIVE", true)
                    }
                    clipboard.setPrimaryClip(clip)
                    copied = Build.VERSION.SDK_INT < 33
                },
                modifier = Modifier.semantics { contentDescription = description },
            ) { Text(stringResource(R.string.copy)) }
        }
        if (copied) Text(stringResource(R.string.copied_value, label),
            Modifier.semantics { liveRegion = LiveRegionMode.Polite }, style = MaterialTheme.typography.bodySmall)
    }
}
