package com.wynh.lingomage.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.foundation.layout.Box
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.wynh.lingomage.auth.AuthPhase
import com.wynh.lingomage.auth.AuthState
import com.wynh.lingomage.model.TargetLanguage

@Composable
fun AuthenticationScreen(
    auth: AuthState,
    probe: ProbeState,
    onSignIn: (String?) -> Unit,
    onCancelSignIn: () -> Unit,
    onSelectAccount: (String) -> Unit,
    onLoadModels: () -> Unit,
    onChooseModel: (String) -> Unit,
    onCheck: () -> Unit,
    onCancelCheck: () -> Unit,
    onSignOut: () -> Unit,
    onReset: () -> Unit,
    onChooseReasoning: (String?) -> Unit = {}
) {
    var confirmReset by remember { mutableStateOf(false) }
    val idle = auth.phase == AuthPhase.IDLE && !probe.busy
    val active = auth.accounts.firstOrNull { it.clientId == auth.activeClientId }
    Scaffold { padding ->
        Column(Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Text("LingoMage", style = MaterialTheme.typography.headlineLarge)
            Text("Small stories. New words.", style = MaterialTheme.typography.titleMedium)
            Text(TargetLanguage.entries.joinToString(" · ") { it.displayName }, style = MaterialTheme.typography.bodyMedium)
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text("Connect your ChatGPT account", style = MaterialTheme.typography.titleLarge)
                    Text("Eligible requests use your ChatGPT plan. Manage access and usage in ChatGPT settings.")
                    Text("Connect to create new stories. Saved stories are available offline in your library.")
                    Button(onClick = { onSignIn(null) }, enabled = idle && !auth.storageFailed, modifier = Modifier.fillMaxWidth()) {
                        Text(if (auth.accounts.isEmpty()) "Continue with ChatGPT" else "Add a ChatGPT account")
                    }
                    auth.message?.let { Text(it) }
                    if (auth.phase != AuthPhase.IDLE) {
                        CircularProgressIndicator()
                        if (auth.phase == AuthPhase.WAITING_FOR_BROWSER || auth.phase == AuthPhase.EXCHANGING) {
                            OutlinedButton(onClick = onCancelSignIn) { Text("Cancel sign-in") }
                        }
                    }
                    if (auth.storageFailed) {
                        OutlinedButton(onClick = { confirmReset = true }, enabled = idle) { Text("Reset local sign-in data") }
                    }
                }
            }
            if (auth.accounts.isNotEmpty()) {
                Text("Saved accounts", style = MaterialTheme.typography.titleLarge)
                auth.accounts.forEach { account ->
                    Card(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Row {
                                RadioButton(selected = account.clientId == auth.activeClientId,
                                    onClick = { onSelectAccount(account.clientId) }, enabled = idle)
                                Column(Modifier.padding(top = 8.dp)) {
                                    Text(account.label)
                                    Text(if (account.signedIn) "Signed in" else "Signed out")
                                }
                            }
                            OutlinedButton(onClick = { onSignIn(account.clientId) }, enabled = idle) { Text("Sign in again") }
                        }
                    }
                }
            }
            if (active?.canInfer == true) {
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Text("Check the connection", style = MaterialTheme.typography.titleLarge)
                        Text("Load your available models, then send one small request using your ChatGPT plan.")
                        OutlinedButton(onClick = onLoadModels, enabled = idle) { Text("Load available models") }
                        probe.models.forEach { model ->
                            Row {
                                RadioButton(selected = probe.selectedModel == model.slug,
                                    onClick = { onChooseModel(model.slug) }, enabled = idle)
                                Text(model.displayName, Modifier.padding(top = 12.dp))
                            }
                        }
                        probe.models.firstOrNull { it.slug == probe.selectedModel }?.let { model ->
                            var expanded by remember(model.slug) { mutableStateOf(false) }
                            Text("Reasoning level", style = MaterialTheme.typography.titleMedium)
                            Box {
                                OutlinedButton(onClick = { expanded = true }, enabled = idle && model.reasoningLevels.isNotEmpty()) {
                                    Text(probe.reasoning?.replaceFirstChar { it.uppercase() } ?: "Model default")
                                }
                                DropdownMenu(expanded, { expanded = false }) {
                                    DropdownMenuItem(text = { Text("Model default") }, onClick = { onChooseReasoning(null); expanded = false })
                                    model.reasoningLevels.forEach { effort ->
                                        DropdownMenuItem(text = { Text(effort.replaceFirstChar { it.uppercase() }) },
                                            onClick = { onChooseReasoning(effort); expanded = false })
                                    }
                                }
                            }
                            Text(if (model.reasoningLevels.isEmpty()) "This model uses its default reasoning." else "Higher levels may take longer and use more of your plan.")
                        }
                        Button(onClick = onCheck, enabled = idle && probe.selectedModel != null) { Text("Run inference check") }
                        if (probe.busy) {
                            CircularProgressIndicator()
                            TextButton(onClick = onCancelCheck) { Text("Cancel request") }
                        }
                        probe.response?.let {
                            Text("Inference completed", style = MaterialTheme.typography.titleMedium)
                            Text(it)
                        }
                    }
                }
            }
            probe.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            if (active?.signedIn == true) OutlinedButton(onClick = onSignOut, enabled = idle) { Text("Sign out") }
            Text("English interface and glossary explanations. Beginner difficulty is an estimate; LingoMage does not claim certified CEFR alignment or proven learning outcomes.",
                style = MaterialTheme.typography.bodySmall)
        }
    }
    if (confirmReset) AlertDialog(onDismissRequest = { confirmReset = false },
        title = { Text("Reset local sign-in data?") },
        text = { Text("This removes unreadable local credentials. Remote access will not be revoked; you can disconnect old registrations in ChatGPT settings.") },
        confirmButton = { TextButton(onClick = { confirmReset = false; onReset() }) { Text("Reset") } },
        dismissButton = { TextButton(onClick = { confirmReset = false }) { Text("Cancel") } })
}
