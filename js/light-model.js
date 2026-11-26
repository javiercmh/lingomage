// Light tasks (vocabulary notes, Japanese readings, story context summaries) may use a second model chosen
// in Settings. Empty or no longer offered by the provider means the story model and its effort.

// {model, reasoning} for the light tasks of an operation, or null to use the story model.
export function lightModelChoice(state) {
  const model = state.lightModel && (state.models || []).find(item => item.id === state.lightModel);
  if (!model) return null;
  return { model: model.id, reasoning: model.reasoningLevels?.includes(state.lightReasoning) ? state.lightReasoning : '' };
}

// Config for requests that are wholly light tasks (story memory).
export function lightTaskConfig(state) {
  const light = lightModelChoice(state);
  return light ? { providerId: state.providerId, model: light.model, reasoning: light.reasoning } : { providerId: state.providerId, model: state.model, reasoning: state.reasoning };
}
