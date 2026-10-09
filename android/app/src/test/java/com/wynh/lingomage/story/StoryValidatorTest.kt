package com.wynh.lingomage.story

import com.google.gson.*
import com.wynh.lingomage.model.TargetLanguage
import org.junit.Assert.*
import org.junit.Test

class StoryValidatorTest {
    private val words = listOf("Hund", "Katze", "Haus", "Brot", "Wasser")
    private fun german(): JsonObject {
        val root = JsonObject()
        root.addProperty("title", "Ein Tag")
        root.addProperty("text", (words + List(95) { "heute" }).joinToString(" "))
        root.add("glossary", JsonArray().apply { words.forEach { word -> add(JsonObject().apply {
            addProperty("selected", word); addProperty("headword", word)
            add("usedForms", JsonArray().apply { add(word) }); addProperty("meaning", "A contextual English meaning.")
            add("reading", JsonNull.INSTANCE)
        }) } })
        root.add("segments", JsonArray()); root.add("titleSegments", JsonArray())
        return root
    }
    private fun parse(root: JsonObject) = StoryValidator.story(root.toString(), TargetLanguage.GERMAN, words, "", "test-model", "test-version")

    @Test fun `complete story records provenance and all vocabulary`() {
        val story = parse(german())
        assertEquals(words, story.vocabulary)
        assertEquals("test-version", story.promptVersion)
        assertEquals("test-model", story.model)
    }
    @Test fun `missing glossary item and fictitious inflected forms are rejected`() {
        val missing = german(); missing.getAsJsonArray("glossary").remove(0)
        fails { parse(missing) }
        val absent = german(); absent.getAsJsonArray("glossary")[0].asJsonObject.add("usedForms", JsonArray().apply { add("Hunde") })
        fails { parse(absent) }
    }
    @Test fun `substring matches cannot fake vocabulary coverage`() {
        val root = german(); root.addProperty("text", root.get("text").asString.replace("Hund", "Hundert"))
        fails { parse(root) }
    }
    @Test fun `script requirements reject transliteration and stress marks`() {
        ScriptRules.validate("Собака пьёт воду.", TargetLanguage.RUSSIAN)
        fails { ScriptRules.validate("Sobaka", TargetLanguage.RUSSIAN) }
        fails { ScriptRules.validate("во́да", TargetLanguage.RUSSIAN) }
        ScriptRules.validate("学校へ行きます。コーヒーです。", TargetLanguage.JAPANESE)
        fails { ScriptRules.validate("gakkou", TargetLanguage.JAPANESE) }
    }
    @Test fun `suggestions require four language scripts and distinct five to ten items`() {
        assertEquals(words, StoryValidator.suggestions("{\"words\":[\"Hund\",\"Katze\",\"Haus\",\"Brot\",\"Wasser\"]}", TargetLanguage.GERMAN))
        fails { Vocabulary.validate(listOf("a", "b"), TargetLanguage.SPANISH) }
        fails { Vocabulary.validate(List(5) { "perro" }, TargetLanguage.SPANISH) }
    }
    @Test fun `japanese compound readings cover canonical title and story exactly`() {
        val items = listOf("学校", "学生", "本", "水", "友達")
        val sentence = "学校の学生は本と水を友達にあげます。"
        val root = JsonObject().apply {
            addProperty("title", "学校"); addProperty("text", sentence.repeat(8))
            add("glossary", JsonArray().apply { items.forEach { word -> add(JsonObject().apply {
                addProperty("selected", word); addProperty("headword", word); addProperty("reading", "かな")
                addProperty("meaning", "English meaning"); add("usedForms", JsonArray().apply { add(word) })
            }) } })
            add("titleSegments", segments(listOf("学校" to "がっこう")))
            add("segments", JsonArray().apply { repeat(8) { segments(listOf("学校" to "がっこう", "の" to null,
                "学生" to "がくせい", "は" to null, "本" to "ほん", "と" to null,
                "水" to "みず", "を" to null, "友達" to "ともだち", "にあげます。" to null)).forEach { add(it) } } })
        }
        fun read() = StoryValidator.story(root.toString(), TargetLanguage.JAPANESE, items, "", "model", "version")
        val story = read()
        assertEquals(2, story.annotations.first().end)
        assertEquals("がっこう", story.annotations.first().reading)
        root.getAsJsonArray("segments")[0].asJsonObject.addProperty("reading", "gakkou")
        fails { read() }
        root.getAsJsonArray("segments")[0].asJsonObject.addProperty("reading", "がっこう")
        root.addProperty("text", sentence.repeat(8) + "違う")
        fails { read() }
    }
    private fun segments(items: List<Pair<String,String?>>) = JsonArray().apply { items.forEach { (text, reading) ->
        add(JsonObject().apply { addProperty("text", text); add("reading", reading?.let { JsonPrimitive(it) } ?: JsonNull.INSTANCE) })
    } }
    private fun fails(action: () -> Unit) { try { action(); fail("Expected rejection") } catch (_: StoryFailure) { } }
}
