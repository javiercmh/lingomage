package com.wynh.lingomage

import androidx.test.platform.app.InstrumentationRegistry
import com.wynh.lingomage.model.TargetLanguage
import com.wynh.lingomage.story.Story
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.flow.first
import org.junit.Assume.assumeTrue
import org.junit.Test
import java.io.File
import com.google.gson.GsonBuilder

/** Explicit opt-in only: uses the saved account inside the app, never exports tokens. */
class LiveGenerationTest {
    @Test fun reasoningPreferenceAndInference() {
        assumeTrue(InstrumentationRegistry.getArguments().getString("live_reasoning") == "true")
        runBlocking {
            val app = InstrumentationRegistry.getInstrumentation().targetContext.applicationContext as LingoMageApplication
            val account = app.auth.activeRegistration().clientId
            val model = app.inference.models().first { it.reasoningLevels.isNotEmpty() }
            val previous = app.settings.reasoning(account, model.slug)
            val effort = model.reasoningLevels.first()
            try {
                app.settings.setReasoning(account, model.slug, effort)
                org.junit.Assert.assertEquals(effort, app.settings.reasoning(account, model.slug))
                org.junit.Assert.assertNull(app.settings.reasoning("isolated-test-account", model.slug))
                org.junit.Assert.assertNull(app.settings.reasoning(account, "isolated-test-model"))
                org.junit.Assert.assertTrue(app.inference.check(model.slug).contains("Hello"))
            } finally { app.settings.setReasoning(account, model.slug, previous) }
        }
    }
    @Test fun germanStory() = generate(TargetLanguage.GERMAN, listOf("Hund", "Haus", "Wasser", "Brot", "Freund"))
    @Test fun japaneseStory() = generate(TargetLanguage.JAPANESE, listOf("学校", "友達", "本", "水", "猫"))
    @Test fun japaneseTripStory() = generate(TargetLanguage.JAPANESE, listOf("旅行", "日本", "電車", "駅", "友達"), "A trip to Japan")
    @Test fun russianStory() = generate(TargetLanguage.RUSSIAN, listOf("дом", "собака", "вода", "хлеб", "друг"))
    @Test fun spanishStory() = generate(TargetLanguage.SPANISH, listOf("casa", "perro", "agua", "pan", "amigo"))
    @Test fun vocabularySuggestions() {
        assumeTrue(InstrumentationRegistry.getArguments().getString("live_suggestions") == "true")
        runBlocking {
            val app = InstrumentationRegistry.getInstrumentation().targetContext.applicationContext as LingoMageApplication
            val model = app.inference.models().first().slug
            TargetLanguage.entries.forEach { language ->
                val words = app.generation.suggest(language, "Breakfast at home", model)
                org.junit.Assert.assertTrue(words.size in 5..10)
            }
        }
    }
    @Test fun exportSavedSamples() {
        assumeTrue(InstrumentationRegistry.getArguments().getString("live_export") == "true")
        runBlocking {
            val app = InstrumentationRegistry.getInstrumentation().targetContext.applicationContext as LingoMageApplication
            val stories = app.library.stories.first()
            TargetLanguage.entries.forEach { language ->
                export(app, stories.first { it.language == language && it.topic == "A day with a friend" })
            }
        }
    }
    private fun export(app: LingoMageApplication, story: Story) {
        val directory = File(app.cacheDir, "sample-stories").apply { check(isDirectory || mkdirs()) }
        File(directory, "${story.language.tag}.json").writeText(GsonBuilder().setPrettyPrinting().create().toJson(story))
    }
    private fun generate(language: TargetLanguage, words: List<String>, topic: String = "A day with a friend") {
        assumeTrue(InstrumentationRegistry.getArguments().getString("live_generation") == "true")
        runBlocking {
            val app = InstrumentationRegistry.getInstrumentation().targetContext.applicationContext as LingoMageApplication
            val model = app.inference.models().first().slug
            val story: Story = app.generation.generate(language, words, topic, model)
            app.library.save(story)
            export(app, story)
        }
    }
}
