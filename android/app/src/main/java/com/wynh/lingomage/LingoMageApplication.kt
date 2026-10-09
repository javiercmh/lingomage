package com.wynh.lingomage

import android.app.Application
import com.wynh.lingomage.auth.AuthRepository
import com.wynh.lingomage.auth.EncryptedCredentialStore
import com.wynh.lingomage.auth.IdTokenValidator
import com.wynh.lingomage.auth.OpenAiOAuthApi
import com.wynh.lingomage.network.HttpGateway
import com.wynh.lingomage.network.OpenAiInferenceRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import com.wynh.lingomage.library.StoryDatabase
import com.wynh.lingomage.library.RoomLibraryRepository
import com.wynh.lingomage.settings.AppSettings
import com.wynh.lingomage.story.OpenAiGenerationRepository
import com.wynh.lingomage.story.PromptStore

class LingoMageApplication : Application() {
    private val applicationScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    lateinit var auth: AuthRepository
        private set
    lateinit var inference: OpenAiInferenceRepository
        private set
    lateinit var library: RoomLibraryRepository
        private set
    lateinit var settings: AppSettings
        private set
    lateinit var generation: OpenAiGenerationRepository
        private set

    override fun onCreate() {
        super.onCreate()
        val http = HttpGateway()
        auth = AuthRepository(EncryptedCredentialStore(this), OpenAiOAuthApi(http), IdTokenValidator(), applicationScope)
        inference = OpenAiInferenceRepository(http, auth)
        library = RoomLibraryRepository(StoryDatabase.create(this).stories())
        settings = AppSettings(this)
        generation = OpenAiGenerationRepository(inference, PromptStore(this))
    }
}
