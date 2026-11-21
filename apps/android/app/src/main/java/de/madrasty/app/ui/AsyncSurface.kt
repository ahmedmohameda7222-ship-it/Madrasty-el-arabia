package de.madrasty.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.foundation.focusable
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import de.madrasty.app.R
import kotlinx.coroutines.delay

sealed interface AsyncState<out T> {
    data class InitialLoading(val shape: SkeletonShape = SkeletonShape.List) : AsyncState<Nothing>
    data class Refreshing<T>(val content: T, val confirmedAt: String? = null) : AsyncState<T>
    data class Ready<T>(val content: T) : AsyncState<T>
    data class Empty(val filtered: Boolean = false, val clear: (() -> Unit)? = null) : AsyncState<Nothing>
    data class Error(val retry: () -> Unit, val message: String? = null) : AsyncState<Nothing>
    data class Offline(val retry: () -> Unit) : AsyncState<Nothing>
    data class Stale<T>(val content: T, val confirmedAt: String, val retry: () -> Unit) : AsyncState<T>
    data class OfflineDraft<T>(val content: T, val confirmedAt: String? = null) : AsyncState<T>
    data class Conflict<T>(val content: T) : AsyncState<T>
    data class ReadOnly<T>(val content: T, val reason: String? = null) : AsyncState<T>
    data class Forbidden(val returnToAllowed: (() -> Unit)? = null) : AsyncState<Nothing>
}

enum class SkeletonShape(val rows: Int, val rowHeight: Int) {
    List(4, 54), Card(2, 60), Detail(4, 66)
}

@Composable
fun <T> AsyncSurface(state: AsyncState<T>, content: @Composable (T) -> Unit) {
    when (state) {
        is AsyncState.InitialLoading -> ColdLoad(state.shape)
        is AsyncState.Ready -> content(state.content)
        is AsyncState.Refreshing -> {
            DelayedRefresh()
            state.confirmedAt?.let { ConfirmedAt(it) }
            content(state.content)
        }
        is AsyncState.Empty -> Notice(
            stringResource(if (state.filtered) R.string.filtered_empty else R.string.empty),
            if (state.clear != null) stringResource(R.string.clear_filter) else null, state.clear,
        )
        is AsyncState.Error -> Notice(
            state.message ?: stringResource(R.string.generic_error), stringResource(R.string.retry), state.retry,
        )
        is AsyncState.Offline -> Notice(stringResource(R.string.offline), stringResource(R.string.retry), state.retry)
        is AsyncState.Stale -> {
            Notice(stringResource(R.string.generic_error), stringResource(R.string.retry), state.retry)
            ConfirmedAt(state.confirmedAt)
            content(state.content)
        }
        is AsyncState.OfflineDraft -> {
            Notice(stringResource(R.string.offline_draft))
            state.confirmedAt?.let { ConfirmedAt(it) }
            content(state.content)
        }
        is AsyncState.Conflict -> {
            Notice(stringResource(R.string.conflict))
            content(state.content)
        }
        is AsyncState.ReadOnly -> {
            Notice(state.reason ?: stringResource(R.string.read_only))
            content(state.content)
        }
        is AsyncState.Forbidden -> {
            val focus = remember { FocusRequester() }
            Notice(stringResource(R.string.forbidden), stringResource(R.string.back),
                state.returnToAllowed, Modifier.focusRequester(focus).focusable())
            LaunchedEffect(focus) { focus.requestFocus() }
        }
    }
}

@Composable
private fun ColdLoad(shape: SkeletonShape) {
    var elapsed by remember { mutableStateOf(0) }
    LaunchedEffect(Unit) {
        delay(180)
        elapsed = 180
        delay(7_820)
        elapsed = 8_000
    }
    if (elapsed > 0) {
        Column(
            Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surface, RoundedCornerShape(16.dp))
                .padding(horizontal = 16.dp).clearAndSetSemantics {},
        ) {
            repeat(shape.rows) {
                Column(Modifier.height(shape.rowHeight.dp), verticalArrangement = Arrangement.spacedBy(8.dp, androidx.compose.ui.Alignment.CenterVertically)) {
                    SkeletonBar(0.55f, 13)
                    SkeletonBar(0.34f, 10)
                }
            }
        }
    }
    val message = stringResource(if (elapsed == 8_000) R.string.still_loading else R.string.loading)
    if (elapsed == 8_000) {
        Text(message, Modifier.semantics { liveRegion = LiveRegionMode.Polite })
    } else {
        Box(Modifier.semantics {
            liveRegion = LiveRegionMode.Polite
            androidx.compose.ui.semantics.SemanticsProperties.ContentDescription.let { this[it] = listOf(message) }
        })
    }
}

@Composable
private fun SkeletonBar(width: Float, height: Int) {
    Box(Modifier.fillMaxWidth(width).height(height.dp)
        .background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(8.dp)))
}

@Composable
private fun DelayedRefresh() {
    var visible by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { delay(180); visible = true }
    if (visible) Text(stringResource(R.string.refreshing), Modifier.semantics { liveRegion = LiveRegionMode.Polite },
        style = MaterialTheme.typography.bodySmall)
}

@Composable
private fun Notice(message: String, actionLabel: String? = null, action: (() -> Unit)? = null, modifier: Modifier = Modifier) {
    Surface(modifier.fillMaxWidth(), shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surfaceVariant) {
        Column(Modifier.padding(16.dp)) {
            Text(message, Modifier.semantics { liveRegion = LiveRegionMode.Polite })
            if (actionLabel != null && action != null) TextButton(onClick = action) { Text(actionLabel) }
        }
    }
}
