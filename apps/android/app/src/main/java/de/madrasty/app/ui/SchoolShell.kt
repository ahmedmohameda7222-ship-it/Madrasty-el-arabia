package de.madrasty.app.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Image
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
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
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
    More(R.string.nav_more, R.drawable.ic_more),
}

private fun tabsFor(persona: Persona): List<SchoolTab> {
    val second = when (persona) {
        Persona.Admin -> SchoolTab.Students
        Persona.Teacher -> SchoolTab.Attendance
        Persona.Guardian -> SchoolTab.Children
    }
    return listOf(SchoolTab.Home, second, SchoolTab.Messages, SchoolTab.More)
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
            topBar = {
                TopAppBar(
                    title = {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Image(painterResource(R.drawable.school_seal), null, Modifier.size(36.dp))
                            Text(stringResource(R.string.app_name), Modifier.semantics { heading() })
                        }
                    },
                    actions = {
                        notificationAction()
                        InterfaceSettingsAction()
                        if (choices.isNotEmpty()) {
                            TextButton(onClick = { pickerVisible = true }) { Text(stringResource(R.string.choose_scope)) }
                        }
                    },
                )
            },
            bottomBar = {
                NavigationBar(containerColor = MaterialTheme.colorScheme.surface) {
                    tabs.forEach { tab ->
                        NavigationBarItem(
                            selected = active == tab,
                            onClick = { changeTab(tab) },
                            icon = { SchoolIcon(tab.icon) },
                            label = { Text(stringResource(tab.label), softWrap = true) },
                        )
                    }
                }
            },
        ) { insets ->
            Box(Modifier.fillMaxSize().padding(insets).imePadding()) {
                states.SaveableStateProvider(active.name) {
                    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
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

@Composable
private fun SchoolIcon(icon: Int) {
    androidx.compose.material3.Icon(painterResource(icon), null, Modifier.size(24.dp))
}
