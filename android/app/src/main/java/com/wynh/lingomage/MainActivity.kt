package com.wynh.lingomage

import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.browser.customtabs.CustomTabsIntent
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.graphics.Color
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.repeatOnLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.wynh.lingomage.ui.AuthenticationScreen
import com.wynh.lingomage.ui.AuthenticationViewModel
import com.wynh.lingomage.ui.StoryViewModel
import com.wynh.lingomage.ui.LearningScreen

class MainActivity : ComponentActivity() {
    override fun onStart() {
        super.onStart()
        (application as LingoMageApplication).auth.setForeground(true)
    }

    override fun onStop() {
        (application as LingoMageApplication).auth.setForeground(false)
        super.onStop()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val app = application as LingoMageApplication
        setContent {
            val vm: AuthenticationViewModel = viewModel(factory = AuthenticationViewModel.factory(app.auth, app.inference, app.settings))
            val storiesVm: StoryViewModel = viewModel(factory = StoryViewModel.factory(app.generation, app.library, app.settings))
            val auth by app.auth.state.collectAsStateWithLifecycle()
            val probe by vm.probe.collectAsStateWithLifecycle()
            val storyState by storiesVm.state.collectAsStateWithLifecycle()
            val stories by storiesVm.stories.collectAsStateWithLifecycle()
            val canInfer = auth.accounts.any { it.clientId == auth.activeClientId && it.canInfer }
            LaunchedEffect(auth.activeClientId, canInfer) { if (canInfer) vm.loadModels() }
            LaunchedEffect(app.auth) {
                lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
                    for (url in app.auth.browserRequests) {
                        try { CustomTabsIntent.Builder().build().launchUrl(this@MainActivity, Uri.parse(url)) }
                        catch (_: Exception) { app.auth.cancelSignIn() }
                    }
                }
            }
            val colors = if (isSystemInDarkTheme()) darkColorScheme(primary = Color(0xFFAACFC3))
                else lightColorScheme(primary = Color(0xFF245F50), background = Color(0xFFFAF8F2), surface = Color(0xFFFAF8F2))
            MaterialTheme(colorScheme = colors) {
                LearningScreen(auth, probe, vm, storyState, stories, storiesVm)
            }
        }
    }
}
