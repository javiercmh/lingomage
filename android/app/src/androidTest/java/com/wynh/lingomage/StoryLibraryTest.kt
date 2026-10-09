package com.wynh.lingomage

import androidx.room.Room
import androidx.test.platform.app.InstrumentationRegistry
import com.wynh.lingomage.library.*
import com.wynh.lingomage.model.TargetLanguage
import com.wynh.lingomage.story.*
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test
import java.util.UUID

class StoryLibraryTest {
    @Test fun saveReopenFilterAndDeletePreserveJapaneseAnnotations() = runBlocking {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val name = "test-${UUID.randomUUID()}.db"
        fun database() = Room.databaseBuilder(context, StoryDatabase::class.java, name).build()
        val story = Story("test-japanese", TargetLanguage.JAPANESE, "学校", "学校です。", emptyList(), listOf("学校"), "", listOf(Furigana(0, 2, "がっこう")), listOf(Furigana(0, 2, "がっこう")), "model", "version", 1)
        val first = database()
        try {
            val repo = RoomLibraryRepository(first.stories())
            repo.save(story); repo.save(story)
            repo.save(story.copy(id = "german", language = TargetLanguage.GERMAN, annotations = emptyList()))
        } finally { first.close() }
        val reopened = database()
        try {
            val repo = RoomLibraryRepository(reopened.stories())
            val saved = repo.stories.first()
            assertEquals(2, saved.size)
            assertEquals(story, saved.first { it.language == TargetLanguage.JAPANESE })
            repo.delete(story.id)
            assertEquals("german", repo.stories.first().single().id)
        } finally { reopened.close(); context.deleteDatabase(name) }
    }
}
