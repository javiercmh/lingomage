package com.wynh.lingomage.ui

import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.wynh.lingomage.auth.AuthState
import com.wynh.lingomage.model.TargetLanguage
import com.wynh.lingomage.story.*

@Composable
fun LearningScreen(auth: AuthState, probe: ProbeState, authentication: AuthenticationViewModel,
    state: StoryState, stories: List<Story>, vm: StoryViewModel) {
    var tab by rememberSaveable { mutableIntStateOf(0) }
    var filter by rememberSaveable { mutableStateOf<String?>(null) }
    var deleteCandidate by remember { mutableStateOf<Story?>(null) }
    val busy = state.progress != null
    BackHandler(state.openStory != null) { vm.closeReader() }
    Scaffold(bottomBar = {
        NavigationBar {
            listOf("Create", "Library", "Settings").forEachIndexed { index, label ->
                NavigationBarItem(selected = tab == index, onClick = { vm.closeReader(); tab = index },
                    icon = { Text(listOf("✦", "▤", "⚙")[index]) }, label = { Text(label) })
            }
        }
    }) { padding ->
        val story = state.openStory
        if (story != null) {
            Column(Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).padding(24.dp),
                verticalArrangement = Arrangement.spacedBy(20.dp)) {
                TextButton(onClick = vm::closeReader) { Text("Back") }
                Text("${story.language.displayName} · Beginner story", style = MaterialTheme.typography.labelLarge)
                FuriganaText(story.title, story.titleAnnotations, MaterialTheme.typography.headlineMedium)
                FuriganaText(story.text, story.annotations, MaterialTheme.typography.bodyLarge.copy(fontSize = androidx.compose.ui.unit.TextUnit(22f, androidx.compose.ui.unit.TextUnitType.Sp)))
                Text("Words in this story", style = MaterialTheme.typography.titleLarge)
                story.glossary.forEach { entry ->
                    Card(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            val ruby = if (entry.reading != null && ScriptRules.hasKanji(entry.headword)) listOf(Furigana(0, entry.headword.length, entry.reading)) else emptyList()
                            FuriganaText(entry.headword, ruby, MaterialTheme.typography.titleMedium)
                            SelectionContainer { Text(entry.meaning) }
                            if (story.language == TargetLanguage.JAPANESE) {
                                Text("In the story:", style = MaterialTheme.typography.bodySmall)
                                entry.usedForms.forEach { form ->
                                    val offset = story.text.indexOf(form)
                                    val overlapping = story.annotations.filter { it.start < offset + form.length && it.end > offset }
                                    val start = minOf(offset, overlapping.minOfOrNull { it.start } ?: offset)
                                    val end = maxOf(offset + form.length, overlapping.maxOfOrNull { it.end } ?: offset + form.length)
                                    FuriganaText(story.text.substring(start, end), overlapping.map { it.copy(start = it.start - start, end = it.end - start) }, MaterialTheme.typography.bodyMedium)
                                }
                            } else SelectionContainer { Text("In the story: ${entry.usedForms.joinToString(", ")}", style = MaterialTheme.typography.bodySmall) }
                        }
                    }
                }
                OutlinedButton(onClick = { vm.reuse(story); tab = 0 }, enabled = !busy) { Text("Create another story with these words") }
                Text("Difficulty is an estimate. Generated text can contain mistakes; learning effectiveness has not been established.", style = MaterialTheme.typography.bodySmall)
            }
        } else if (tab == 2) {
            Box(Modifier.fillMaxSize().padding(padding)) { AuthenticationScreen(auth, probe.copy(busy = probe.busy || busy), authentication::signIn, authentication.auth::cancelSignIn,
                authentication::selectAccount, authentication::loadModels, authentication::chooseModel,
                authentication::checkInference, authentication::cancelProbe, authentication::signOut,
                authentication::resetCredentials, authentication::chooseReasoning) }
        } else {
            Column(Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).padding(24.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Text("LingoMage", style = MaterialTheme.typography.headlineLarge)
                Text(if (tab == 0) "Small stories. New words." else "Your story library", style = MaterialTheme.typography.titleMedium)
                if (tab == 0) {
                    Text("Target language", style = MaterialTheme.typography.labelLarge)
                    LanguagePicker(state.language, !busy, vm::language)
                    Text("Beginner · English glossary", style = MaterialTheme.typography.bodySmall)
                    OutlinedTextField(state.topic, vm::topic, label = { Text("Topic (optional)") }, singleLine = true,
                        enabled = !busy, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(state.words, vm::words, label = { Text("5–10 vocabulary items") },
                        supportingText = { Text("One item per line, or separate with commas. Edit suggestions before confirming.") },
                        minLines = 5, maxLines = 10, enabled = !busy, modifier = Modifier.fillMaxWidth())
                    val connected = auth.accounts.any { it.clientId == auth.activeClientId && it.canInfer }
                    OutlinedButton(onClick = { vm.suggest(probe.selectedModel) }, enabled = !busy && connected && probe.selectedModel != null) { Text("Suggest beginner words") }
                    OutlinedButton(onClick = vm::confirm, enabled = !busy && state.unsaved == null) { Text(if (state.confirmed) "Vocabulary confirmed" else "Confirm vocabulary") }
                    if (state.unsaved != null) {
                        Button(onClick = vm::retrySave, enabled = !busy) { Text("Save completed story") }
                    } else Button(onClick = { vm.generate(probe.selectedModel) }, enabled = !busy && state.confirmed && connected && probe.selectedModel != null) { Text("Create story") }
                    if (!connected) {
                        Text("Connect ChatGPT in Settings to create stories. Your library is available offline.")
                        TextButton(onClick = { tab = 2 }) { Text("Open Settings") }
                    } else if (probe.selectedModel == null) {
                        Text("Load available models in Settings before creating a story.")
                        TextButton(onClick = { tab = 2 }) { Text("Choose model in Settings") }
                    } else Text("Model: ${probe.models.firstOrNull { it.slug == probe.selectedModel }?.displayName ?: probe.selectedModel}", style = MaterialTheme.typography.bodySmall)
                    probe.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                    Text("AI suggestions and difficulty are estimates. A1 is not a certification or a JLPT equivalence.", style = MaterialTheme.typography.bodySmall)
                } else {
                    var expanded by remember { mutableStateOf(false) }
                    Box {
                        OutlinedButton(onClick = { expanded = true }) { Text(filter?.let { tag -> TargetLanguage.entries.first { it.tag == tag }.displayName } ?: "All languages") }
                        DropdownMenu(expanded, { expanded = false }) {
                            DropdownMenuItem(text = { Text("All languages") }, onClick = { filter = null; expanded = false })
                            TargetLanguage.entries.forEach { language -> DropdownMenuItem(text = { Text(language.displayName) }, onClick = { filter = language.tag; expanded = false }) }
                        }
                    }
                    val filtered = stories.filter { filter == null || it.language.tag == filter }
                    if (filtered.isEmpty()) Text("No saved stories here yet. Create one from your words.")
                    filtered.forEach { saved ->
                        Card(modifier = Modifier.fillMaxWidth(), onClick = { vm.open(saved) }) {
                            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                Text(saved.language.displayName, style = MaterialTheme.typography.labelLarge)
                                FuriganaText(saved.title, saved.titleAnnotations, MaterialTheme.typography.titleMedium)
                                Text("${saved.vocabulary.size} words · Saved for offline reading", style = MaterialTheme.typography.bodySmall)
                                TextButton(onClick = { deleteCandidate = saved }, enabled = !busy) { Text("Delete") }
                            }
                        }
                    }
                }
                state.progress?.let { CircularProgressIndicator(); Text(it); TextButton(onClick = vm::cancel) { Text("Cancel request") } }
                state.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                state.notice?.let { Text(it) }
            }
        }
    }
    deleteCandidate?.let { story -> AlertDialog(onDismissRequest = { deleteCandidate = null },
        title = { Text("Delete this story?") }, text = { Text("This removes the saved story from this device.") },
        confirmButton = { TextButton(onClick = { vm.delete(story); deleteCandidate = null }) { Text("Delete") } },
        dismissButton = { TextButton(onClick = { deleteCandidate = null }) { Text("Keep story") } }) }
}

@Composable
private fun LanguagePicker(selected: TargetLanguage, enabled: Boolean, onSelect: (TargetLanguage) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    Box {
        OutlinedButton(onClick = { expanded = true }, enabled = enabled, modifier = Modifier.fillMaxWidth()) { Text(selected.displayName) }
        DropdownMenu(expanded, { expanded = false }) {
            TargetLanguage.entries.forEach { language -> DropdownMenuItem(text = { Text(language.displayName) }, onClick = { onSelect(language); expanded = false }) }
        }
    }
}
