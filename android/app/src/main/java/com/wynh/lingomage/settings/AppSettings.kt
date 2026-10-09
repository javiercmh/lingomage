package com.wynh.lingomage.settings

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.wynh.lingomage.model.TargetLanguage
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

private val Context.preferences by preferencesDataStore("learning_preferences")

interface SettingsRepository {
    suspend fun model(clientId: String): String?
    suspend fun setModel(clientId: String, slug: String)
    suspend fun reasoning(clientId: String, model: String): String? = null
    suspend fun setReasoning(clientId: String, model: String, effort: String?) {}
    suspend fun language(): TargetLanguage
    suspend fun setLanguage(language: TargetLanguage)
}

class AppSettings(context: Context) : SettingsRepository {
    private val store = context.preferences
    override suspend fun model(clientId: String) = store.data.first()[stringPreferencesKey("model_$clientId")]
    override suspend fun setModel(clientId: String, slug: String) {
        store.edit { it[stringPreferencesKey("model_$clientId")] = slug }
    }
    override suspend fun reasoning(clientId: String, model: String) = store.data.first()[stringPreferencesKey("reasoning_${clientId}_$model")]
    override suspend fun setReasoning(clientId: String, model: String, effort: String?) {
        store.edit { preferences ->
            val key = stringPreferencesKey("reasoning_${clientId}_$model")
            if (effort == null) preferences.remove(key) else preferences[key] = effort
        }
    }
    override suspend fun language() = store.data.map { preferences ->
        TargetLanguage.entries.firstOrNull { it.tag == preferences[stringPreferencesKey("language")] }
            ?: TargetLanguage.SPANISH.takeIf { preferences[stringPreferencesKey("language")] == "es" } ?: TargetLanguage.GERMAN
    }.first()
    override suspend fun setLanguage(language: TargetLanguage) {
        store.edit { it[stringPreferencesKey("language")] = language.tag }
    }
}
