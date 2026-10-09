package com.wynh.lingomage.story

import com.google.gson.JsonParser
import org.junit.Assert.*
import org.junit.Test

class JapaneseReadingPlanTest {
    private fun plan(title: String = "ホテル", text: String = "ホテルは駅へ行きます。学校です。") =
        JapaneseReadingPlan("""{"title":"$title","text":"$text","glossary":[],"segments":[],"titleSegments":[]}""")
    @Test fun `hotel kana are ordinary text and station gets its own reading`() {
        val plan = plan()
        val spans = JsonParser.parseString(plan.input()).asJsonObject.getAsJsonArray("spans")
        assertEquals(listOf("駅", "行", "学校"), spans.map { it.asJsonObject.get("text").asString })
        val result = JsonParser.parseString(plan.complete("""{"readings":[{"id":2,"reading":"がっこう"},{"id":0,"reading":"えき"},{"id":1,"reading":"い"}]}""")).asJsonObject
        val segments = result.getAsJsonArray("segments")
        assertEquals("ホテルは", segments[0].asJsonObject.get("text").asString)
        assertTrue(segments[0].asJsonObject.get("reading").isJsonNull)
        assertEquals("駅", segments[1].asJsonObject.get("text").asString)
        assertEquals("えき", segments[1].asJsonObject.get("reading").asString)
        assertEquals("ホテルは駅へ行きます。学校です。", segments.joinToString("") { it.asJsonObject.get("text").asString })
        assertEquals("きます。", segments[4].asJsonObject.get("text").asString)
    }
    @Test fun `kana only stories require no reading request`() {
        val plan = plan(text = "ホテルへいきます。")
        assertFalse(plan.needsReadings)
        val result = JsonParser.parseString(plan.complete("""{"readings":[]}""")).asJsonObject
        assertEquals("ホテルへいきます。", result.getAsJsonArray("segments")[0].asJsonObject.get("text").asString)
    }
    @Test fun `missing duplicated and unknown reading ids are rejected`() {
        val plan = plan(text = "駅へ行きます。")
        fails { plan.complete("""{"readings":[{"id":0,"reading":"えき"}]}""") }
        fails { plan.complete("""{"readings":[{"id":0,"reading":"えき"},{"id":0,"reading":"い"}]}""") }
        fails { plan.complete("""{"readings":[{"id":0,"reading":"えき"},{"id":9,"reading":"い"}]}""") }
        fails { plan.complete("""{"readings":[{"id":0.5,"reading":"えき"},{"id":1,"reading":"い"}]}""") }
    }
    @Test fun `title and repeated occurrences have separate context ids`() {
        val plan = plan(title = "駅", text = "駅と駅です。")
        val spans = JsonParser.parseString(plan.input()).asJsonObject.getAsJsonArray("spans")
        assertEquals(listOf(0, 1, 2), spans.map { it.asJsonObject.get("id").asInt })
        assertEquals("title", spans[0].asJsonObject.get("section").asString)
        assertEquals("駅と", spans[2].asJsonObject.get("before").asString)
        fails { plan.complete("""{"readings":[{"id":0,"reading":"eki"},{"id":1,"reading":"えき"},{"id":2,"reading":"えき"}]}""") }
    }
    @Test fun `supplementary kanji maintain UTF16 offsets and compounds`() {
        val spans = JsonParser.parseString(plan(text = "ホテルは𠮷野です。").input()).asJsonObject.getAsJsonArray("spans")
        val item = spans[0].asJsonObject
        assertEquals("𠮷野", item.get("text").asString)
        assertEquals(4, item.get("start").asInt)
        assertEquals(7, item.get("end").asInt)
    }
    private fun fails(block: () -> Unit) { try { block(); fail("Expected rejection") } catch (_: StoryFailure) {} }
}
