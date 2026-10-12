const LATIN_AMERICAN_SPANISH = new Set(['AR','BO','CL','CO','CR','CU','DO','EC','GT','HN','MX','NI','PA','PE','PR','PY','SV','UY','VE','419']);

function localeParts(value) {
  try {
    const locale = new Intl.Locale(value);
    return { language: locale.language.toLowerCase(), region: (locale.region || '').toUpperCase() };
  } catch {
    const parts = String(value || '').split('-');
    const region = parts.slice(1).find(part => /^[A-Za-z]{2}$/.test(part) || /^\d{3}$/.test(part)) || '';
    return { language: (parts[0] || '').toLowerCase(), region: region.toUpperCase() };
  }
}

export function chooseSpanishVoice(voices = []) {
  const spanish = voices.filter(voice => localeParts(voice.language).language === 'es');
  const tier = voice => {
    const { region } = localeParts(voice.language);
    if (region === 'CL') return 0;
    if (LATIN_AMERICAN_SPANISH.has(region)) return 1;
    return 2;
  };
  return spanish.sort((a, b) => tier(a) - tier(b) || Number(Boolean(a.requiresNetwork)) - Number(Boolean(b.requiresNetwork)) || String(a.id).localeCompare(String(b.id)))[0] || null;
}

export async function prepareSpeechOptions(speech, text, language) {
  let options = { text, language };
  let voice = null;
  if (language === 'es-CL') {
    const { voices } = await speech.voices();
    voice = chooseSpanishVoice(voices);
    if (!voice) throw new Error('No Spanish voice is available. Install Spanish voice data in Android text-to-speech settings.');
    options = { ...options, voiceId: voice.id };
  }
  return { options, voice };
}

export async function speakSelection(speech, text, language) {
  const { options } = await prepareSpeechOptions(speech, text, language);
  return speech.speak(options);
}

// Keep whole-chapter playback below Android's per-utterance input limit.
export async function speakChapter(speech, text, language, isCurrent = () => true) {
  const { options } = await prepareSpeechOptions(speech, text, language);
  let remaining = text;
  while (remaining && isCurrent()) {
    let end = Math.min(2000, remaining.length);
    if (end < remaining.length) {
      const boundary = remaining.lastIndexOf(' ', end);
      if (boundary > end / 2) end = boundary + 1;
      if (/[\uD800-\uDBFF]/u.test(remaining[end - 1])) end--;
    }
    const result = await speech.speak({ ...options, text: remaining.slice(0, end) });
    if (result?.status === 'cancelled') return result;
    remaining = remaining.slice(end);
  }
  return { status: isCurrent() ? 'completed' : 'cancelled' };
}
