package com.wynh.lingomage.story

import org.junit.Assert.*
import org.junit.Test

class FuriganaPlacementTest {
    private fun place(surface: String, reading: String) = FuriganaPlacement.normalize(surface, listOf(Furigana(0, surface.length, reading)))
    @Test fun `inflected kana are not repeated in furigana`() {
        assertEquals(listOf(Furigana(0, 1, "い")), place("行きます", "いきます"))
        assertEquals(listOf(Furigana(0, 1, "た")), place("食べます", "たべます"))
        assertEquals(listOf(Furigana(0, 1, "よ")), place("読みます", "よみます"))
        assertEquals(listOf(Furigana(0, 1, "しろ")), place("白い", "しろい"))
    }
    @Test fun `kanji compounds stay grouped`() {
        assertEquals(listOf(Furigana(0, 2, "がっこう")), place("学校", "がっこう"))
        assertEquals(listOf(Furigana(0, 2, "ともだち")), place("友達", "ともだち"))
    }
    @Test fun `prefix and internal kana remain ordinary text`() {
        assertEquals(listOf(Furigana(1, 2, "かあ")), place("お母さん", "おかあさん"))
        assertEquals(listOf(Furigana(0, 1, "た"), Furigana(2, 3, "もの")), place("食べ物", "たべもの"))
    }
    @Test fun `extra duplicated masu is rejected rather than guessed`() {
        try { place("行きます", "いきますます"); fail() } catch (_: StoryFailure) { }
    }
    @Test fun `ambiguous legacy readings are preserved but new results rejected`() {
        val old = listOf(Furigana(0, 3, "かかかか"))
        assertEquals(old, FuriganaPlacement.display("書か書", old))
        try { FuriganaPlacement.normalize("書か書", old); fail() } catch (_: StoryFailure) { }
    }
}
