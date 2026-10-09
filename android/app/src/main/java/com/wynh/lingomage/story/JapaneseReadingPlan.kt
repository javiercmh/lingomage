package com.wynh.lingomage.story

import com.google.gson.*
import com.wynh.lingomage.model.TargetLanguage
import java.text.Normalizer

/** The app chooses annotation boundaries; the model supplies only contextual readings. */
class JapaneseReadingPlan(raw: String) {
    private val root = JsonParser.parseString(raw).asJsonObject
    private data class Span(val id: Int, val section: String, val text: String, val start: Int, val end: Int)
    private val spans = mutableListOf<Span>()
    private val sections = linkedMapOf<String, String>()
    init {
        for ((field, max) in listOf("title" to 120, "text" to 6_000)) {
            val value = root.get(field)?.takeIf { it.isJsonPrimitive && it.asJsonPrimitive.isString }?.asString
                ?: throw StoryFailure("The generated Japanese story was incomplete. Your vocabulary is preserved; try again.")
            if (value.isBlank() || value.length > max) throw StoryFailure("The generated Japanese story contained an invalid field. Please try again.")
            ScriptRules.validate(value, TargetLanguage.JAPANESE)
            sections[field] = value
            var offset = 0
            while (offset < value.length) {
                val start = offset
                val kanji = isKanji(value.codePointAt(offset))
                while (offset < value.length && isKanji(value.codePointAt(offset)) == kanji)
                    offset += Character.charCount(value.codePointAt(offset))
                if (kanji) {
                    if (offset - start > 20) throw StoryFailure("A Japanese kanji compound is too long to annotate. Please try again.")
                    spans.add(Span(spans.size, field, value.substring(start, offset), start, offset))
                }
            }
        }
    }
    val needsReadings get() = spans.isNotEmpty()
    fun input(): String = JsonObject().apply {
        sections.forEach { (key, text) -> addProperty(key, text) }
        add("spans", JsonArray().apply { spans.forEach { span -> add(JsonObject().apply {
            addProperty("id", span.id); addProperty("section", span.section)
            addProperty("text", span.text); addProperty("start", span.start); addProperty("end", span.end)
            val context = sections.getValue(span.section)
            addProperty("before", context.substring(maxOf(0, span.start - 40), span.start))
            addProperty("after", context.substring(span.end, minOf(context.length, span.end + 40)))
        }) } })
    }.toString()

    fun complete(rawReadings: String): String {
        val readings = mutableMapOf<Int, String>()
        val values = JsonParser.parseString(rawReadings).asJsonObject.getAsJsonArray("readings")
            ?: throw StoryFailure("Japanese kana readings were missing. Please try again.")
        if (values.size() != spans.size) throw StoryFailure("Some Japanese kana readings were missing. Your vocabulary is preserved; try again.")
        values.forEach { value ->
            val item = value.asJsonObject
            val idValue = item.get("id")
            if (idValue == null || !idValue.isJsonPrimitive || !idValue.asJsonPrimitive.isNumber ||
                idValue.asString !in spans.indices.map(Int::toString))
                throw StoryFailure("Japanese readings did not match the requested words. Please try again.")
            val id = idValue.asInt
            val readingValue = item.get("reading")
            val reading = readingValue?.takeIf { it.isJsonPrimitive && it.asJsonPrimitive.isString }?.asString
                ?.trim()?.let { Normalizer.normalize(it, Normalizer.Form.NFC) }
            if (reading == null || reading.length > 60 || !ScriptRules.kana(reading))
                throw StoryFailure("A kana reading is missing or invalid for “${spans[id].text}”. Your vocabulary is preserved; try again.")
            if (readings.put(id, reading) != null) throw StoryFailure("Japanese readings were duplicated. Please try again.")
        }
        sections.forEach { (field, text) ->
            val segments = JsonArray()
            var cursor = 0
            fun append(surface: String, reading: String?) {
                if (surface.isEmpty()) return
                segments.add(JsonObject().apply { addProperty("text", surface); add("reading", reading?.let(::JsonPrimitive) ?: JsonNull.INSTANCE) })
            }
            spans.filter { it.section == field }.forEach { span ->
                append(text.substring(cursor, span.start), null)
                append(span.text, readings.getValue(span.id))
                cursor = span.end
            }
            append(text.substring(cursor), null)
            root.add(if (field == "title") "titleSegments" else "segments", segments)
        }
        return root.toString()
    }
    private fun isKanji(codepoint: Int) = Character.UnicodeScript.of(codepoint) == Character.UnicodeScript.HAN
}
