// mlbox tokenizer engine — dependency-free re-implementation of the two BPE
// families that actually matter for LLMs, so everything runs offline in the
// browser:
//
//   kind "tiktoken"  : OpenAI cl100k_base / o200k_base  (rank == merge priority)
//   kind "bytelevel" : HF ByteLevel BPE — Llama 3, Qwen2.5, DeepSeek
//   kind "metaspace" : HF Metaspace BPE — Mistral, Gemma 3 (byte fallback)
//
// Output is verified token-for-token against the upstream Rust implementations
// (tiktoken 0.14 + tokenizers 0.23) by `npm test`, see tests/tokenizer.test.mjs.

// --------------------------------------------------------------------------
// GPT-2 byte <-> unicode mapping
// --------------------------------------------------------------------------
const BYTE_TO_CHAR = new Uint16Array(256);
const CHAR_TO_BYTE = new Map();
(() => {
  const bs = [];
  for (let i = 0x21; i <= 0x7e; i++) bs.push(i);
  for (let i = 0xa1; i <= 0xac; i++) bs.push(i);
  for (let i = 0xae; i <= 0xff; i++) bs.push(i);
  const cs = bs.slice();
  let n = 0;
  for (let b = 0; b < 256; b++) {
    if (!bs.includes(b)) {
      bs.push(b);
      cs.push(256 + n);
      n += 1;
    }
  }
  for (let i = 0; i < bs.length; i++) {
    BYTE_TO_CHAR[bs[i]] = cs[i];
    CHAR_TO_BYTE.set(String.fromCharCode(cs[i]), bs[i]);
  }
})();

const _enc = new TextEncoder();
const _dec = new TextDecoder("utf-8", { fatal: false });

export function bytesToByteChars(str) {
  const bytes = _enc.encode(str);
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(BYTE_TO_CHAR[bytes[i]]);
  return out;
}

export function byteCharsToString(str) {
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    const b = CHAR_TO_BYTE.get(str[i]);
    bytes[i] = b === undefined ? 0x3f : b;
  }
  return _dec.decode(bytes);
}

// --------------------------------------------------------------------------
// Pattern translation
// --------------------------------------------------------------------------
// JS `\s` is *not* the same set as the Rust regex crate's `\s` (White_Space):
// JS includes U+FEFF, Rust includes U+0085 (NEL). Both show up in real text, so
// we spell the Rust class out explicitly.
const WS_CONTENT = "\\t-\\r \\u0085\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000";

export function translatePattern(src) {
  let out = "";
  let inClass = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === "\\") {
      const n = src[i + 1];
      if (n === "s" || n === "S") {
        const body = n === "s" ? WS_CONTENT : "^" + WS_CONTENT;
        out += inClass ? body : "[" + body + "]";
        i++;
        continue;
      }
      out += c + n;
      i++;
      continue;
    }
    if (c === "[" && !inClass) inClass = true;
    else if (c === "]" && inClass) inClass = false;
    out += c;
  }
  return out;
}

// --------------------------------------------------------------------------
// Pre-tokenisation helpers
// --------------------------------------------------------------------------

/** Split with Hugging Face `Split(behavior=Isolated)` semantics: matches become
 *  their own pieces and the text between matches does too. */
export function splitIsolated(text, re) {
  const parts = [];
  let last = 0;
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[0].length === 0) {
      re.lastIndex++; // guard against zero-length matches
      continue;
    }
    parts.push(m[0]);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

/** tiktoken only emits regex matches (its patterns are exhaustive); we track
 *  whether anything was skipped so the test-suite can prove nothing is. */
export function matchAllPieces(text, re) {
  const parts = [];
  let dropped = 0;
  let last = 0;
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    dropped += m.index - last;
    parts.push(m[0]);
    last = m.index + m[0].length;
  }
  dropped += text.length - last;
  return { parts, dropped };
}

// --------------------------------------------------------------------------
// Added tokens (literal, pre-model matching)
// --------------------------------------------------------------------------
export function buildTrie(added) {
  if (!added || !added.length) return null;
  const root = { next: new Map(), id: null, content: null };
  for (const a of added) {
    let node = root;
    for (const ch of a.content) {
      if (!node.next.has(ch)) node.next.set(ch, { next: new Map(), id: null, content: null });
      node = node.next.get(ch);
    }
    node.id = a.id;
    node.content = a.content;
  }
  return root;
}

export function matchTrie(root, text, start) {
  let node = root;
  let best = null;
  for (let i = start; i < text.length; i++) {
    node = node.next.get(text[i]);
    if (!node) break;
    if (node.id !== null) best = node; // keep going: longest match wins
  }
  return best;
}

