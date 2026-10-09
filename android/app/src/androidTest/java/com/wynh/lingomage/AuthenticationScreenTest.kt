package com.wynh.lingomage

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performClick
import com.wynh.lingomage.auth.AuthPhase
import com.wynh.lingomage.auth.AuthState
import com.wynh.lingomage.ui.AuthenticationScreen
import com.wynh.lingomage.ui.ProbeState
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

class AuthenticationScreenTest {
    @get:Rule val compose = createComposeRule()

    @Test fun displaysFourFeaturedLanguagesAndEnglishSignInAction() {
        var clicked = false
        compose.setContent {
            MaterialTheme {
                AuthenticationScreen(AuthState(), ProbeState(), { clicked = true }, {}, {}, {}, {}, {}, {}, {}, {})
            }
        }
        compose.onNodeWithText("German · Japanese · Russian · Spanish (Chile)").assertIsDisplayed()
        compose.onNodeWithText("Continue with ChatGPT").performClick()
        assertTrue(clicked)
    }

    @Test fun reasoningPickerShowsSupportedLevelsAndUsesCallback() {
        var effort: String? = null
        compose.setContent {
            MaterialTheme {
                AuthenticationScreen(
                    AuthState(accounts = listOf(com.wynh.lingomage.auth.AccountSummary("test", "Test", true, true)), activeClientId = "test"),
                    ProbeState(models = listOf(com.wynh.lingomage.network.ModelChoice("mock", "Mock", listOf("low", "high"))), selectedModel = "mock"),
                    {}, {}, {}, {}, {}, {}, {}, {}, {}, onChooseReasoning = { effort = it })
            }
        }
        compose.onNodeWithText("Model default").performScrollTo().performClick()
        compose.onNodeWithText("High").performClick()
        org.junit.Assert.assertEquals("high", effort)
    }

    @Test fun waitingStateProvidesExplicitCancellation() {
        var cancelled = false
        compose.setContent {
            MaterialTheme {
                AuthenticationScreen(AuthState(phase = AuthPhase.WAITING_FOR_BROWSER), ProbeState(), {}, { cancelled = true }, {}, {}, {}, {}, {}, {}, {})
            }
        }
        compose.onNodeWithText("Cancel sign-in").performClick()
        assertTrue(cancelled)
    }
}
