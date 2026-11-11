// Aligne les mots du script sur les mots entendus par whisper : les sous-titres gardent l'orthographe du script
// (« Framesmith ») avec les timings de la voix, même quand whisper coupe ou fusionne des mots (« Frême Smith! »).
//
// Les lettres des deux textes sont alignées (distance d'édition), chaque lettre entendue a son instant (interpolé dans
// son mot), et chaque mot du script prend l'instant de sa première et de sa dernière lettre alignées.

/** Lettres et chiffres seulement, en minuscules et sans accents : ce qui s'entend. */
const letters = (text) =>
  text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");

/**
 * @param {string[]} want les mots du script
 * @param {{ text: string, start: number, end: number }[]} heard les mots de whisper, avec leurs instants (s)
 * @returns {{ text: string, start: number, end: number }[]} un mot par mot du script
 */
export function alignWords(want, heard) {
  if (want.length === 0) return [];
  if (heard.length === 0) return want.map((text) => ({ text, start: 0, end: 0 }));

  // Each heard letter with its moment: letters spread evenly over their word.
  const heardTimes = [];
  const heardWordOf = [];
  let heardText = "";
  for (const word of heard) {
    const chars = letters(word.text);
    for (let i = 0; i < chars.length; i++) {
      heardTimes.push(word.start + ((word.end - word.start) * i) / chars.length);
      heardWordOf.push(word);
    }
    heardText += chars;
  }
  const wantChars = want.map(letters);
  const wantText = wantChars.join("");
  if (!heardText || !wantText) {
    // Nothing to align letter by letter: spread the script over the voice.
    const start = heard[0].start;
    const end = heard[heard.length - 1].end;
    return want.map((text, i) => ({ text, start: start + ((end - start) * i) / want.length, end: start + ((end - start) * (i + 1)) / want.length }));
  }

  // Edit distance between the two letter strings, then the path back: each script letter gets the heard letter it
  // matched or replaced, or none (a letter whisper did not hear).
  const n = wantText.length;
  const m = heardText.length;
  const cost = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = 0; i <= n; i++) cost[i][0] = i;
  for (let j = 0; j <= m; j++) cost[0][j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const same = wantText[i - 1] === heardText[j - 1] ? 0 : 1;
      cost[i][j] = Math.min(cost[i - 1][j - 1] + same, cost[i - 1][j] + 1, cost[i][j - 1] + 1);
    }
  }
  const matched = new Array(n).fill(-1);
  for (let i = n, j = m; i > 0 && j > 0; ) {
    const same = wantText[i - 1] === heardText[j - 1] ? 0 : 1;
    if (cost[i][j] === cost[i - 1][j - 1] + same) {
      matched[i - 1] = j - 1;
      i--;
      j--;
    } else if (cost[i][j] === cost[i - 1][j] + 1) i--;
    else j--;
  }

  // A script word takes the moments of its first and last matched letters; a word with none sits between its
  // neighbours.
  const words = [];
  let offset = 0;
  for (const [index, chars] of wantChars.entries()) {
    const hits = [];
    for (let k = offset; k < offset + chars.length; k++) if (matched[k] >= 0) hits.push(matched[k]);
    offset += chars.length;
    if (hits.length) {
      // The word ends with its last letter: where the next letter starts, within the heard word that holds it.
      const last = hits[hits.length - 1];
      const endWord = heardWordOf[last];
      const nextTime = last + 1 < heardTimes.length ? heardTimes[last + 1] : endWord.end;
      words.push({ text: want[index], start: heardTimes[hits[0]], end: Math.min(nextTime, endWord.end) });
    } else words.push({ text: want[index], start: null, end: null });
  }
  for (const [i, word] of words.entries()) {
    if (word.start !== null) continue;
    const previous = words.slice(0, i).reverse().find((w) => w.start !== null);
    const next = words.slice(i + 1).find((w) => w.start !== null);
    const at = previous ? previous.end : (next?.start ?? heard[0].start);
    word.start = at;
    word.end = next ? Math.max(at, next.start) : at;
  }
  // Moments only go forward.
  for (let i = 1; i < words.length; i++) {
    if (words[i].start < words[i - 1].start) words[i].start = words[i - 1].start;
    if (words[i].end < words[i].start) words[i].end = words[i].start;
  }
  return words;
}