// --------------------------------------------------------------------------
// Offset-aware variants (used by the diff view; `encode()` is untouched)
// --------------------------------------------------------------------------
export function splitIsolatedWithOffsets(text, re) {
  const parts = [], offsets = [];
  let last = 0;
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) { parts.push(text.slice(last, m.index)); offsets.push([last, m.index]); }
    if (m[0].length === 0) { re.lastIndex++; continue; }
    parts.push(m[0]); offsets.push([m.index, m.index + m[0].length]);
    last = m.index + m[0].length;
  }
  if (last < text.length) { parts.push(text.slice(last)); offsets.push([last, text.length]); }
  return { parts, offsets };
}

export function matchAllWithOffsets(text, re) {
  const parts = [], offsets = [];
  let dropped = 0, last = 0;
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    dropped += m.index - last;
    parts.push(m[0]);
    offsets.push([m.index, m.index + m[0].length]);
    last = m.index + m[0].length;
  }
  dropped += text.length - last;
  return { parts, offsets, dropped };
}

/** Map byte-level pieces back onto character spans of the original part. */
function byteCharSpans(part, pieces) {
  const csb = new Array(part.length + 1);
  csb[0] = 0;
  for (let i = 0; i < part.length; i++) {
    const c = part.charCodeAt(i);
    const b = c < 0x80 ? 1 : c < 0x800 ? 2 : c >= 0xd800 && c <= 0xdbff ? 2 : 3;
    csb[i + 1] = csb[i] + b;
  }
  const charAt = (bp) => {
    let lo = 0, hi = part.length;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (csb[mid] <= bp) lo = mid; else hi = mid - 1; }
    return lo;
  };
  const out = [];
  let b = 0;
  let prevEnd = 0;
  for (const piece of pieces) {
    const nb = b + piece.length;
    const x = charAt(nb);
    const end = csb[x] === nb ? x : x + 1;
    out.push([prevEnd, end]); // chain starts so spans partition the part exactly
    prevEnd = end;
    b = nb;
  }
  return out;
}

// --------------------------------------------------------------------------
// BPE core
// --------------------------------------------------------------------------

/** Greedy BPE. `rank(a, b)` returns the merge priority of a pair, or undefined.
 *  Matches tiktoken's `byte_pair_merge`: repeatedly merge every occurrence of
 *  the lowest-rank adjacent pair until no mergeable pair remains. */
export function bpeMerge(chars, rank) {
  let parts = Array.from(chars);
  while (parts.length > 1) {
    let best = Infinity;
    for (let i = 0; i < parts.length - 1; i++) {
      const r = rank(parts[i], parts[i + 1]);
      if (r !== undefined && r < best) best = r;
    }
    if (!Number.isFinite(best)) break;

    // merge every occurrence of that pair, left to right
    const next = [];
    for (let i = 0; i < parts.length; i++) {
      if (i < parts.length - 1 && rank(parts[i], parts[i + 1]) === best) {
        next.push(parts[i] + parts[i + 1]);
        i++;
      } else {
        next.push(parts[i]);
      }
    }
    if (next.length === parts.length) break; // nothing merged; avoid a loop
    parts = next;
  }
  return parts;
}

// --------------------------------------------------------------------------
// Tokenizer
// --------------------------------------------------------------------------
export class Tokenizer {
  constructor(data) {
    this.id = data.id;
    this.kind = data.kind;
    this.label = data.label || data.id;
    this.org = data.org || "";
    this.note = data.note || "";
    this.byteFallback = !!data.byteFallback;
    this.unkId = data.unkId === undefined || data.unkId === null ? -1 : data.unkId;
    this.normalizer = data.normalizer || null;

    this.vocab = data.vocab;
    this.vocabSize = data.vocab.length;

    // token string -> id
    this.tokenToId = new Map();
    for (let i = 0; i < this.vocab.length; i++) {
      const t = this.vocab[i];
      if (!this.tokenToId.has(t)) this.tokenToId.set(t, i);
    }

    if (this.kind === "tiktoken") {
      // for tiktoken encodings the vocab order *is* the merge priority
      this.rank = (a, b) => {
        const id = this.tokenToId.get(a + b);
        return id === undefined ? undefined : id;
      };
      this._rankCache = new Map();
      this.rank = (a, b) => {
        const key = a + "\u0000" + b;
        let r = this._rankCache.get(key);
        if (r === undefined) {
          const id = this.tokenToId.get(a + b);
          r = id === undefined ? -1 : id;
          this._rankCache.set(key, r);
        }
        return r < 0 ? undefined : r;
      };
    } else {
      // HF BPE: explicit merge list -> (leftId, rightId) -> priority
      this.pairRank = new Map();
      const m = data.merges || [];
      for (let i = 0; i < m.length; i += 2) {
        const key = m[i] * 16777216 + m[i + 1]; // ids < 2^24 for every model here
        if (!this.pairRank.has(key)) this.pairRank.set(key, i >> 1);
      }
      this.maxId = this.vocabSize;
      this.rank = (a, b) => {
        const ia = this.tokenToId.get(a);
        if (ia === undefined) return undefined;
        const ib = this.tokenToId.get(b);
        if (ib === undefined) return undefined;
        return this.pairRank.get(ia * 16777216 + ib);
      };
      this._rankCache = new Map();
      const baseRank = this.rank;
      this.rank = (a, b) => {
        const key = a + "\u0000" + b;
        let r = this._rankCache.get(key);
        if (r === undefined) {
          const v = baseRank(a, b);
          r = v === undefined ? -1 : v;
          this._rankCache.set(key, r);
        }
        return r < 0 ? undefined : r;
      };
    }

    this.patterns = (data.patterns || []).map((p) => new RegExp(translatePattern(p), "gu"));
    this.patternSources = (data.patterns || []).map((p) => translatePattern(p));

    // Hugging Face matches "added tokens" as literal strings *before* the model
    // runs. Gemma 3 ships 6,406 of them (</div>, <start_of_turn>, ...), so this
    // materially changes its counts. tiktoken is excluded on purpose: the
    // reference treats special-token text as ordinary input.
    this.addedTokens = this.kind === "tiktoken" ? [] : (data.addedTokens || []);
    this.trie = buildTrie(this.addedTokens);
  }

