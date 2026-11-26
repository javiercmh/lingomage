// Light tasks may use a second model chosen in Settings → Advanced. Empty or no longer offered by the
// provider means the story model and its effort. Settings → Advanced → "Use the light model for" picks the
// tasks; story planning and writing always use the story model.
// notes: vocabulary notes, including Define. readings: Japanese kanji readings. memory: story context
// summaries and condensing. explanations: Explain and More detail. examples: Generate examples.
export const LIGHT_TASKS = ['notes', 'readings', 'memory', 'explanations', 'examples'];
export const DEFAULT_LIGHT_TASKS = ['notes', 'readings', 'memory'];

// The saved task list, or the default when absent or unreadable. Unknown names are ignored.
export function lightTasks(state) {
  return Array.isArray(state.lightTasks) ? LIGHT_TASKS.filter(task => state.lightTasks.includes(task)) : [...DEFAULT_LIGHT_TASKS];
}

// {model, reasoning, tasks} for the light tasks of an operation, or null to use the story model throughout.
export function lightModelChoice(state) {
  const model = state.lightModel && (state.models || []).find(item => item.id === state.lightModel);
  if (!model) return null;
  return { model: model.id, reasoning: model.reasoningLevels?.includes(state.lightReasoning) ? state.lightReasoning : '', tasks: lightTasks(state) };
}

// Config for a request that is wholly one task (story memory, Define, explanations): the light model when
// one is chosen and that task is ticked, otherwise the story model and its effort.
export function lightTaskConfig(state, task = 'memory') {
  const light = lightModelChoice(state);
  return light && light.tasks.includes(task) ? { providerId: state.providerId, model: light.model, reasoning: light.reasoning } : { providerId: state.providerId, model: state.model, reasoning: state.reasoning };
}
