package com.wynh.lingomage.story

import com.wynh.lingomage.model.TargetLanguage

data class Furigana(val start: Int, val end: Int, val reading: String)
data class GlossaryEntry(val selected: String, val headword: String, val usedForms: List<String>, val meaning: String, val reading: String?)
data class Story(
    val id: String, val language: TargetLanguage, val title: String, val text: String,
    val glossary: List<GlossaryEntry>, val vocabulary: List<String>, val topic: String,
    val annotations: List<Furigana>, val titleAnnotations: List<Furigana>,
    val model: String, val promptVersion: String, val createdAt: Long
)
class StoryFailure(message: String) : Exception(message)

object Vocabulary {
    fun parse(input: String): List<String> = input.split('\n', ',').map(String::trim).filter(String::isNotEmpty)
    fun validate(words: List<String>, language: TargetLanguage) {
        if (words.size !in 5..10) throw StoryFailure("Choose 5–10 vocabulary items, one per line or separated by commas.")
        if (words.any { it.length > 60 || !it.codePoints().anyMatch(Character::isLetter) } || words.map { it.lowercase() }.distinct().size != words.size)
            throw StoryFailure("Use distinct vocabulary items with no more than 60 characters each.")
        words.forEach { ScriptRules.validate(it, language) }
    }
}

object ScriptRules {
    fun hasKanji(text: String) = text.codePoints().anyMatch { Character.UnicodeScript.of(it) == Character.UnicodeScript.HAN }
    fun kana(text: String) = text.isNotBlank() && text.codePoints().allMatch {
        val script = Character.UnicodeScript.of(it)
        script == Character.UnicodeScript.HIRAGANA || script == Character.UnicodeScript.KATAKANA || it == 0x30FC || it == 0x3099 || it == 0x309A
    }
    fun validate(text: String, language: TargetLanguage) {
        if (language == TargetLanguage.RUSSIAN && (text.contains('\u0301') || text.codePoints().anyMatch {
            Character.isLetter(it) && Character.UnicodeScript.of(it) != Character.UnicodeScript.CYRILLIC
        })) throw StoryFailure("Russian vocabulary and stories must use Cyrillic, without transliteration or added stress marks.")
        if (language == TargetLanguage.JAPANESE && text.codePoints().anyMatch {
            Character.isLetter(it) && Character.UnicodeScript.of(it) !in setOf(Character.UnicodeScript.HAN,
                Character.UnicodeScript.HIRAGANA, Character.UnicodeScript.KATAKANA, Character.UnicodeScript.COMMON)
        }) throw StoryFailure("Japanese vocabulary and stories must use kanji and kana, without romaji.")
    }
}