  /** UTF-8 byte length of a piece, used for the "bytes per token" stat. */
  static byteLength(s) {
    return _enc.encode(s).length;
  }

  _normalize(text) {
    if (this.normalizer === "nfc") return text.normalize("NFC");
    if (this.normalizer === "space-to-underscore") return text.replace(/ /g, "\u2581");
    return text;
  }

  /** pieces = the pre-token chunks, exactly as the upstream pre-tokenizer sees them */
  _pretokenize(text, prepend = true) {
    const t = this._normalize(text);
    if (this.kind === "tiktoken") {
      // `.tiktoken` vocab entries live in byte-level char space, so the pieces
      // have to be mapped there too (this is what makes non-ASCII work)
      return matchAllPieces(t, this.patterns[0]).parts.map(bytesToByteChars);
    }
    if (this.kind === "bytelevel") {
      let parts = [t];
      for (const re of this.patterns) {
        const next = [];
        for (const p of parts) next.push(...splitIsolated(p, re));
        parts = next;
      }
      return parts.map(bytesToByteChars);
    }
    // metaspace (Mistral / Gemma): spaces become ▁, BPE runs over characters
    if (this.id === "mistral") {
      if (!t.length) return [""];
      let s = t.replace(/ /g, "\u2581");
      // HF Metaspace prepend_scheme="first" == SentencePiece add_dummy_prefix:
      // the dummy ▁ goes on part index 0 only, and only if it isn't already
      // there. If the text starts with an added token, index 0 is the empty
      // string, so *no* part gets a prefix.
      if (prepend && !s.startsWith("\u2581")) s = "\u2581" + s;
      return [s];
    }
    return [t];
  }

  _idsFromPieces(pieces) {
    const ids = [];
    let pendingUnk = false;
    const push = (tok) => {
      const id = this.tokenToId.get(tok);
      if (id !== undefined) {
        ids.push(id);
        pendingUnk = false;
        return;
      }
      if (this.byteFallback) {
        // fall back to raw bytes: <0x41> style tokens
        const bytes = _enc.encode(this.kind === "metaspace" ? tok : byteCharsToString(tok));
        for (const b of bytes) {
          const hex = "<0x" + b.toString(16).toUpperCase().padStart(2, "0") + ">";
          const bid = this.tokenToId.get(hex);
          if (bid !== undefined) {
            ids.push(bid);
            pendingUnk = false;
          } else {
            this._pushUnk(ids);
          }
        }
        return;
      }
      this._pushUnk(ids);
    };
    for (const p of pieces) push(p);
    void pendingUnk;
    return ids;
  }

  _pushUnk(ids) {
    // fuse_unk=true for the metaspace models: consecutive unknowns collapse
    if (this.unkId >= 0 && ids[ids.length - 1] === this.unkId) return;
    if (this.unkId >= 0) ids.push(this.unkId);
    else ids.push(0);
  }

  /** Split text on added tokens, longest match first (HF semantics). */
  _splitAddedTokens(text) {
    if (!this.trie) return [{ text, id: null, start: 0, end: text.length }];
    const out = [];
    let buf = "";
    let bufStart = 0;
    let i = 0;
    const flush = () => {
      if (buf) { out.push({ text: buf, id: null, start: bufStart, end: i }); buf = ""; }
    };
    while (i < text.length) {
      const hit = matchTrie(this.trie, text, i);
      if (hit) {
        flush();
        out.push({ text: hit.content, id: hit.id, start: i, end: i + hit.content.length });
        i += hit.content.length;
        bufStart = i;
      } else {
        if (!buf) bufStart = i;
        buf += text[i];
        i += 1;
      }
    }
    flush();
    return out;
  }

