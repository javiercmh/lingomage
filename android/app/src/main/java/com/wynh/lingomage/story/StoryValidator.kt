package com.wynh.lingomage.story

import com.google.gson.JsonArray
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import com.wynh.lingomage.model.TargetLanguage
import java.util.UUID
import java.text.Normalizer

object StoryValidator {
    fun suggestions(raw: String, language: TargetLanguage): List<String> = checked {
        val root = JsonParser.parseString(raw).asJsonObject
        val words = root.getAsJsonArray("words").map { it.asString }
        Vocabulary.validate(words, language)
        words
    }

    fun story(raw: String, language: TargetLanguage, words: List<String>, topic: String, model: String, version: String): Story = checked {
        Vocabulary.validate(words, language)
        val root = JsonParser.parseString(raw).asJsonObject
        val title = canonical(root, "title", "titleSegments", 120, language)
        val text = canonical(root, "text", "segments", 6_000, language)
        ScriptRules.validate(title, language)
        ScriptRules.validate(text, language)
        if (language == TargetLanguage.JAPANESE) {
            val sentences = Regex("[。！？!?]+").findAll(text).count()
            if (sentences !in 8..12) throw StoryFailure("The Japanese story did not contain 8–12 short sentences. Your words are preserved; try again.")
        } else {
            val count = Regex("[\\p{L}\\p{M}]+(?:['’–-][\\p{L}\\p{M}]+)*").findAll(text).count()
            if (count !in 100..150) throw StoryFailure("The story did not meet the 100–150 word target. Your words are preserved; try again.")
        }
        val glossary = root.getAsJsonArray("glossary").map { value ->
            val item = value.asJsonObject
            val selected = item.string("selected", 60)
            val headword = item.string("headword", 80)
            val forms = item.getAsJsonArray("usedForms").map { it.asString }.distinct()
            val meaning = item.string("meaning", 600)
            val reading = item.get("reading")?.takeUnless { it.isJsonNull }?.asString
            ScriptRules.validate(headword, language)
            if (forms.isEmpty() || forms.size > 10 || forms.any { it.isBlank() || it.length > 100 || !containsForm(text, it, language) })
                throw StoryFailure("Some selected vocabulary was missing from the story. Your words are preserved; try again.")
            forms.forEach { ScriptRules.validate(it, language) }
            if (language == TargetLanguage.JAPANESE && ScriptRules.hasKanji(headword) && (reading == null || !ScriptRules.kana(reading)))
                throw StoryFailure("A Japanese glossary reading was missing or invalid. Please try again.")
            if (reading != null && (language != TargetLanguage.JAPANESE || !ScriptRules.kana(reading)))
                throw StoryFailure("A glossary reading did not match the language requirements. Please try again.")
            if (!meaning.any { it in 'a'..'z' || it in 'A'..'Z' }) throw StoryFailure("English glossary explanations were missing. Please try again.")
            GlossaryEntry(selected, headword, forms, meaning, reading)
        }
        if (glossary.size != words.size || glossary.map { it.selected }.toSet() != words.toSet())
            throw StoryFailure("The glossary did not cover every selected word exactly once. Your words are preserved; try again.")
        val annotations = annotations(text, root.getAsJsonArray("segments"), language, "story")
        val titleAnnotations = annotations(title, root.getAsJsonArray("titleSegments"), language, "title")
        Story(UUID.randomUUID().toString(), language, title, text, glossary, words.toList(), topic,
            annotations, titleAnnotations, model, version, System.currentTimeMillis())
    }

    private fun canonical(root: JsonObject, field: String, segmentField: String, max: Int, language: TargetLanguage): String {
        // Legacy responses may include both fields; their equality is still checked below.
        if (language != TargetLanguage.JAPANESE || root.has(field)) return root.string(field, max)
        val segments = root.getAsJsonArray(segmentField)
            ?: throw StoryFailure("Japanese reading annotations were missing. Please try again.")
        if (segments.size() !in 1..2_000) throw StoryFailure("Japanese reading annotations were missing. Please try again.")
        val text = StringBuilder()
        segments.forEach {
            text.append(it.asJsonObject.string("text", 1_000, allowWhitespace = true))
            if (text.length > max) throw StoryFailure("The generated story contained an invalid field. Please try again.")
        }
        if (text.isBlank()) throw StoryFailure("The generated story contained an invalid field. Please try again.")
        return text.toString()
    }

    private fun annotations(canonical: String, segments: JsonArray?, language: TargetLanguage, location: String): List<Furigana> {
        if (language != TargetLanguage.JAPANESE) {
            if (segments == null || segments.size() != 0) throw StoryFailure("Unexpected reading annotations. Please try again.")
            return emptyList()
        }
        if (segments == null || segments.size() == 0 || segments.size() > 2_000)
            throw StoryFailure("Japanese reading annotations were missing. Please try again.")
        val reconstructed = StringBuilder()
        val result = mutableListOf<Furigana>()
        segments.forEach { value ->
            val item = value.asJsonObject
            val text = item.string("text", 1_000, allowWhitespace = true)
            val readingValue = item.get("reading")?.takeUnless { it.isJsonNull }
            val reading = readingValue?.takeIf { it.isJsonPrimitive && it.asJsonPrimitive.isString }
                ?.asString?.trim()?.let { Normalizer.normalize(it, Normalizer.Form.NFC) }
            val start = reconstructed.length
            reconstructed.append(text)
            if (ScriptRules.hasKanji(text)) {
                val label = text.take(24)
                if (text.length > 20)
                    throw StoryFailure("A Japanese $location segment is too long to annotate: “$label”. Please try again.")
                if (reading == null || reading.isEmpty())
                    throw StoryFailure("A kana reading is missing for “$label” in the Japanese $location. Your vocabulary is preserved; try again.")
                if (reading.length > 60 || !ScriptRules.kana(reading))
                    throw StoryFailure("The reading for “$label” must contain only kana. Your vocabulary is preserved; try again.")
                result.add(Furigana(start, reconstructed.length, reading))
            } else if (readingValue != null) throw StoryFailure("Unexpected reading above kana-only text. Please try again.")
        }
        if (reconstructed.toString() != canonical) throw StoryFailure("Japanese annotations did not match the story text. Please try again.")
        return FuriganaPlacement.normalize(canonical, result)
    }

    private fun containsForm(text: String, form: String, language: TargetLanguage): Boolean =
        if (language == TargetLanguage.JAPANESE) text.contains(form)
        else Regex("(?<![\\p{L}\\p{M}])${Regex.escape(form)}(?![\\p{L}\\p{M}])", RegexOption.IGNORE_CASE).containsMatchIn(text)

    private fun JsonObject.string(key: String, max: Int, allowWhitespace: Boolean = false): String {
        val result = get(key)?.asString ?: throw StoryFailure("The generated story was incomplete. Please try again.")
        if (result.length !in 1..max || (!allowWhitespace && result.isBlank())) throw StoryFailure("The generated story contained an invalid field. Please try again.")
        return result
    }
    private inline fun <T> checked(block: () -> T): T = try { block() }
        catch (e: StoryFailure) { throw e }
        catch (_: Exception) { throw StoryFailure("The generated result was not valid story JSON. Your input is preserved; try again.") }
}
