/** Beginner Guide tab — explains what mlbox is and how to use it. */
export async function initGuideTab(root) {
  root.innerHTML = `
    <div class="card">
      <h2>📖 What is mlbox?</h2>
      <p class="sub">Four ML tools in one page — no install, no API key, no GPU, no backend.</p>
      <div class="grid cols-2" style="margin-top:16px;">
        <div class="card">
          <h3>🧮 Tokenizer Lens</h3>
          <p>See how 7 real LLM tokenizers split <em>your</em> text. Compare token counts, chars/token, cost per million chars, and a language cost matrix. The <b>Boundary Diff</b> highlights exactly where two tokenizers disagree — the places your bill and context window diverge.</p>
        </div>
        <div class="card">
          <h3>🕹️ Micro Playground</h3>
          <p>A tiny neural net (MLP) with hand-written backprop training live on canvas. Watch gradient descent solve XOR, spiral, circles, and moons. Toggle hidden units, learning rate, activation — see convergence or failure in real time.</p>
        </div>
        <div class="card">
          <h3>🐢 No-GPU Recipes</h3>
          <p>12 curated ML projects that genuinely finish on a laptop CPU or free Colab/Kaggle. Each has its one gotcha spelled out: grokking, nanoGPT, tokenizer training, LoRA on 0.5B, distillation, tiny diffusion, NumPy backprop, tabular boosting, DQN, sentence embeddings, Colab discipline, and eval-first design.</p>
        </div>
        <div class="card">
          <h3>💸 LLM Price Bench</h3>
          <p>13 current models from 5 providers, transcribed from official pricing pages with per-row source links and check dates. A workload calculator and a <b>real-prompt estimator</b> that tokenizes your actual system prompt with each model's tokenizer (where available) — rows without a tokenizer are marked <code class="pill est">(est.)</code>.</p>
        </div>
      </div>
    </div>

    <div class="card" style="margin-top:18px;">
      <h2>🚀 Quick Start (pick one)</h2>
      <div class="grid cols-2" style="margin-top:12px;">
        <div class="card">
          <h3>🌐 Web (easiest)</h3>
          <p>Open <a href="https://mohittt-vermaa.github.io/mlbox/" target="_blank" rel="noopener">mohittt-vermaa.github.io/mlbox/</a> — works on any device with a browser.</p>
        </div>
        <div class="card">
          <h3>📱 Android</h3>
          <p>Download <code>mlbox-v0.2.0-lite-universal.apk</code> from <a href="https://github.com/mohittt-vermaa/mlbox/releases" target="_blank" rel="noopener">Releases</a>. Install (allow that source). 9.7 MB, offline, Android 8.0+.</p>
        </div>
        <div class="card">
          <h3>🖥️ Desktop (Windows)</h3>
          <p>Download <code>mlbox-v0.2.0-win32-x64.zip</code> from <a href="https://github.com/mohittt-vermaa/mlbox/releases" target="_blank" rel="noopener">Releases</a>. Unzip, run <code>mlbox.exe</code>. No installer, no admin.</p>
        </div>
        <div class="card">
          <h3>🐧 Linux / macOS (terminal)</h3>
          <pre><code>git clone https://github.com/mohittt-vermaa/mlbox
cd mlbox
python3 -m http.server 8000    # or: npx serve .
open http://localhost:8000     # Linux: xdg-open http://localhost:8000</code></pre>
        </div>
      </div>
    </div>

    <div class="card" style="margin-top:18px;">
      <h2>🎯 How to use each tool</h2>

      <details open><summary><b>🧮 Tokenizer Lens — step by step</b></summary>
      <div style="margin-top:12px; line-height:1.8;">
        <ol>
          <li>Paste or type text in the input box (try Hindi: <code>नमस्ते दुनिया</code>).</li>
          <li>Select tokenizers via the chips (click to toggle).</li>
          <li>Read the stats row: tokens, chars/token, cost/M chars.</li>
          <li>Click <b>Boundary Diff</b> → pick two models → see exactly where they split differently.</li>
          <li>Click <b>Share</b> → copy the link → send it; the recipient sees your exact comparison.</li>
        </ol>
        <p class="notice"><b>Pro tip:</b> The language cost matrix shows chars/token for 20+ scripts. Lower = more expensive for that language.</p>
      </div>
      </details>

      <details><summary><b>🕹️ Playground — step by step</b></summary>
      <div style="margin-top:12px; line-height:1.8;">
        <ol>
          <li>Pick a dataset: XOR, Spiral, Circles, Moons.</li>
          <li>Adjust sliders: hidden units, learning rate, activation (ReLU/Tanh).</li>
          <li>Click <b>Train</b> — watch the decision boundary and loss curve evolve.</li>
          <li>Notice: 1 hidden unit <em>cannot</em> solve Spiral (under-parameterized). 8+ units solve it.</li>
        </ol>
        <p class="notice"><b>What to learn:</b> Why depth/width matters, how learning rate affects convergence, why ReLU vs Tanh changes the boundary shape.</p>
      </div>
      </details>

      <details><summary><b>🐢 No-GPU Recipes — how to read them</b></summary>
      <div style="margin-top:12px; line-height:1.8;">
        <ul>
          <li><b>Tier badge</b> (Laptop / Colab / Kaggle / Local GPU) tells you the minimum hardware.</li>
          <li><b>Time</b> is order-of-magnitude on a modern 4–8 core CPU.</li>
          <li><b>Why it fits</b> explains the compute profile.</li>
          <li><b>Code block</b> is copy-paste runnable.</li>
          <li><b>Gotcha</b> is the one thing that wastes hours if you miss it.</li>
        </ul>
      </div>
      </details>

      <details><summary><b>💸 Prices — step by step</b></summary>
      <div style="margin-top:12px; line-height:1.8;">
        <ol>
          <li>Table shows 13 models with input / cached-input / output $/1M tokens.</li>
          <li><b>Workload calculator:</b> set requests/month, avg input/output tokens → see monthly cost per model.</li>
          <li><b>Real-prompt estimator:</b> paste your actual system prompt, set requests/month & avg output tokens. Each model prices using its own tokenizer where we ship one; others show <code class="pill est">(est.)</code>.</li>
          <li>Toggle <b>Cache hit %</b> to see cached-input pricing applied per provider.</li>
        </ol>
        <p class="notice"><b>Always verify:</b> Click the source link (🔗) — prices move, this is reference only.</p>
      </div>
      </details>
    </div>

    <div class="card" style="margin-top:18px;">
      <h2>💡 Key concepts in 30 seconds</h2>
      <div class="grid cols-2" style="margin-top:12px;">
        <div class="card"><b>Token</b> — the atomic unit an LLM reads/writes. Not a word. <code>नमस्ते</code> = 5 tokens (o200k) or 13 tokens (cl100k).</div>
        <div class="card"><b>Chars/token</b> — higher = cheaper. English ~3.5–4. Hindi ~1.4–2.6. This ratio <em>is</em> your cost multiplier.</div>
        <div class="card"><b>Context window</b> — max tokens per request. Fewer tokens = more room for your actual prompt + completion.</div>
        <div class="card"><b>Cached input</b> — repeated prefix (system prompt, few-shot) priced at 1–10% of base. mlbox calculator models this per provider.</div>
        <div class="card"><b>Boundary diff</b> — positions where tokenizer A splits but B doesn't. Every diff = potential cost/context divergence.</div>
        <div class="card"><b>Share link</b> — encodes text, model selection, view in URL hash. Zero server, fully client-side.</div>
      </div>
    </div>

    <div class="card" style="margin-top:18px;">
      <h2>⌨️ Keyboard shortcuts</h2>
      <table>
        <thead><tr><th>Key</th><th>Action</th></tr></thead>
        <tbody>
          <tr><td><kbd>1</kbd>–<kbd>4</kbd></td><td>Switch tabs (Tokenizer / Playground / Recipes / Prices)</td></tr>
          <tr><td><kbd>G</kbd></td><td>Open Guide</td></tr>
          <tr><td><kbd>Ctrl/Cmd + Enter</kbd></td><td>Train (Playground) / Tokenize (Tokenizer)</td></tr>
          <tr><td><kbd>Escape</kbd></td><td>Close modals / stop training</td></tr>
        </tbody>
      </table>
    </div>

    <div class="card" style="margin-top:18px;">
      <h2>🔗 Useful links</h2>
      <div class="chips" style="gap:10px;">
        <a class="chip" href="https://github.com/mohittt-vermaa/mlbox" target="_blank" rel="noopener">Source on GitHub</a>
        <a class="chip" href="https://github.com/mohittt-vermaa/mlbox/releases" target="_blank" rel="noopener">Releases (APK, EXE)</a>
        <a class="chip" href="https://github.com/mohittt-vermaa/mlbox/issues" target="_blank" rel="noopener">Report a bug</a>
        <a class="chip" href="https://github.com/mohittt-vermaa/mlbox/blob/main/NOTICE.md" target="_blank" rel="noopener">Licenses / NOTICE</a>
      </div>
    </div>
  `;

  // Keyboard shortcuts
  const handler = (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'g' || e.key === 'G') {
      const btn = document.getElementById('tab-guide');
      if (btn) btn.click();
    }
  };
  document.addEventListener('keydown', handler);
  root._guideCleanup = () => document.removeEventListener('keydown', handler);
}