  /** Full encode: returns token ids plus human-readable pieces. */
  encode(text) {
    if (!text) return { ids: [], pieces: [] };
    const ids = [];
    const pieces = [];
    const segs = this._splitAddedTokens(text);
    const firstIsText = segs.length > 0 && segs[0].id === null;
    for (let si = 0; si < segs.length; si++) {
      const seg = segs[si];
      if (seg.id !== null) {
        ids.push(seg.id);
        pieces.push([seg.text]);
        continue;
      }
      for (const pt of this._pretokenize(seg.text, si === 0 && firstIsText)) {
        if (pt.length === 0) continue;
        const merged = bpeMerge(Array.from(pt), this.rank);
        for (const id of this._idsFromPieces(merged)) ids.push(id);
        pieces.push(merged);
      }
    }
    return { ids, pieces };
  }

  count(text) {
    return this.encode(text).ids.length;
  }

  /** Like encode(), but every token carries [start, end) char offsets into the
   *  (normalised) text. Powers the diff view. Not used by count/encode paths. */
  encodeWithOffsets(text) {
    if (!text) return { text: "", tokens: [] };
    const t = this._normalize(text);
    const segs = this._splitAddedTokens(t);
    const firstIsText = segs.length > 0 && segs[0].id === null;
    const tokens = [];
    for (let si = 0; si < segs.length; si++) {
      const seg = segs[si];
      if (seg.id !== null) {
        tokens.push({ id: seg.id, text: seg.text, start: seg.start, end: seg.end });
        continue;
      }
      const prepend = this.kind === "metaspace" && si === 0 && firstIsText;
      // orig: char pieces with offsets into seg.text; work: byte-mapped pieces
      let orig, work, offsets;
      if (this.kind === "tiktoken") {
        const r = matchAllWithOffsets(seg.text, this.patterns[0]);
        orig = r.parts; offsets = r.offsets;
        work = orig.map(bytesToByteChars);
      } else if (this.kind === "bytelevel") {
        orig = [seg.text]; offsets = [[0, seg.text.length]];
        for (const re of this.patterns) {
          const np = [], no = [];
          for (let k = 0; k < orig.length; k++) {
            const r = splitIsolatedWithOffsets(orig[k], re);
            for (let j = 0; j < r.parts.length; j++) {
              np.push(r.parts[j]);
              no.push([offsets[k][0] + r.offsets[j][0], offsets[k][0] + r.offsets[j][1]]);
            }
          }
          orig = np; offsets = no;
        }
        work = orig.map(bytesToByteChars);
      } else {
        let s2 = seg.text;
        if (this.id === "mistral") {
          s2 = s2.replace(/ /g, "\u2581");
          if (prepend && !s2.startsWith("\u2581")) s2 = "\u2581" + s2;
        }
        orig = [s2]; work = [s2]; offsets = [[0, seg.text.length]];
      }
      for (let k = 0; k < work.length; k++) {
        if (!work[k].length) continue;
        const merged = bpeMerge(Array.from(work[k]), this.rank);
        const ids = this._idsFromPieces(merged);
        let spans;
        if (this.kind === "metaspace") {
          spans = [];
          let c = 0;
          for (const piece of merged) { spans.push([c, c + piece.length]); c += piece.length; }
        } else {
          spans = byteCharSpans(orig[k], merged);
        }
        for (let i2 = 0; i2 < ids.length && i2 < spans.length; i2++) {
          tokens.push({
            id: ids[i2],
            text: this.pieceToString(merged[i2]),
            start: seg.start + offsets[k][0] + spans[i2][0],
            end: seg.start + offsets[k][0] + spans[i2][1],
          });
        }
      }
    }
    return { text: t, tokens };
  }


  /** Characters the pre-tokenizer would silently drop (should always be 0). */
  droppedChars(text) {
    if (!text) return 0;
    const t = this._normalize(text);
    if (this.kind === "tiktoken") return matchAllPieces(t, this.patterns[0]).dropped;
    if (this.kind === "bytelevel") {
      let parts = [t];
      for (const re of this.patterns) {
        const next = [];
        for (const p of parts) next.push(...splitIsolated(p, re));
        parts = next;
      }
      const kept = parts.reduce((a, p) => a + p.length, 0);
      return t.length - kept;
    }
    return 0;
  }

  /** Readable text of one encoded piece (used by the visualiser). */
  pieceToString(piece) {
    return this.kind === "bytelevel" || this.kind === "tiktoken"
      ? byteCharsToString(piece)
      : piece;
  }

  flatten(pieces) {
    const out = [];
    for (const p of pieces) {
      for (const piece of p) out.push(this.pieceToString(piece));
    }
    return out;
  }
}

export default Tokenizer;
