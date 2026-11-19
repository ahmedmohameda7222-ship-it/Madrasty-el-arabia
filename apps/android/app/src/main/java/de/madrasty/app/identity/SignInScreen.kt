package de.madrasty.app.identity

import android.app.Application
import android.net.Uri
import android.net.ConnectivityManager
import android.net.Network
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
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
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import de.madrasty.app.R
import de.madrasty.app.ui.Persona
import de.madrasty.app.ui.SchoolShell
import de.madrasty.app.ui.SchoolTab
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

class IdentityViewModel(application: Application) : AndroidViewModel(application) {
    private val repository = AuthRepository(application)
    var session by mutableStateOf<SchoolSession?>(null)
        private set
    var pending by mutableStateOf(true)
        private set
    var failure by mutableStateOf<Int?>(null)
        private set
    private var initialized = false

    private val connectivity = application.getSystemService(ConnectivityManager::class.java)
    private val networkCallback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) {
            viewModelScope.launch {
                try {
                    repository.retrySignOut()
                    if (failure == R.string.sign_out_pending) failure = null
                } catch (error: CancellationException) {
                    throw error
                } catch (_: Exception) {
                    // Keep the pending operation for the next available network.
                }
            }
        }
    }

    init {
        connectivity?.registerDefaultNetworkCallback(networkCallback)
    }

    override fun onCleared() {
        connectivity?.unregisterNetworkCallback(networkCallback)
        super.onCleared()
    }


    fun open(callback: Uri?) {
        if (callback == null && initialized) return
        initialized = true
        run(if (callback == null) R.string.auth_unavailable else R.string.sign_in_failed) {
            session = if (callback == null) repository.restore() else repository.completeLink(callback)
        }
    }

    fun signIn(email: String, password: String) = run(R.string.sign_in_failed) {
        session = repository.signIn(email, password)
    }

    fun switch(persona: Persona) = run(R.string.auth_unavailable) {
        session = repository.switchPersona(persona)
    }

    fun signOut(all: Boolean) {
        session = null
        run(R.string.sign_out_pending) { repository.signOut(all) }
    }

    private fun run(fallback: Int, action: suspend () -> Unit) {
        pending = true
        failure = null
        viewModelScope.launch {
            try {
                action()
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                failure = if (error is HttpFailure && error.status >= 500 && fallback == R.string.sign_in_failed)
                    R.string.auth_unavailable else fallback
            } finally {
                pending = false
            }
        }
    }
}

@Composable
fun IdentityScreen(model: IdentityViewModel, callback: Uri?, consumed: () -> Unit) {
    LaunchedEffect(callback) {
        model.open(callback)
        if (callback != null) consumed()
    }
    val session = model.session
    if (session == null) SignInScreen(model) else SchoolShell(session.actor) { tab ->
        Text(stringResource(tab.label), Modifier.semantics { heading() }, style = MaterialTheme.typography.headlineMedium)
        if (tab == SchoolTab.Home) Text(stringResource(personaLabel(session.actor.persona)))
        if (tab == SchoolTab.More) AccountActions(model, session)
    }
}

@Composable
private fun SignInScreen(model: IdentityViewModel) {
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var visible by remember { mutableStateOf(false) }
    Column(
        Modifier.fillMaxSize().safeDrawingPadding().imePadding().verticalScroll(rememberScrollState()).padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Image(painterResource(R.drawable.school_seal), null, Modifier.size(64.dp))
        Text(stringResource(R.string.app_name), style = MaterialTheme.typography.titleLarge)
        Text(stringResource(R.string.sign_in), Modifier.semantics { heading() }, style = MaterialTheme.typography.headlineMedium)
        OutlinedTextField(email, { email = it }, label = { Text(stringResource(R.string.email)) },
            modifier = Modifier.fillMaxWidth(), singleLine = true, enabled = !model.pending,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email))
        OutlinedTextField(password, { password = it }, label = { Text(stringResource(R.string.password)) },
            modifier = Modifier.fillMaxWidth(), singleLine = true, enabled = !model.pending,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
            visualTransformation = if (visible) VisualTransformation.None else PasswordVisualTransformation(),
            trailingIcon = { TextButton(onClick = { visible = !visible }) {
                Text(stringResource(if (visible) R.string.hide_password else R.string.show_password))
            } })
        model.failure?.let { Text(stringResource(it), Modifier.semantics { liveRegion = LiveRegionMode.Polite }) }
        Button(
            onClick = { model.signIn(email, password); password = ""; visible = false },
            enabled = !model.pending && email.isNotBlank() && password.isNotEmpty(),
            modifier = Modifier.fillMaxWidth(),
        ) { Text(stringResource(if (model.pending) R.string.loading else R.string.sign_in)) }
    }
}

@Composable
private fun AccountActions(model: IdentityViewModel, session: SchoolSession) {
    var revoke by remember { mutableStateOf<Boolean?>(null) }
    var chosen by remember { mutableStateOf<Persona?>(null) }
    if (session.personas.size > 1) {
        Text(stringResource(R.string.change_persona))
        session.personas.filter { it != session.actor.persona }.forEach { persona ->
            TextButton(onClick = { chosen = persona }, enabled = !model.pending) {
                Text(stringResource(personaLabel(persona)))
            }
        }
    }
    TextButton(onClick = { revoke = false }, enabled = !model.pending) { Text(stringResource(R.string.sign_out)) }
    TextButton(onClick = { revoke = true }, enabled = !model.pending) { Text(stringResource(R.string.sign_out_all)) }
    model.failure?.let { Text(stringResource(it), Modifier.semantics { liveRegion = LiveRegionMode.Polite }) }

    if (revoke != null || chosen != null) {
        val cancelling = { revoke = null; chosen = null }
        AlertDialog(
            onDismissRequest = cancelling,
            text = { Text(stringResource(if (revoke == null) R.string.switch_notice else R.string.sign_out_confirm)) },
            confirmButton = { TextButton(onClick = {
                revoke?.let(model::signOut)
                chosen?.let(model::switch)
                cancelling()
            }) { Text(stringResource(R.string.confirm)) } },
            dismissButton = { TextButton(onClick = cancelling) { Text(stringResource(R.string.cancel)) } },
        )
    }
}

private fun personaLabel(persona: Persona): Int = when (persona) {
    Persona.Admin -> R.string.persona_admin
    Persona.Teacher -> R.string.persona_teacher
    Persona.Guardian -> R.string.persona_guardian
}
