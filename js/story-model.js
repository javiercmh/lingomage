// Additive legacy interpretation; paths pin exact versions (PED-003).
export function createStoryModel({state, readerStory}) {
  function normalizeChapters(story) {
    if (Array.isArray(story.chapters) && story.chapters.length) return story.chapters;
    const version = { id: `legacy-${story.id}`, title: story.title || '', story: story.story || '', titleSegments: story.titleSegments || null, storySegments: story.storySegments || null, glossary: story.glossary || [], createdAt: story.createdAt, promptVersion: story.promptVersion, providerId: story.providerId, model: story.model };
    return [{ id: `chapter-${story.id}`, activeVersionId: version.id, versions: [version], prompt: '', help: [] }];
  }
  // PED-003: paths pin exact versions; memory never mixes alternate histories.
  function ensureStoryPaths(story) {
    if (story.paths?.length) { initializePathCounter(story); return; }
    const chapters = normalizeChapters(story), paths = [];
    const lineage = (index, version) => {
      const result = [], seen = new Set();
      while (index >= 0 && version && !seen.has(version.id)) {
        seen.add(version.id); result.unshift({ chapterId: chapters[index].id, versionId: version.id });
        if (!index) break;
        let origin = version;
        const localSeen = new Set();
        while (origin.sourceVersionId && !localSeen.has(origin.id)) {
          localSeen.add(origin.id);
          const earlier = chapters[index].versions.find(v => v.id === origin.sourceVersionId);
          if (!earlier) break;
          origin = earlier;
        }
        const previous = chapters[index - 1];
        const prior = previous.versions.find(v => v.id === origin.sourceVersionId)
          || previous.versions.find(v => v.id === chapters[index].basedOnVersionId);
        if (!prior) result.uncertain = true;
        version = prior || previous.versions.find(v => v.id === previous.activeVersionId) || previous.versions[0];
        index--;
      }
      return result;
    };
    const last = chapters.length - 1;
    const original = lineage(last, chapters[last].versions.find(v => v.id === chapters[last].activeVersionId) || chapters[last].versions[0]);
    paths.push({ id: 'original', name: 'Original', entries: [...original], uncertain: !!original.uncertain });
    chapters.forEach((chapter, index) => chapter.versions.forEach(version => {
      if (paths.some(path => path.entries.some(entry => entry.versionId === version.id))) return;
      const entries = lineage(index, version);
      paths.push({ id: `legacy-path-${version.id}`, name: `Alternate ${paths.length}`, forkChapter: index + 1, entries: [...entries], uncertain: !!entries.uncertain });
    }));
    story.paths = paths; story.activePathId = paths[0].id; initializePathCounter(story);
  }
  function initializePathCounter(story) {
    const maximum = Math.max(0, ...(story.paths || []).map(path => Number(/^Alternate (\d+)$/.exec(path.name)?.[1]) || 0));
    story.nextAlternateNumber = Math.max(story.nextAlternateNumber || 1, maximum + 1);
  }
  function selectedPath(story = readerStory()) { ensureStoryPaths(story); return story.paths.find(path => path.id === story.activePathId) || story.paths[0]; }
  function pathChapters(story = readerStory()) {
    return selectedPath(story).entries.map(entry => normalizeChapters(story).find(chapter => chapter.id === entry.chapterId));
  }
  function activeChapter(story = readerStory()) { return pathChapters(story)[state.readerChapter] || pathChapters(story)[0]; }
  function activeVersion(chapter = activeChapter(), story = readerStory()) {
    const entry = selectedPath(story).entries.find(item => item.chapterId === chapter.id);
    return chapter.versions.find(version => version.id === entry?.versionId) || chapter.versions.find(version => version.id === chapter.activeVersionId) || chapter.versions[0];
  }

  return {normalizeChapters, ensureStoryPaths, initializePathCounter, selectedPath, pathChapters, activeChapter, activeVersion};
}
