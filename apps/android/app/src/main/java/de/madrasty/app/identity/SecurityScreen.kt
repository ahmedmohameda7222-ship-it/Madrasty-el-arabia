package de.madrasty.app.identity

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import de.madrasty.app.BuildConfig
import de.madrasty.app.R
import de.madrasty.app.ui.Persona

@Composable
fun RecoveryLink() {
    val context = LocalContext.current
    val locale = if (LocalConfiguration.current.locales[0].language == "de") "de" else "ar"
    TextButton(onClick = {
        val uri = Uri.parse("${BuildConfig.API_ORIGIN}/$locale/account/security/recover")
        context.startActivity(Intent(Intent.ACTION_VIEW, uri))
    }) { Text(stringResource(R.string.recovery)) }
}

@Composable
fun SecurityScreen(model: IdentityViewModel, session: SchoolSession, close: () -> Unit) {
    val isAdmin = session.actor.persona == Persona.Admin
    val unverified = isAdmin && session.assurance != "aal2"
    var code by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    LaunchedEffect(session.actor) { if (isAdmin) model.loadFactors() }

    Column(
        Modifier.fillMaxSize().safeDrawingPadding().imePadding().verticalScroll(rememberScrollState()).padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(stringResource(R.string.security), Modifier.semantics { heading() }, style = MaterialTheme.typography.headlineMedium)
        if (!unverified) TextButton(onClick = close) { Text(stringResource(R.string.back)) }
        if (isAdmin) {
            Text(stringResource(if (unverified) R.string.mfa_required else R.string.verified),
                Modifier.semantics { heading() }, style = MaterialTheme.typography.titleLarge)
            val factor = model.enrollment?.id ?: model.verifiedFactor
            if (factor == null && model.factorsLoaded) {
                Button(enabled = !model.pending, onClick = model::enrollFactor) {
                    Text(stringResource(R.string.mfa_setup))
                }
            }
            if (!model.factorsLoaded && model.failure != null) {
                TextButton(onClick = model::loadFactors) { Text(stringResource(R.string.retry)) }
            }
            model.enrollment?.let { registration ->
                Text(stringResource(R.string.mfa_hint))
                SelectionContainer { Text("\u2066${registration.secret}\u2069") }
            }
            if (factor != null) {
                OutlinedTextField(
                    value = code, onValueChange = { code = it.filter { digit -> digit in '0'..'9' }.take(6) },
                    label = { Text(stringResource(R.string.mfa_code)) }, modifier = Modifier.fillMaxWidth(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
                    singleLine = true,
                )
                Button(enabled = code.length == 6 && !model.pending, onClick = {
                    model.verifyFactor(factor, code)
                    code = ""
                }) { Text(stringResource(R.string.confirm)) }
            }
        }
        if (!unverified) {
            Text(stringResource(R.string.email_change), Modifier.semantics { heading() }, style = MaterialTheme.typography.titleLarge)
            OutlinedTextField(email, { email = it }, modifier = Modifier.fillMaxWidth(),
                label = { Text(stringResource(R.string.new_email)) }, singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email))
            OutlinedTextField(password, { password = it }, modifier = Modifier.fillMaxWidth(),
                label = { Text(stringResource(R.string.password)) }, singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                visualTransformation = PasswordVisualTransformation())
            Button(onClick = { model.requestEmailChange(email, password); password = "" },
                enabled = !model.pending && email.isNotBlank() && password.isNotEmpty()) {
                Text(stringResource(R.string.send_link))
            }
            if (model.sentEmail) Text(stringResource(R.string.email_sent), Modifier.semantics { liveRegion = LiveRegionMode.Polite })
        }
        if (unverified) TextButton(onClick = { model.signOut(false) }, enabled = !model.pending) {
            Text(stringResource(R.string.sign_out))
        }
        model.failure?.let { Text(stringResource(it), Modifier.semantics { liveRegion = LiveRegionMode.Polite }) }
    }
}
