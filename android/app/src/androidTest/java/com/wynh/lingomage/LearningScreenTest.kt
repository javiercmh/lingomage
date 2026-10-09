package com.wynh.lingomage

import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.getValue
import androidx.compose.runtime.collectAsState
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import com.nimbusds.jose.jwk.JWKSet
import com.wynh.lingomage.auth.*
import com.wynh.lingomage.library.LibraryRepository
import com.wynh.lingomage.model.TargetLanguage
import com.wynh.lingomage.network.*
import com.wynh.lingomage.settings.SettingsRepository
import com.wynh.lingomage.story.*
import com.wynh.lingomage.ui.*
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import org.junit.After
import org.junit.Rule
import org.junit.Test
import org.junit.Assert.*

class LearningScreenTest {
    @get:Rule val compose = createComposeRule()
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    @After fun cleanup() { scope.cancel() }
    @Test fun languageChoicesAndVocabularyConfirmationAreEnglish() {
        val settings = object : SettingsRepository {
            override suspend fun model(clientId: String): String? = null
            override suspend fun setModel(clientId: String, slug: String) {}
            override suspend fun language() = TargetLanguage.GERMAN
            override suspend fun setLanguage(language: TargetLanguage) {}
        }
        val library = object : LibraryRepository {
            override val stories = MutableStateFlow<List<Story>>(emptyList())
            override suspend fun save(story: Story) { stories.value += story }
            override suspend fun delete(id: String) {}
        }
        val generator = object : GenerationRepository {
            override suspend fun suggest(language: TargetLanguage, topic: String, model: String) = listOf("Hund", "Katze", "Haus", "Brot", "Wasser")
            override suspend fun generate(language: TargetLanguage, words: List<String>, topic: String, model: String): Story = error("No inference needed")
        }
        val auth = AuthRepository(object : CredentialStore {
            override fun read() = CredentialSnapshot("test-host")
            override fun write(snapshot: CredentialSnapshot) {}
            override fun reset() {}
        }, object : OAuthApi {
            override suspend fun exchange(attempt: OAuthAttempt, callback: CallbackResult.Success): TokenGrant = error("No network")
            override suspend fun refresh(registration: Registration): TokenGrant = error("No network")
            override suspend fun signingKeys(): JWKSet = error("No network")
            override suspend fun revoke(registration: Registration) {}
        }, IdTokenValidator(), scope)
        val inference = object : InferenceRepository {
            override suspend fun models() = listOf(ModelChoice("mock", "Mock model"))
            override suspend fun check(model: String) = "Hello"
            override suspend fun generate(model: String, instructions: String, input: String) = error("No network")
        }
        val vm = StoryViewModel(generator, library, settings)
        val authentication = AuthenticationViewModel(auth, inference)
        compose.setContent {
            MaterialTheme {
                val state by vm.state.collectAsState()
                LearningScreen(AuthState(listOf(AccountSummary("test", "Test", true, true)), "test"),
                    ProbeState(models = listOf(ModelChoice("mock", "Mock model")), selectedModel = "mock"),
                    authentication, state, emptyList(), vm)
            }
        }
        compose.onNodeWithText("German").performClick()
        listOf("Japanese", "Russian", "Spanish (Chile)").forEach { compose.onNodeWithText(it).assertIsDisplayed() }
        compose.onAllNodesWithText("German").onLast().performClick()
        compose.onNodeWithText("Create story").performScrollTo().assertIsNotEnabled()
        compose.onNodeWithText("5–10 vocabulary items").performTextInput("Hund\nKatze\nHaus\nBrot\nWasser")
        compose.onNodeWithText("Confirm vocabulary").performScrollTo().performClick()
        compose.onNodeWithText("Create story").assertIsEnabled()
    }
}
