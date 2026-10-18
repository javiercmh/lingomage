// Shared harness wiring imports production modules; callbacks remain replaceable
// by a test without re-evaluating fragments of their implementation.
import { createStoryModel } from '../../js/story-model.js';
import { createStoryMemory } from '../../js/story-memory.js';
import { createGenerationController } from '../../js/generation-controller.js';
import { createReaderPanels } from '../../js/reader-panels.js';
export function bindStory(context) {
  Object.assign(context, createStoryModel({state:context.state, readerStory:(...args)=>context.readerStory(...args)}));
  Object.assign(context, createStoryMemory({state:context.state, promptVersion:context.PROMPT_VERSION || 'test', normalizeChapters:(...args)=>context.normalizeChapters(...args), readerAi:(...args)=>context.readerAi(...args), savePendingReaderResult:(...args)=>context.savePendingReaderResult(...args)}));
}
export function bindGeneration(context) {
  Object.assign(context, createGenerationController({state:context.state, normalizeChapters:(...args)=>context.normalizeChapters(...args), ensureStoryPaths:(...args)=>context.ensureStoryPaths(...args), persistReaderStory:(...args)=>context.persistReaderStory(...args), savedFollowUps:(...args)=>context.savedFollowUps(...args)}));
}
export function bindPanels(context) {
  const panels=createReaderPanels({...context, getComputedStyle:(...args)=>context.getComputedStyle(...args), readerPanel:(...args)=>context.readerPanel(...args), closeWordNote:(...args)=>context.closeWordNote(...args)});
  Object.assign(context, panels); return panels;
}
