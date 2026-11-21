package de.madrasty.app.navigation

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import de.madrasty.app.BuildConfig
import de.madrasty.app.R
import de.madrasty.app.identity.IdentityViewModel
import de.madrasty.app.ui.isolate
import kotlinx.coroutines.CancellationException

@Composable
internal fun ReleaseVersionGate(model: IdentityViewModel, content: @Composable () -> Unit) {
    var available by remember { mutableStateOf<AndroidClientVersions?>(null) }
    LaunchedEffect(model.attendanceNetworkRevision) {
        try {
            available = model.currentAndroidRelease().takeIf {
                it.minimumVersionCode in 1..it.suggestedVersionCode && it.suggestedVersionCode <= 2_100_000_000 &&
                    it.downloadUrl == BuildConfig.API_ORIGIN + "/download/android" && it.sha256.matches(Regex("[a-f0-9]{64}"))
            }
        } catch (error: CancellationException) {
            throw error
        } catch (_: Exception) {
            // Previously confirmed policy stays visible while the connection is unavailable.
        }
    }
    val release = available
    if (release == null || BuildConfig.VERSION_CODE >= release.suggestedVersionCode) {
        content()
        return
    }
    val mandatory = BuildConfig.VERSION_CODE < release.minimumVersionCode
    val context = LocalContext.current
    var failed by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxSize()) {
        val inset = if (mandatory) Modifier.safeDrawingPadding().padding(20.dp) else Modifier.safeDrawingPadding().padding(horizontal = 12.dp)
        Column(inset, verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(
                stringResource(if (mandatory) R.string.android_upgrade_required else R.string.android_upgrade_available) +
                    " · " + isolate(release.suggestedVersionName),
                style = MaterialTheme.typography.titleMedium,
            )
            TextButton(onClick = {
                failed = runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(release.downloadUrl))) }.isFailure
            }) { Text(stringResource(R.string.android_upgrade_download)) }
            if (failed) Text(stringResource(R.string.android_upgrade_browser))
        }
        if (!mandatory) content()
    }
}
