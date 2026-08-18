// Tic-Tac-Toe — play the PERFECT solver that never loses (the certified forced draw).
// Self-contained IIFE; binds to elements prefixed "ttt-" inside #panel-tic-tac-toe.
// Mirrors the Python perfect-information solve (fully_observable.py) in the browser:
// an exact minimax that plays optimally, demonstrating that with perfect play
// tic-tac-toe is a forced DRAW — you can draw the solver, but you can NEVER beat it.
(function () {
  "use strict";

  const X = "X", O = "O", E = "";
  const $ = id => document.getElementById("ttt-" + id);

  // memo key: empty cells become "." so position is never lost in the string
  // (b.join("") would collapse empty "" cells and collide distinct boards).
  const key = b => b.map(v => v || ".").join("");

  // 8 winning lines (rows, cols, diagonals) — matches rules.py WIN_LINES.
  const LINES = [
    [0,1,2],[3,4,5],[6,7,8],
    [0,3,6],[1,4,7],[2,5,8],
    [0,4,8],[2,4,6],
  ];

  function winner(b) {
    for (const [a,c,d] of LINES) if (b[a] && b[a] === b[c] && b[a] === b[d]) return b[a];
    return null;
  }
  function full(b) { return b.every(v => v !== E); }
  function moves(b) { const m = []; for (let i=0;i<9;i++) if (b[i]===E) m.push(i); return m; }
  function toMove(b) {
    const nx = b.filter(v=>v===X).length, no = b.filter(v=>v===O).length;
    return nx === no ? X : O;
  }

  // --- exact minimax, X-perspective payoff (+1 X / 0 draw / -1 O), memoised ----
  // The same backward induction fully_observable.py runs; depth tie-break makes
  // the solver pick the FASTEST win / SLOWEST loss, the standard "play to punish".
  const memo = new Map();
  function solve(b) {
    const k = key(b);
    if (memo.has(k)) return memo.get(k);
    const w = winner(b);
    let res;
    if (w === X) res = { v: 1, d: 0 };
    else if (w === O) res = { v: -1, d: 0 };
    else if (full(b)) res = { v: 0, d: 0 };
    else {
      const mover = toMove(b);
      let best = null;
      for (const i of moves(b)) {
        const nb = b.slice(); nb[i] = mover;
        const r = solve(nb);
        // maximise v for X, minimise for O; tie-break: win fast, lose slow.
        if (best === null) best = { v: r.v, d: r.d + 1 };
        else {
          const cand = { v: r.v, d: r.d + 1 };
          const better = mover === X
            ? (cand.v > best.v || (cand.v === best.v && shorterPreferred(cand, best, mover)))
            : (cand.v < best.v || (cand.v === best.v && shorterPreferred(cand, best, mover)));
          if (better) best = cand;
        }
      }
      res = best;
    }
    memo.set(k, res);
    return res;
  }
  // when the value is decided, prefer to reach a WIN sooner and a LOSS later.
  function shorterPreferred(cand, best, mover) {
    const good = mover === X ? cand.v > 0 : cand.v < 0;     // a win for the mover
    const bad  = mover === X ? cand.v < 0 : cand.v > 0;     // a loss for the mover
    if (good) return cand.d < best.d;                        // win faster
    if (bad)  return cand.d > best.d;                        // lose slower
    return false;                                            // draw: indifferent
  }

  // Best move for the side to move, with the same fast-win/slow-loss tie-break.
  function bestMove(b) {
    const mover = toMove(b);
    let pick = null, pickScore = null;
    for (const i of moves(b)) {
      const nb = b.slice(); nb[i] = mover;
      const r = solve(nb);
      const score = { v: r.v, d: r.d + 1 };
      if (pick === null) { pick = i; pickScore = score; continue; }
      const better = mover === X
        ? (score.v > pickScore.v || (score.v === pickScore.v && shorterPreferred(score, pickScore, mover)))
        : (score.v < pickScore.v || (score.v === pickScore.v && shorterPreferred(score, pickScore, mover)));
      if (better) { pick = i; pickScore = score; }
    }
    return pick;
  }

  // ---- certified headline numbers (from fully_observable.py, exact) ----------
  const CERT = {
    value: "DRAW",
    optXvsRandO: { win: "191/192", winPct: 99.48, draw: "1/192", loss: "0" },
    optOvsRandX: { win: "887/945", winPct: 93.86, draw: "43/945", loss: "1/63" },
    reachable: 5478, canonical: 765,
  };

  // ---- game state ------------------------------------------------------------
  let G = null;
  // human plays one mark, solver plays the other (perfectly). Default: human = X.
  function newGame(humanMark) {
    G = {
      board: Array(9).fill(E),
      human: humanMark || (G ? G.human : X),
      solver: (humanMark || (G ? G.human : X)) === X ? O : X,
      over: false, result: null, winLine: null, lastSolver: null,
      result_human: null,   // "lose" never happens; "draw" or (impossible) "win"
    };
    // if the solver moves first (human is O), let it open.
    if (toMove(G.board) === G.solver) solverMove();
    render();
  }

  function status(b) {
    const w = winner(b);
    if (w) return { over: true, win: w, line: LINES.find(([a,c,d]) => b[a]===w && b[c]===w && b[d]===w) };
    if (full(b)) return { over: true, win: null, line: null };
    return { over: false };
  }

  function solverMove() {
    if (G.over) return;
    const i = bestMove(G.board);
    if (i == null) return;
    G.board[i] = G.solver;
    G.lastSolver = i;
    finishIfOver();
  }

  function humanPlay(i) {
    if (G.over || G.board[i] !== E || toMove(G.board) !== G.human) return;
    G.board[i] = G.human;
    G.lastSolver = null;
    finishIfOver();
    if (!G.over) { solverMove(); }
    render();
  }

  function finishIfOver() {
    const s = status(G.board);
    if (s.over) {
      G.over = true; G.winLine = s.line;
      if (s.win === null) { G.result = "draw"; G.result_human = "draw"; }
      else if (s.win === G.human) { G.result = "human"; G.result_human = "win"; }   // provably impossible
      else { G.result = "solver"; G.result_human = "lose"; }
    }
  }

  // ---- rendering -------------------------------------------------------------
  function render() {
    const grid = $("grid");
    grid.innerHTML = "";
    const yourTurn = !G.over && toMove(G.board) === G.human;
    for (let i = 0; i < 9; i++) {
      const c = document.createElement("button");
      const mk = G.board[i];
      c.className = "ttt-cell" + (mk ? " filled mk-" + mk.toLowerCase() : "")
        + (G.winLine && G.winLine.includes(i) ? " win" : "")
        + (i === G.lastSolver ? " last" : "");
      c.textContent = mk;
      c.disabled = !!mk || G.over || !yourTurn;
      c.onclick = () => humanPlay(i);
      grid.appendChild(c);
    }

    // headline phase / banner
    let phase, banner = "";
    if (!G.over) {
      phase = yourTurn ? `Your move (you are ${G.human})` : "Solver thinking…";
    } else if (G.result === "draw") {
      phase = "DRAW";
      banner = `<div class="ttt-banner draw">Draw — exactly as the proof predicts. The solver played perfectly; the best you can do is hold it to a draw.</div>`;
    } else if (G.result === "solver") {
      phase = "Solver wins";
      banner = `<div class="ttt-banner lose">The solver won. It never loses — and it punishes any slip. Try again and aim for the draw.</div>`;
    } else {
      phase = "You win (!?)";
      banner = `<div class="ttt-banner win">If you are reading this, the perfect solver was beaten — that would contradict the proof. Please report it!</div>`;
    }
    $("phaselbl").textContent = phase;
    $("hubphase").textContent = G.over
      ? (G.result === "draw" ? "▲ FORCED DRAW" : G.result === "solver" ? "☠ SOLVER WINS" : "★ YOU WIN?")
      : "PERFECT SOLVER · NEVER LOSES";
    $("banner").innerHTML = banner;

    // Headline = the OUTCOME OF THE GAME YOU ARE PLAYING. Tic-tac-toe is a forced draw,
    // so against this perfect solver you can never win but can ALWAYS force a draw — the
    // bar therefore reads DRAW. (The "optimal vs a RANDOM mover wins 99.48%" figure is a
    // different scenario; it lives, clearly labelled, in the analysis card and explainer
    // below. Showing it here as "Solver 99%" wrongly reads as the solver beating you.)
    $("oddsSolver").style.width = "0%";
    $("oddsSolver").textContent = "";
    $("oddsDraw").style.width = "100%";
    $("oddsDraw").textContent = "Perfect play → DRAW · the solver never loses; you can always force the draw";

    explain();
  }

  function explain() {
    const opt = G.solver === X ? CERT.optXvsRandO : CERT.optOvsRandX;
    $("explain").innerHTML =
      `<b>You cannot win.</b> Tic-tac-toe is a certified <b>forced draw</b>: backward-induction `+
      `minimax over all ${CERT.reachable.toLocaleString()} reachable positions proves `+
      `<code>&lt;&lt;X&gt;&gt; F x_win</code> and <code>&lt;&lt;O&gt;&gt; F o_win</code> are both <b>FALSE</b>. `+
      `The solver here runs that exact optimal strategy, so it <b>never loses</b> — the best outcome `+
      `available to you is a draw. Against a <i>random</i> player the same optimal side wins `+
      `<b>${opt.winPct}%</b> of the time (${opt.win}) and never loses; only perfect defence forces the draw.`;
  }

  // ---- one-time scoped styles (so we don't edit style.css) -------------------
  function injectStyles() {
    if (document.getElementById("ttt-style")) return;
    const css = `
      #panel-tic-tac-toe .ttt-board{display:flex;flex-direction:column;align-items:center;gap:14px;padding:6px 0 2px}
      #panel-tic-tac-toe .ttt-grid{display:grid;grid-template-columns:repeat(3,96px);grid-template-rows:repeat(3,96px);
        gap:10px;background:var(--panel2);border:1px solid var(--line);border-radius:16px;padding:14px;box-shadow:var(--shadow)}
      #panel-tic-tac-toe .ttt-cell{width:96px;height:96px;border-radius:14px;font-size:46px;font-weight:800;
        display:grid;place-items:center;background:var(--panel);border:1px solid var(--line);color:var(--ink);
        cursor:pointer;transition:.15s;line-height:1}
      #panel-tic-tac-toe .ttt-cell:hover:not(:disabled){border-color:var(--accent);transform:translateY(-2px)}
      #panel-tic-tac-toe .ttt-cell:disabled{cursor:default}
      #panel-tic-tac-toe .ttt-cell.mk-x{color:var(--res)}
      #panel-tic-tac-toe .ttt-cell.mk-o{color:var(--spy)}
      #panel-tic-tac-toe .ttt-cell.last{box-shadow:0 0 0 3px rgba(167,139,250,.28)}
      #panel-tic-tac-toe .ttt-cell.win{background:rgba(34,197,94,.18);border-color:var(--good)}
      #panel-tic-tac-toe .ttt-hub{text-align:center;margin-top:2px}
      #panel-tic-tac-toe .ttt-banner{margin:12px auto 0;max-width:420px;border-radius:12px;padding:11px 14px;font-size:13px;border:1px solid var(--line)}
      #panel-tic-tac-toe .ttt-banner.draw{background:rgba(167,139,250,.10);border-color:rgba(167,139,250,.4);color:#d8d2f5}
      #panel-tic-tac-toe .ttt-banner.lose{background:rgba(239,68,68,.10);border-color:rgba(239,68,68,.4);color:#ffc7c7}
      #panel-tic-tac-toe .ttt-banner.win{background:rgba(34,197,94,.10);border-color:rgba(34,197,94,.4);color:#bdf3cf}
      #panel-tic-tac-toe .ttt-statline{display:flex;gap:12px;flex-wrap:wrap;font-size:12.5px;color:var(--muted);margin-top:8px}
      #panel-tic-tac-toe .ttt-statline b{color:var(--ink)}
    `;
    const el = document.createElement("style");
    el.id = "ttt-style"; el.textContent = css;
    document.head.appendChild(el);
  }

  // ---- wiring ----------------------------------------------------------------
  function init() {
    injectStyles();
    $("new").onclick = () => newGame(G.human);
    $("side").onchange = () => newGame($("side").value === "O" ? O : X);
    newGame(X);
  }

  // self-init when the panel exists
  if (document.getElementById("panel-tic-tac-toe")) init();
  else document.addEventListener("DOMContentLoaded", () => { if (document.getElementById("panel-tic-tac-toe")) init(); });
})();
