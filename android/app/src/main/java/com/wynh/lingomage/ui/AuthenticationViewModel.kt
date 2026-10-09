package com.wynh.lingomage.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.wynh.lingomage.auth.AuthRepository
import com.wynh.lingomage.auth.AuthenticationRepository
import com.wynh.lingomage.network.InferenceRepository
import com.wynh.lingomage.network.ModelChoice
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import com.wynh.lingomage.settings.SettingsRepository

data class ProbeState(
    val busy: Boolean = false,
    val models: List<ModelChoice> = emptyList(),
    val selectedModel: String? = null,
    val reasoning: String? = null,
    val response: String? = null,
    val error: String? = null
)

class AuthenticationViewModel(val auth: AuthenticationRepository, private val inference: InferenceRepository,
    private val settings: SettingsRepository? = null) : ViewModel() {
    private val mutableProbe = MutableStateFlow(ProbeState())
    val probe = mutableProbe.asStateFlow()
    private var probeJob: Job? = null

    fun signIn(clientId: String? = null) {
        clearProbe()
        auth.beginSignIn(clientId)
    }

    fun selectAccount(clientId: String) = operation {
        auth.selectAccount(clientId)
        mutableProbe.value = ProbeState()
    }

    fun loadModels() = operation {
        val choices = inference.models()
        val account = auth.state.value.activeClientId
        val saved = account?.let { settings?.model(it) }
        val model = choices.firstOrNull { it.slug == saved } ?: choices.first()
        val reasoning = account?.let { settings?.reasoning(it, model.slug) }?.takeIf { it in model.reasoningLevels }
        mutableProbe.update { it.copy(models = choices, selectedModel = model.slug, reasoning = reasoning) }
    }

    fun chooseModel(model: String) {
        if (mutableProbe.value.models.none { it.slug == model }) return
        mutableProbe.update { it.copy(selectedModel = model, reasoning = null, response = null) }
        auth.state.value.activeClientId?.let { account -> viewModelScope.launch {
            try {
                settings?.setModel(account, model)
                val saved = settings?.reasoning(account, model)?.takeIf { effort -> effort in mutableProbe.value.models.first { it.slug == model }.reasoningLevels }
                if (mutableProbe.value.selectedModel == model) mutableProbe.update { it.copy(reasoning = saved) }
            }
            catch (_: Exception) { mutableProbe.update { it.copy(error = "The model preference could not be saved. Your selection works for this session.") } }
        } }
    }

    fun chooseReasoning(effort: String?) {
        val current = mutableProbe.value
        val model = current.models.firstOrNull { it.slug == current.selectedModel } ?: return
        if (effort != null && effort !in model.reasoningLevels) return
        val account = auth.state.value.activeClientId ?: return
        viewModelScope.launch {
            try {
                settings?.setReasoning(account, model.slug, effort)
                if (mutableProbe.value.selectedModel == model.slug) mutableProbe.update { it.copy(reasoning = effort, response = null) }
            } catch (_: Exception) { mutableProbe.update { it.copy(error = "The reasoning preference could not be saved. Please try again.") } }
        }
    }

    fun checkInference() = operation {
        val model = mutableProbe.value.selectedModel ?: error("Choose a model first")
        mutableProbe.update { it.copy(response = null) }
        val response = inference.check(model)
        mutableProbe.update { it.copy(response = response) }
    }

    fun signOut() = operation {
        auth.signOut()
        mutableProbe.value = ProbeState()
    }

    fun resetCredentials() = operation {
        auth.resetLocalCredentials()
        mutableProbe.value = ProbeState()
    }

    fun cancelProbe() { probeJob?.cancel() }

    private fun clearProbe() { probeJob?.cancel(); mutableProbe.value = ProbeState() }

    private fun operation(block: suspend () -> Unit) {
        if (probeJob?.isActive == true) return
        mutableProbe.update { it.copy(busy = true, error = null) }
        probeJob = viewModelScope.launch {
            try { block() }
            catch (_: CancellationException) { mutableProbe.update { it.copy(error = "Request cancelled. You can try again.") } }
            catch (e: Exception) { mutableProbe.update { it.copy(error = AuthRepository.message(e)) } }
            finally { mutableProbe.update { it.copy(busy = false) } }
        }
    }

    companion object {
        fun factory(auth: AuthenticationRepository, inference: InferenceRepository, settings: SettingsRepository? = null): ViewModelProvider.Factory = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T {
                require(modelClass.isAssignableFrom(AuthenticationViewModel::class.java))
                return AuthenticationViewModel(auth, inference, settings) as T
            }
        }
    }
}
