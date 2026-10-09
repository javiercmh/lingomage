package com.wynh.lingomage.library

import android.content.Context
import androidx.room.*
import com.google.gson.Gson
import com.wynh.lingomage.story.Story
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

@Entity(tableName = "stories", indices = [Index("language")])
data class StoryRecord(@PrimaryKey val id: String, val language: String, val createdAt: Long, val payload: String)

@Dao
interface StoryDao {
    @Query("SELECT * FROM stories ORDER BY createdAt DESC") fun observe(): Flow<List<StoryRecord>>
    @Insert(onConflict = OnConflictStrategy.IGNORE) suspend fun insert(story: StoryRecord)
    @Query("DELETE FROM stories WHERE id = :id") suspend fun delete(id: String)
}

@Database(entities = [StoryRecord::class], version = 1, exportSchema = true)
abstract class StoryDatabase : RoomDatabase() {
    abstract fun stories(): StoryDao
    companion object {
        fun create(context: Context) = Room.databaseBuilder(context, StoryDatabase::class.java, "stories.db").build()
    }
}

interface LibraryRepository {
    val stories: Flow<List<Story>>
    suspend fun save(story: Story)
    suspend fun delete(id: String)
}

class RoomLibraryRepository(private val dao: StoryDao) : LibraryRepository {
    private val gson = Gson()
    override val stories = dao.observe().map { rows -> rows.map { gson.fromJson(it.payload, Story::class.java) } }
    override suspend fun save(story: Story) = dao.insert(StoryRecord(story.id, story.language.tag, story.createdAt, gson.toJson(story)))
    override suspend fun delete(id: String) = dao.delete(id)
}
