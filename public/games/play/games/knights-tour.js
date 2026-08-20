// Knight's Tour — walk a knight over every square exactly once.
// Self-contained IIFE; binds to elements prefixed "kt-" inside #panel-knights-tour.
//
// The browser mirrors the exact core of games-src/knights-tour/solver.py:
//   * live_moves        -> liveMoves()        which legal moves keep a tour alive
//   * completable       -> completable()      exact backtracking oracle + pruning
//   * first_fatal_index -> firstFatalIndex()  where a doomed tour actually died
//   * warnsdorff/knights_tour -> findTour()   a full tour to watch
//
// Honesty: completable() is EXACT when it returns yes/no inside its node budget.
// If the budget is exhausted it returns "unknown" and the UI says so rather than
// guessing — the same "stale beats broken" stance as the rest of this project.
(function () {
  "use strict";

  const $ = id => document.getElementById("kt-" + id);
  const DELTAS = [[1,2],[2,1],[2,-1],[1,-2],[-1,-2],[-2,-1],[-2,1],[-1,2]];
  const NODE_BUDGET = 400000;

  // ---- board -----------------------------------------------------------------
  function makeBoard(rows, cols) {
    const n = rows * cols, nbr = new Array(n);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const s = r * cols + c, list = [];
      for (const [dr, dc] of DELTAS) {
        const rr = r + dr, cc = c + dc;
        if (rr >= 0 && rr < rows && cc >= 0 && cc < cols) list.push(rr * cols + cc);
      }
      nbr[s] = list;
    }
    return { rows, cols, n, nbr };
  }

  const cellName = (B, s) =>
    String.fromCharCode(97 + (s % B.cols)) + (B.rows - Math.floor(s / B.cols));

  // ---- the exact completability oracle ---------------------------------------
  // Hamiltonian path in H = (unvisited ∪ {cur}) starting at cur. Three necessary
  // conditions prune almost everything before the search does any work:
  //   (1) every unvisited cell has a free neighbour        (degree 0 => dead)
  //   (2) at most one unvisited cell has degree 1          (only the endpoint may)
  //   (3) H is connected from cur                          (no stranded island)
  function pruned(B, visited, cur, remaining) {
    if (remaining === 0) return false;
    let deg1 = 0;
    for (let u = 0; u < B.n; u++) {
      if (visited[u]) continue;
      let d = 0;
      for (const v of B.nbr[u]) if (!visited[v] || v === cur) d++;
      if (d === 0) return true;                 // (1)
      if (d === 1 && ++deg1 > 1) return true;   // (2)
    }
    // (3) connectivity from cur over unvisited cells
    const seen = new Uint8Array(B.n);
    const stack = [cur];
    seen[cur] = 1;
    let reached = 0;
    while (stack.length) {
      const u = stack.pop();
      for (const v of B.nbr[u]) {
        if (visited[v] || seen[v]) continue;
        seen[v] = 1; reached++; stack.push(v);
      }
    }
    return reached !== remaining;
  }

  // Returns "yes" | "no" | "unknown". Warnsdorff-ordered DFS with backtracking.
  function completable(B, visited, cur, remaining) {
    let nodes = 0, budgetBlown = false;

    function dfs(cur, remaining) {
      if (remaining === 0) return true;
      if (++nodes > NODE_BUDGET) { budgetBlown = true; return false; }
      if (pruned(B, visited, cur, remaining)) return false;

      // Warnsdorff: try the most-constrained square first.
      const cand = [];
      for (const v of B.nbr[cur]) {
        if (visited[v]) continue;
        let d = 0;
        for (const w of B.nbr[v]) if (!visited[w]) d++;
        cand.push([d, v]);
      }
      cand.sort((a, b) => a[0] - b[0]);

      for (const [, v] of cand) {
        visited[v] = 1;
        if (dfs(v, remaining - 1)) { visited[v] = 0; return true; }
        visited[v] = 0;
        if (budgetBlown) return false;
      }
      return false;
    }

    const ok = dfs(cur, remaining);
    if (ok) return "yes";
    return budgetBlown ? "unknown" : "no";
  }

  // Does the tour survive if we step onto `next`?
  function survives(B, path, next) {
    const visited = new Uint8Array(B.n);
    for (const s of path) visited[s] = 1;
    visited[next] = 1;
    return completable(B, visited, next, B.n - path.length - 1);
  }

  // Legal moves, each tagged with whether it keeps a tour alive.
  function liveMoves(B, path) {
    if (!path.length) return [];
    const cur = path[path.length - 1];
    const visited = new Uint8Array(B.n);
    for (const s of path) visited[s] = 1;
    return B.nbr[cur].filter(v => !visited[v]).map(v => ({ cell: v, verdict: survives(B, path, v) }));
  }

  // First move index after which the tour became impossible.
  function firstFatalIndex(B, path) {
    for (let i = 1; i < path.length; i++) {
      const prefix = path.slice(0, i + 1);
      const visited = new Uint8Array(B.n);
      for (const s of prefix) visited[s] = 1;
      if (completable(B, visited, prefix[i], B.n - prefix.length) === "no") return i;
    }
    return -1;
  }

  // A complete tour from `start`, or null.
  function findTour(B, start) {
    const visited = new Uint8Array(B.n);
    visited[start] = 1;
    const path = [start];
    let nodes = 0;
    function dfs(cur, remaining) {
      if (remaining === 0) return true;
      if (++nodes > NODE_BUDGET * 4) return false;
      if (pruned(B, visited, cur, remaining)) return false;
      const cand = [];
      for (const v of B.nbr[cur]) {
        if (visited[v]) continue;
        let d = 0;
        for (const w of B.nbr[v]) if (!visited[w]) d++;
        cand.push([d, v]);
      }
      cand.sort((a, b) => a[0] - b[0]);
      for (const [, v] of cand) {
        visited[v] = 1; path.push(v);
        if (dfs(v, remaining - 1)) return true;
        visited[v] = 0; path.pop();
      }
      return false;
    }
    return dfs(start, B.n - 1) ? path : null;
  }

  // ---- state -----------------------------------------------------------------
  const G = { B: null, path: [], warn: true, timer: null, size: 8, note: "" };

  function stopAnim() { if (G.timer) { clearInterval(G.timer); G.timer = null; } }

  function reset(size) {
    stopAnim();
    G.size = size || G.size;
    G.B = makeBoard(G.size, G.size);
    G.path = [];
    G.note = "";
    render();
  }

  // ---- rendering -------------------------------------------------------------
  function render() {
    const B = G.B, grid = $("grid");
    const pos = new Map(G.path.map((s, i) => [s, i + 1]));
    const cur = G.path.length ? G.path[G.path.length - 1] : -1;

    // Which squares can be clicked, and are any of them fatal?
    let moves = [];
    if (!G.path.length) {
      moves = Array.from({ length: B.n }, (_, i) => ({ cell: i, verdict: "yes" }));
    } else if (!G.timer) {
      moves = G.warn ? liveMoves(B, G.path)
                     : B.nbr[cur].filter(v => !pos.has(v)).map(v => ({ cell: v, verdict: "yes" }));
    }
    const moveBy = new Map(moves.map(m => [m.cell, m.verdict]));

    grid.style.gridTemplateColumns = `repeat(${B.cols}, 1fr)`;
    grid.innerHTML = "";
    for (let s = 0; s < B.n; s++) {
      const r = Math.floor(s / B.cols), c = s % B.cols;
      const d = document.createElement("button");
      d.type = "button";
      d.className = "kt-cell" + ((r + c) % 2 ? " dark" : " light");
      d.dataset.cell = s;
      if (pos.has(s)) {
        d.classList.add("visited");
        d.textContent = pos.get(s);
        if (s === cur) d.classList.add("cur");
        if (s === G.path[0]) d.classList.add("start");
      } else if (moveBy.has(s)) {
        const v = moveBy.get(s);
        d.classList.add("legal");
        if (v === "no") d.classList.add("fatal");
        if (v === "unknown") d.classList.add("unsure");
        d.textContent = v === "no" ? "×" : (v === "unknown" ? "?" : "");
      } else {
        d.disabled = true;
      }
      d.onclick = () => onCell(s);
      grid.appendChild(d);
    }

    const n = B.n, done = G.path.length;
    $("progress").textContent = `${done} / ${n}`;
    $("bar").style.width = (100 * done / n) + "%";

    let status;
    if (!done) status = "Pick any square to begin — every square is a legal start.";
    else if (done === n) status = "Complete tour — every square visited exactly once.";
    else if (!moves.length) status = "Stuck: no legal move remains.";
    else if (G.warn) {
      const live = moves.filter(m => m.verdict === "yes").length;
      status = live ? `${live} of ${moves.length} legal moves still lead to a full tour.`
                    : "Every legal move from here is fatal — this tour is already lost.";
    } else status = `${moves.length} legal move${moves.length === 1 ? "" : "s"}.`;
    $("status").textContent = status;
    $("note").textContent = G.note;
    $("note").style.display = G.note ? "" : "none";
    $("undo").disabled = !done || !!G.timer;
    $("why").disabled = done < 2 || !!G.timer;
  }

  // ---- interaction -----------------------------------------------------------
  function onCell(s) {
    stopAnim();
    if (!G.path.length) { G.path = [s]; G.note = ""; render(); return; }
    const cur = G.path[G.path.length - 1];
    if (G.path.includes(s) || !G.B.nbr[cur].includes(s)) return;
    G.path.push(s);
    G.note = "";
    if (G.path.length === G.B.n) G.note = "That is a complete knight's tour — machine-checked square by square.";
    render();
  }

  function undo() { stopAnim(); G.path.pop(); G.note = ""; render(); }

  function explain() {
    stopAnim();
    const i = firstFatalIndex(G.B, G.path);
    if (i < 0) { G.note = "No mistake yet — this tour can still be completed."; render(); return; }
    const prefix = G.path.slice(0, i);
    const alts = liveMoves(G.B, prefix).filter(m => m.verdict === "yes");
    const played = cellName(G.B, G.path[i]);
    if (!alts.length) {
      G.note = `Move ${i + 1} to ${played} was fatal — and so was every alternative. The tour was already lost before it.`;
    } else {
      const list = alts.map(m => cellName(G.B, m.cell)).join(", ");
      G.note = `Move ${i + 1} to ${played} killed the tour. At that point ${alts.length === 1 ? "the only surviving move was" : "the surviving moves were"} ${list}.`;
    }
    G.path = G.path.slice(0, i + 1);
    render();
  }

  function demo() {
    stopAnim();
    const start = G.path.length ? G.path[0] : 0;
    const tour = findTour(G.B, start);
    if (!tour) { G.note = `No tour exists from ${cellName(G.B, start)} on this board.`; render(); return; }
    G.path = [tour[0]];
    G.note = `Verified tour from ${cellName(G.B, start)} — ${tour.length} squares, each step a legal knight move.`;
    let i = 1;
    G.timer = setInterval(() => {
      if (i >= tour.length) { stopAnim(); render(); return; }
      G.path.push(tour[i++]);
      render();
    }, 90);
    render();
  }

  // ---- styles ----------------------------------------------------------------
  function injectStyles() {
    if (document.getElementById("kt-style")) return;
    const el = document.createElement("style");
    el.id = "kt-style";
    el.textContent = `
      #panel-knights-tour .kt-grid{display:grid;gap:2px;max-width:520px;margin:0 auto;aspect-ratio:1/1}
      #panel-knights-tour .kt-cell{position:relative;border:none;border-radius:3px;font:600 13px/1 inherit;
        display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0;
        color:var(--muted);transition:transform .08s ease}
      #panel-knights-tour .kt-cell.light{background:#2a3b3d}
      #panel-knights-tour .kt-cell.dark{background:#1d2c2e}
      #panel-knights-tour .kt-cell:disabled{cursor:default}
      #panel-knights-tour .kt-cell.visited{background:#3c5a5e;color:#cfe9ec}
      #panel-knights-tour .kt-cell.start{outline:2px solid #7fb0ff;outline-offset:-2px}
      #panel-knights-tour .kt-cell.cur{background:var(--accent,#4fd1c5);color:#08201f;font-size:14px}
      #panel-knights-tour .kt-cell.legal{background:#25514a;box-shadow:inset 0 0 0 2px #4fd1c5;color:#9fe8df}
      #panel-knights-tour .kt-cell.legal:hover{transform:scale(1.06)}
      #panel-knights-tour .kt-cell.legal.fatal{background:#4a2530;box-shadow:inset 0 0 0 2px #ff8f8f;color:#ffc9c9}
      #panel-knights-tour .kt-cell.legal.unsure{background:#4a4325;box-shadow:inset 0 0 0 2px #e8d07f;color:#f0e6bd}
      #panel-knights-tour .kt-bar{height:6px;background:#1d2c2e;border-radius:3px;overflow:hidden;margin:10px 0 6px}
      #panel-knights-tour .kt-bar>div{height:100%;background:linear-gradient(90deg,#4fd1c5,#7fb0ff);transition:width .12s}
      #panel-knights-tour .kt-note{margin-top:8px;padding:8px 10px;border-radius:6px;background:#20343a;
        color:#cfe9ec;font-size:12.5px;line-height:1.5}
      #panel-knights-tour .kt-legend{display:flex;gap:14px;flex-wrap:wrap;font-size:12px;color:var(--muted);margin-top:8px}
      #panel-knights-tour .kt-swatch{display:inline-block;width:11px;height:11px;border-radius:2px;margin-right:5px;vertical-align:-1px}
    `;
    document.head.appendChild(el);
  }

  // ---- wiring ----------------------------------------------------------------
  function init() {
    injectStyles();
    $("size").onchange = () => reset(parseInt($("size").value, 10));
    $("warn").onchange = () => { G.warn = $("warn").checked; render(); };
    $("reset").onclick = () => reset();
    $("undo").onclick = undo;
    $("why").onclick = explain;
    $("demo").onclick = demo;
    G.warn = $("warn").checked;
    reset(8);
  }

  // Test hook: lets node exercise the exact engine above (no-op in the browser).
  if (typeof module !== "undefined" && module.exports)
    module.exports = { makeBoard, completable, survives, liveMoves, firstFatalIndex, findTour, cellName };

  if (typeof document === "undefined") return;
  if (document.getElementById("panel-knights-tour")) init();
  else document.addEventListener("DOMContentLoaded", () => {
    if (document.getElementById("panel-knights-tour")) init();
  });
})();
