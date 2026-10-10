export interface FaqItem {
  id: string;
  group: 'start' | 'accuracy' | 'measuring' | 'data';
  q: string;
  a: string;
  /** Instruments where this question is relevant (shown in their "?" sheet). */
  modules?: string[];
}

export const FAQ_GROUPS: { id: FaqItem['group']; title: string }[] = [
  { id: 'start', title: 'Getting started' },
  { id: 'accuracy', title: 'Accuracy' },
  { id: 'measuring', title: 'Measuring' },
  { id: 'data', title: 'Your data' },
];

const LEVEL = ['spl', 'level', 'logger', 'traffic', 'rta', 'fft', 'soundscope', 'calibration'];
const PLAYBACK = ['distortion', 'ir', 'larsa', 'transfer', 'polarity', 'stipa', 'generator'];

export const FAQ: FaqItem[] = [
  {
    id: 'install',
    group: 'start',
    q: 'How do I put it on my Home Screen?',
    a: 'Open the link in Safari, tap Share, then Add to Home Screen. Open it from the new icon from then on.',
  },
  {
    id: 'mic',
    group: 'start',
    q: 'The microphone won’t start.',
    a: 'Allow microphone access when asked. If you said no before, go to iPhone Settings › Apps › Safari › Microphone and choose Ask or Allow. Also close other apps that are using the mic (calls, recorders).',
  },
  {
    id: 'update',
    group: 'start',
    q: 'How do I get the latest version?',
    a: 'Close the app and open it again while online. Updates load by themselves.',
  },
  {
    id: 'offline',
    group: 'start',
    q: 'Does it work without internet?',
    a: 'Yes, after you’ve opened it once online.',
  },
  {
    id: 'uncalibrated',
    group: 'accuracy',
    q: 'What does “Uncalibrated” mean?',
    a: 'Levels are only a rough guess until you calibrate. Go to Setup › Mic & Calibration, play a known level (a 94 dB calibrator, or steady noise next to a meter you trust), type the true value and tap Set.',
    modules: LEVEL,
  },
  {
    id: 'phone-mic',
    group: 'accuracy',
    q: 'How accurate is my phone’s microphone?',
    a: 'After calibration, good enough for most checks in the midrange. Phone mics are weaker below about 100 Hz and above about 10 kHz. Use an external measurement mic for serious work.',
    modules: [...LEVEL, 'ir', 'larsa', 'transfer'],
  },
  {
    id: 'external-mic',
    group: 'accuracy',
    q: 'Can I use an external mic or audio interface?',
    a: 'Yes. Plug it in, then choose it in Setup › Mic & Calibration (or on the Start microphone card). With an interface, pick the input your mic is on. Calibrate each mic once; the app remembers it per mic.',
    modules: [...LEVEL, 'ir', 'larsa', 'transfer', 'distortion', 'stipa'],
  },
  {
    id: 'mic-not-listed',
    group: 'accuracy',
    q: 'My external mic isn’t listed or isn’t used.',
    a: 'Unplug it, plug it back in, then stop and start the microphone. On iPhone the system often switches to a plugged-in mic by itself and may list just one input. Avoid Bluetooth headsets for measuring.',
    modules: ['calibration'],
  },
  {
    id: 'latency',
    group: 'accuracy',
    q: 'Delay or distance readings look wrong.',
    a: 'Every phone adds a little delay of its own. Go to Setup › Mic & Calibration › Measure latency with the mic held right at the phone’s speaker. Do it once.',
    modules: ['transfer', 'larsa', 'ir', 'calibration'],
  },
  {
    id: 'screen-lock',
    group: 'measuring',
    q: 'The reading stopped.',
    a: 'iPhone pauses the mic when the screen locks or you switch apps. Keep the app open on screen while measuring.',
    modules: ['logger', 'traffic', 'stipa', 'spl'],
  },
  {
    id: 'no-sound',
    group: 'measuring',
    q: 'I can’t hear the test signal.',
    a: 'Turn the volume up, check the silent switch, and check whether sound is going to Bluetooth headphones or a speaker.',
    modules: PLAYBACK,
  },
  {
    id: 'ir-dash',
    group: 'measuring',
    q: 'Impulse / RT60 shows “–” for some values.',
    a: 'The sweep wasn’t loud enough above the background noise. Turn the volume up, use 2–4 averages, and keep the room quiet.',
    modules: ['ir'],
  },
  {
    id: 'coherence',
    group: 'measuring',
    q: 'Transfer Function coherence is low.',
    a: 'Low coherence means the mic hears mostly noise or reflections. Play louder, move the mic closer to the speaker, and use slower averaging.',
    modules: ['transfer'],
  },
  {
    id: 'polarity-unclear',
    group: 'measuring',
    q: 'Polarity says “Unclear”.',
    a: 'Play louder, move closer to the speaker, and test one speaker at a time. Subwoofers can’t be checked with this method.',
    modules: ['polarity'],
  },
  {
    id: 'stipa',
    group: 'measuring',
    q: 'Why is STIPA marked experimental?',
    a: 'It follows the standard in simplified form and phone mics aren’t certified for it. Use it to compare positions or changes, not for official reports.',
    modules: ['stipa'],
  },
  {
    id: 'saved',
    group: 'data',
    q: 'Where are my saved measurements?',
    a: 'In Setup › Saved, on this phone only. Use Share to send them elsewhere. Clearing Safari’s website data deletes them.',
    modules: ['saved', 'rta', 'fft', 'spl', 'logger', 'ir', 'larsa', 'transfer', 'distortion', 'stipa'],
  },
  {
    id: 'privacy',
    group: 'data',
    q: 'Is any audio uploaded?',
    a: 'No. Everything is processed on your phone. Nothing is recorded to a server.',
  },
];

export const faqFor = (moduleId: string) => FAQ.filter((f) => f.modules?.includes(moduleId));
