package com.wynh.lingomage.story

/** Align existing whole-word readings to kanji runs without repeating written kana. */
object FuriganaPlacement {
    fun normalize(canonical: String, annotations: List<Furigana>): List<Furigana> = annotations.flatMap { annotation ->
        align(canonical, annotation) ?: throw StoryFailure("A Japanese reading could not be aligned with its written kana. Please try again.")
    }

    fun display(canonical: String, annotations: List<Furigana>): List<Furigana> = annotations.flatMap { annotation ->
        // Keep an ambiguous legacy reading intact rather than inventing its pronunciation.
        align(canonical, annotation) ?: listOf(annotation)
    }

    private data class Part(val start: Int, val end: Int, val kanji: Boolean)
    private fun align(canonical: String, annotation: Furigana): List<Furigana>? {
        if (annotation.start < 0 || annotation.end > canonical.length || annotation.start >= annotation.end) return null
        val surface = canonical.substring(annotation.start, annotation.end)
        val parts = mutableListOf<Part>()
        var offset = 0
        while (offset < surface.length) {
            val start = offset
            val kanji = isKanji(surface.codePointAt(offset))
            while (offset < surface.length && isKanji(surface.codePointAt(offset)) == kanji) offset += Character.charCount(surface.codePointAt(offset))
            parts.add(Part(start, offset, kanji))
        }
        if (parts.all { it.kanji }) return listOf(annotation)
        if (parts.none { it.kanji } || parts.any { !it.kanji && !ScriptRules.kana(surface.substring(it.start, it.end)) }) return null
        val reading = annotation.reading
        val cache = mutableMapOf<Pair<Int, Int>, List<List<Furigana>>>()
        fun visit(index: Int, cursor: Int): List<List<Furigana>> {
            if (index == parts.size) return if (cursor == reading.length) listOf(emptyList()) else emptyList()
            cache[index to cursor]?.let { return it }
            val solutions = mutableListOf<List<Furigana>>()
            val part = parts[index]
            if (!part.kanji) {
                val kana = surface.substring(part.start, part.end)
                if (reading.regionMatches(cursor, kana, 0, kana.length)) solutions.addAll(visit(index + 1, cursor + kana.length))
            } else {
                for (end in cursor + 1..reading.length) {
                    val ruby = Furigana(annotation.start + part.start, annotation.start + part.end, reading.substring(cursor, end))
                    visit(index + 1, end).forEach { solutions.add(listOf(ruby) + it) }
                    if (solutions.size > 1) break
                }
            }
            return solutions.take(2).also { cache[index to cursor] = it }
        }
        return visit(0, 0).singleOrNull()
    }
    private fun isKanji(codepoint: Int) = Character.UnicodeScript.of(codepoint) == Character.UnicodeScript.HAN
}
