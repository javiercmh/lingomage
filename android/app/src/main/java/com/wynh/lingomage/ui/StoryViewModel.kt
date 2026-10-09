package com.wynh.lingomage.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.wynh.lingomage.library.LibraryRepository
import com.wynh.lingomage.model.TargetLanguage
import com.wynh.lingomage.settings.SettingsRepository
import com.wynh.lingomage.story.*
import com.wynh.lingomage.auth.AuthRepository
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch

data class StoryState(
    val language: TargetLanguage = TargetLanguage.GERMAN, val words: String = "", val topic: String = "",
    val confirmed: Boolean = false, val progress: String? = null, val error: String? = null,
    val notice: String? = null, val openStory: Story? = null, val unsaved: Story? = null
)

class StoryViewModel(private val generation: GenerationRepository, private val library: LibraryRepository,
    private val settings: SettingsRepository) : ViewModel() {
    private val mutableState = MutableStateFlow(StoryState())
    val state = mutableState.asStateFlow()
    val stories = library.stories.catch { mutableState.update { it.copy(error = "Your library could not be opened. Please restart the app.") }; emit(emptyList()) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())
    private var job: Job? = null
    init { viewModelScope.launch { runCatching { settings.language() }.getOrNull()?.let { language ->
        if (mutableState.value.words.isEmpty()) mutableState.update { it.copy(language = language) }
    } } }
    fun language(language: TargetLanguage) {
        if (job?.isActive == true) return
        mutableState.update { it.copy(language = language, confirmed = false, error = null, notice = null) }
        viewModelScope.launch { runCatching { settings.setLanguage(language) } }
    }
    fun words(value: String) { if (job?.isActive != true) mutableState.update { it.copy(words = value.take(700), confirmed = false, error = null, notice = null) } }
    fun topic(value: String) { if (job?.isActive != true) mutableState.update { it.copy(topic = value.take(120), confirmed = false, error = null) } }
    fun confirm() {
        try { Vocabulary.validate(Vocabulary.parse(state.value.words), state.value.language)
            mutableState.update { it.copy(confirmed = true, error = null, notice = "Vocabulary confirmed. You can now create your story.") }
        } catch (e: StoryFailure) { mutableState.update { it.copy(error = e.message, confirmed = false) } }
    }
    fun suggest(model: String?) = operation("Choosing beginner vocabulary…") {
        val selectedModel = model ?: throw StoryFailure("Connect ChatGPT and load available models in Settings first.")
        val draft = state.value
        val suggestions = generation.suggest(draft.language, draft.topic, selectedModel)
        mutableState.update { it.copy(words = suggestions.joinToString("\n"), confirmed = false, notice = "Edit these suggestions, then confirm your vocabulary.") }
    }
    fun generate(model: String?) = operation("Writing your story…") {
        val selectedModel = model ?: throw StoryFailure("Connect ChatGPT and load available models in Settings first.")
        val draft = state.value
        if (!draft.confirmed) throw StoryFailure("Confirm your vocabulary before creating a story.")
        val story = generation.generate(draft.language, Vocabulary.parse(draft.words), draft.topic, selectedModel)
        currentCoroutineContext().ensureActive()
        mutableState.update { it.copy(unsaved = story, progress = "Saving your story…") }
        savePending(story)
    }
    fun retrySave() = operation("Saving your story…") { state.value.unsaved?.let { savePending(it) } }
    private suspend fun savePending(story: Story) {
        try { library.save(story) }
        catch (e: CancellationException) { throw e }
        catch (_: Exception) { throw StoryFailure("Your story is ready, but could not be saved. Try saving it again without another generation request.") }
        mutableState.update { it.copy(unsaved = null, openStory = story, notice = "Saved to your library.") }
    }
    fun cancel() { job?.cancel() }
    fun open(story: Story) { mutableState.update { it.copy(openStory = story, error = null) } }
    fun closeReader() { mutableState.update { it.copy(openStory = null) } }
    fun reuse(story: Story) {
        mutableState.value = StoryState(language = story.language, words = story.vocabulary.joinToString("\n"), topic = story.topic,
            notice = "Review these words and confirm them for a new story.")
    }
    fun delete(story: Story) = operation("Deleting story…") {
        library.delete(story.id)
        mutableState.update { it.copy(openStory = if (it.openStory?.id == story.id) null else it.openStory, notice = "Story deleted.") }
    }
    private fun operation(progress: String, block: suspend () -> Unit) {
        if (job?.isActive == true) return
        mutableState.update { it.copy(progress = progress, error = null, notice = null) }
        job = viewModelScope.launch {
            try { block() }
            catch (_: CancellationException) { mutableState.update { it.copy(notice = "Request cancelled. Your vocabulary is preserved.") } }
            catch (e: Exception) { mutableState.update { it.copy(error = if (e is StoryFailure) e.message else AuthRepository.message(e)) } }
            finally { mutableState.update { it.copy(progress = null) } }
        }
    }
    companion object {
        fun factory(generation: GenerationRepository, library: LibraryRepository, settings: SettingsRepository) = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T {
                require(modelClass.isAssignableFrom(StoryViewModel::class.java))
                return StoryViewModel(generation, library, settings) as T
            }
        }
    }
}
