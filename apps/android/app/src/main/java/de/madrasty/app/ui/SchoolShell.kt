package de.madrasty.app.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Surface
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Badge
import androidx.compose.material3.NavigationBarDefaults
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.saveable.rememberSaveableStateHolder
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import de.madrasty.app.R

enum class Persona { Admin, Teacher, Guardian }

data class SchoolPartition(val accountId: String, val sessionId: String, val persona: Persona)
data class ScopeOption(val id: String, val label: String, val detail: String? = null)

enum class SchoolTab(val label: Int, val icon: Int) {
    Home(R.string.nav_home, R.drawable.ic_home),
    Students(R.string.nav_students, R.drawable.ic_people),
    Attendance(R.string.nav_attendance, R.drawable.ic_attendance),
    Children(R.string.nav_children, R.drawable.ic_people),
    Messages(R.string.nav_messages, R.drawable.ic_messages),
    Calendar(R.string.comms_calendar, R.drawable.ic_calendar),
    More(R.string.nav_more, R.drawable.ic_more),
}

private fun tabsFor(persona: Persona): List<SchoolTab> {
    val second = when (persona) {
        Persona.Admin -> SchoolTab.Students
        Persona.Teacher -> SchoolTab.Attendance
        Persona.Guardian -> SchoolTab.Children
    }
    return listOf(SchoolTab.Home, second, SchoolTab.Messages, SchoolTab.Calendar, SchoolTab.More)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SchoolShell(
    actor: SchoolPartition,
    selected: SchoolTab,
    changeTab: (SchoolTab) -> Unit,
    selectedScope: ScopeOption? = null,
    choices: List<ScopeOption> = emptyList(),
    selectScope: (String) -> Unit = {},
    notificationAction: @Composable () -> Unit = {},
    mayManageStudents: Boolean = true,
    scrollContent: Boolean = true,
    floatingAction: @Composable () -> Unit = {},
    unreadMessages: Int = 0,
    content: @Composable (SchoolTab) -> Unit,
) {
    key(actor.accountId, actor.sessionId, actor.persona) {
        val tabs = tabsFor(actor.persona).filter { it != SchoolTab.Students || mayManageStudents }
        val active = selected.takeIf { it in tabs } ?: SchoolTab.Home
        var pickerVisible by rememberSaveable { mutableStateOf(false) }
        val states = rememberSaveableStateHolder()
        BackHandler(enabled = selected != SchoolTab.Home && !pickerVisible) { changeTab(SchoolTab.Home) }

        Scaffold(
            contentWindowInsets = WindowInsets.safeDrawing,
            containerColor = MaterialTheme.colorScheme.background,
            floatingActionButton = floatingAction,
            topBar = {
                SchoolShellHeader(active, choices.isNotEmpty(), { pickerVisible = true }, notificationAction)
            },
            bottomBar = {
                SchoolShellNavigation(tabs, active, changeTab, unreadMessages)
            },
        ) { insets ->
            Box(Modifier.fillMaxSize().padding(insets).imePadding()) {
                states.SaveableStateProvider(active.name) {
                    val scroll=rememberScrollState()
                    Column(Modifier.fillMaxSize().then(if(scrollContent)Modifier.verticalScroll(scroll) else Modifier).padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(16.dp)) {
                        selectedScope?.let { Text(isolate(it.label), style = MaterialTheme.typography.bodySmall) }
                        content(active)
                    }
                }
            }
        }

        if (pickerVisible) {
            ModalBottomSheet(onDismissRequest = { pickerVisible = false }) {
                Column(Modifier.verticalScroll(rememberScrollState()).padding(16.dp)) {
                    Text(stringResource(R.string.choose), Modifier.semantics { heading() })
                    TextButton(onClick = { pickerVisible = false }) { Text(stringResource(R.string.close)) }
                    choices.forEach { option ->
                        androidx.compose.material3.FilterChip(
                            selected = option.id == selectedScope?.id,
                            onClick = { selectScope(option.id); pickerVisible = false },
                            label = {
                                Column {
                                    Text(isolate(option.label))
                                    option.detail?.let { Text(isolate(it), style = MaterialTheme.typography.bodySmall) }
                                }
                            },
                        )
                    }
                }
            }
        }
    }
}


/** Grow with system type instead of forcing the title into a fixed-height app bar. */
@OptIn(ExperimentalLayoutApi::class, ExperimentalMaterial3Api::class)
@Composable
private fun SchoolShellHeader(
    active: SchoolTab,
    hasChoices: Boolean,
    openScope: () -> Unit,
    notificationAction: @Composable () -> Unit,
) {
    val branded = active != SchoolTab.Messages && active != SchoolTab.Calendar
    val title = stringResource(if (branded) R.string.app_name else active.label)
    val scopeLabel = stringResource(R.string.choose_scope)
    val titleStyle = MaterialTheme.typography.titleLarge
    val actionStyle = MaterialTheme.typography.labelLarge
    val measurer = rememberTextMeasurer()
    val density = LocalDensity.current
    val titleNatural = with(density) {
        measurer.measure(AnnotatedString(title), style = titleStyle, softWrap = false, maxLines = 1).size.width.toDp()
    } + if (branded) 44.dp else 0.dp
    val scopeNatural = if (hasChoices) with(density) {
        measurer.measure(AnnotatedString(scopeLabel), style = actionStyle, softWrap = false, maxLines = 1).size.width.toDp()
    } + 32.dp else 0.dp
    Surface(color = MaterialTheme.colorScheme.surface) {
        BoxWithConstraints(Modifier.fillMaxWidth()
            .windowInsetsPadding(TopAppBarDefaults.windowInsets)
            .padding(horizontal = 12.dp, vertical = 4.dp)) {
            // Reserve both native icon touch targets; an absent optional action
            // merely leaves room rather than compressing the school name.
            val actionNatural = 96.dp + scopeNatural
            val inline = titleNatural + actionNatural + 8.dp <= maxWidth
            val titleWidth = if (inline) maxWidth - actionNatural - 8.dp else maxWidth
            val actionsWidth = if (inline) actionNatural else maxWidth
            FlowRow(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(0.dp),
            ) {
                Row(Modifier.width(titleWidth).heightIn(min = 48.dp),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (branded) Image(painterResource(R.drawable.school_seal), null, Modifier.size(36.dp))
                    Text(title, Modifier.weight(1f).semantics { heading() }, style = titleStyle)
                }
                FlowRow(Modifier.width(actionsWidth), horizontalArrangement = Arrangement.End,
                    verticalArrangement = Arrangement.Center) {
                    notificationAction()
                    InterfaceSettingsAction()
                    if (hasChoices) TextButton(onClick = openScope, modifier = Modifier.heightIn(min = 48.dp)) {
                        Text(scopeLabel, style = actionStyle)
                    }
                }
            }
        }
    }
}

/** Intrinsic label widths determine row breaks. All tabs remain visible and selectable. */
@Composable
private fun SchoolShellNavigation(
    tabs: List<SchoolTab>,
    active: SchoolTab,
    changeTab: (SchoolTab) -> Unit,
    unreadMessages: Int,
) {
    val labels = tabs.map { stringResource(it.label) }
    val style = MaterialTheme.typography.labelMedium
    val measurer = rememberTextMeasurer()
    val density = LocalDensity.current
    val labelLayouts = labels.map { label ->
        measurer.measure(AnnotatedString(label), style = style, softWrap = false, maxLines = 1)
    }
    val badgeText = if (unreadMessages > 99) "99+" else unreadMessages.toString()
    val badgeStyle = MaterialTheme.typography.labelSmall
    val badgeLayout = measurer.measure(AnnotatedString(badgeText), style = badgeStyle, softWrap = false, maxLines = 1)
    val badgeWidth = with(density) { badgeLayout.size.width.toDp() }
    val badgeHeight = with(density) { badgeLayout.size.height.toDp() } + 1.dp
    val minimums = labelLayouts.mapIndexed { index, layout ->
        with(density) {
            // The unread chip is a real sibling, not an overlapping glyph
            // inside a fixed 40x32 clipped icon. Reserve its intrinsic width.
            val iconWidth = if (tabs[index] == SchoolTab.Messages && unreadMessages > 0)
                24.dp + 4.dp + badgeWidth + 12.dp + 16.dp + 12.dp
            else 48.dp
            (layout.size.width.toDp() + 16.dp).coerceAtLeast(iconWidth).coerceAtLeast(48.dp).value
        }
    }
    Surface(color = MaterialTheme.colorScheme.surfaceContainerLow) {
        BoxWithConstraints(Modifier.fillMaxWidth()
            .windowInsetsPadding(NavigationBarDefaults.windowInsets)
            .padding(horizontal = 4.dp, vertical = 4.dp)) {
            val rows = mutableListOf<MutableList<Int>>()
            for (index in tabs.indices) {
                val last = rows.lastOrNull()
                if (last == null || last.sumOf { minimums[it].toDouble() } + minimums[index] > maxWidth.value) {
                    rows.add(mutableListOf(index))
                } else last.add(index)
            }
            // Avoid an isolated final tab when the preceding row can spare one.
            if (rows.size > 1 && rows.last().size == 1) {
                val previous = rows[rows.lastIndex - 1]
                val last = rows.last()
                if (previous.size >= 3 && minimums[previous.last()] + minimums[last.first()] <= maxWidth.value) {
                    last.add(0, previous.removeAt(previous.lastIndex))
                }
            }
            Column(Modifier.fillMaxWidth().selectableGroup()) {
                rows.forEach { indices ->
                    Row(Modifier.fillMaxWidth()) {
                        indices.forEach { index ->
                            val tab = tabs[index]
                            val selected = active == tab
                            Column(
                                Modifier.weight(minimums[index]).heightIn(min = 64.dp)
                                    .clip(MaterialTheme.shapes.medium)
                                    .selectable(selected = selected, onClick = { changeTab(tab) }, role = Role.Tab)
                                    .padding(horizontal = 6.dp, vertical = 4.dp),
                                horizontalAlignment = Alignment.CenterHorizontally,
                                verticalArrangement = Arrangement.spacedBy(2.dp, Alignment.CenterVertically),
                            ) {
                                val colors = MaterialTheme.colorScheme
                                val tint = if (selected) colors.onSecondaryContainer else colors.onSurfaceVariant
                                val indicator = if (selected) colors.secondaryContainer else colors.surfaceContainerLow
                                if (tab == SchoolTab.Messages && unreadMessages > 0) {
                                    val unreadLabel = stringResource(R.string.comms_unread_badge, unreadMessages)
                                    Row(Modifier.heightIn(min = 32.dp)
                                        .background(indicator, RoundedCornerShape(50))
                                        .padding(horizontal = 8.dp, vertical = 4.dp),
                                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                                        verticalAlignment = Alignment.CenterVertically) {
                                        SchoolIcon(tab.icon, tint)
                                        Badge(Modifier.semantics { contentDescription = unreadLabel }) {
                                            Text(badgeText, Modifier.heightIn(min = badgeHeight), style = badgeStyle,
                                                softWrap = false, maxLines = 1)
                                        }
                                    }
                                } else {
                                    Box(Modifier.size(width = 40.dp, height = 32.dp)
                                        .background(indicator, RoundedCornerShape(50)), contentAlignment = Alignment.Center) {
                                        SchoolIcon(tab.icon, tint)
                                    }
                                }
                                // Allocate the full measured line, including pixel-rounding headroom.
                                // Keep the system's actual type size and a centered, single readable label.
                                val lineHeight = with(density) { labelLayouts[index].size.height.toDp() } + 1.dp
                                Text(labels[index], Modifier.fillMaxWidth().heightIn(min = lineHeight),
                                    style = style, color = colors.onSurface, textAlign = TextAlign.Center,
                                    softWrap = false, maxLines = 1)
                            }
                        }
                    }
                }
            }
        }
    }
}
@Composable
private fun SchoolIcon(icon: Int, tint: androidx.compose.ui.graphics.Color) {
    androidx.compose.material3.Icon(painterResource(icon), null, Modifier.size(24.dp), tint = tint)
}
