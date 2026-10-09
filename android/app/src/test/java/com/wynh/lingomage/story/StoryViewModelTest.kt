package com.wynh.lingomage.story

import com.wynh.lingomage.ui.StoryViewModel
import com.wynh.lingomage.library.LibraryRepository
import com.wynh.lingomage.model.TargetLanguage
import com.wynh.lingomage.settings.SettingsRepository
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.*
import org.junit.Assert.*
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class StoryViewModelTest {
    private val words = "Hund\nKatze\nHaus\nBrot\nWasser"
    private val story = Story("id", TargetLanguage.GERMAN, "Title", "Text", emptyList(), words.lines(), "", emptyList(), emptyList(), "model", "version", 1)
    @Test fun `failure preserves confirmed input and never retries automatically`() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val generation = FakeGeneration(fail = true)
            val vm = StoryViewModel(generation, FakeLibrary(), FakeSettings())
            vm.words(words); vm.confirm(); vm.generate("model"); advanceUntilIdle()
            assertEquals(words, vm.state.value.words)
            assertTrue(vm.state.value.confirmed)
            assertNotNull(vm.state.value.error)
            assertEquals(1, generation.calls)
        } finally { Dispatchers.resetMain() }
    }
    @Test fun `failed save retries persistence without regenerating`() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val generation = FakeGeneration()
            val library = FakeLibrary(fail = true)
            val vm = StoryViewModel(generation, library, FakeSettings())
            vm.words(words); vm.confirm(); vm.generate("model"); advanceUntilIdle()
            assertEquals(story, vm.state.value.unsaved)
            library.fail = false
            vm.retrySave(); advanceUntilIdle()
            assertEquals(story, vm.state.value.openStory)
            assertEquals(1, generation.calls)
            assertEquals(listOf(story), library.stories.value)
        } finally { Dispatchers.resetMain() }
    }
    @Test fun `suggestions require confirmation and edits invalidate it`() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val vm = StoryViewModel(FakeGeneration(), FakeLibrary(), FakeSettings())
            vm.suggest("model"); advanceUntilIdle()
            assertFalse(vm.state.value.confirmed)
            vm.confirm(); assertTrue(vm.state.value.confirmed)
            vm.words(words + "\nBaum"); assertFalse(vm.state.value.confirmed)
        } finally { Dispatchers.resetMain() }
    }
    @Test fun `cancelling generation preserves input and saves no partial story`() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val library = FakeLibrary()
            val vm = StoryViewModel(FakeGeneration(wait = true), library, FakeSettings())
            vm.words(words); vm.confirm(); vm.generate("model"); runCurrent(); vm.cancel(); advanceUntilIdle()
            assertEquals(words, vm.state.value.words)
            assertTrue(library.stories.value.isEmpty())
            assertNull(vm.state.value.progress)
        } finally { Dispatchers.resetMain() }
    }
    private inner class FakeGeneration(val fail: Boolean = false, val wait: Boolean = false) : GenerationRepository {
        var calls = 0
        override suspend fun suggest(language: TargetLanguage, topic: String, model: String) = words.lines()
        override suspend fun generate(language: TargetLanguage, words: List<String>, topic: String, model: String): Story {
            calls++
            if (wait) awaitCancellation()
            if (fail) throw StoryFailure("Malformed result")
            return story
        }
    }
    private class FakeLibrary(var fail: Boolean = false) : LibraryRepository {
        override val stories = MutableStateFlow<List<Story>>(emptyList())
        override suspend fun save(story: Story) { if (fail) error("disk"); stories.value += story }
        override suspend fun delete(id: String) { stories.value = stories.value.filterNot { it.id == id } }
    }
    private class FakeSettings : SettingsRepository {
        override suspend fun model(clientId: String): String? = null
        override suspend fun setModel(clientId: String, slug: String) { }
        override suspend fun language() = TargetLanguage.GERMAN
        override suspend fun setLanguage(language: TargetLanguage) { }
    }
}
