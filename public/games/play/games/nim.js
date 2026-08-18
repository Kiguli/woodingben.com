// Nim — play the PERFECT bot that never loses from a winning position.
// Self-contained IIFE; binds to elements prefixed "nim-" inside #panel-nim.
// Mirrors the Python solve (grundy.py / smt_proof.py) in the browser: the bot
// plays Bouton's nim-sum-0 move, so it is unbeatable whenever the nim-sum is
// non-zero on ITS turn. The certified headline: with perfect play the player to
// move wins iff the nim-sum (XOR of the heap sizes) is non-zero.
(function () {
  "use strict";

  const $ = id => document.getElementById("nim-" + id);

  // The classic Bouton board. Heaps are independent rows of objects.
  const START = [3, 4, 5];

  // ---- pure game logic (mirrors rules.py / grundy.py) ------------------------
  const nimSum = heaps => heaps.reduce((a, h) => a ^ h, 0);
  const isOver = heaps => heaps.every(h => h === 0);

  // Bouton's winning move from a position with nim-sum S != 0: find a heap h with
  // (h ^ S) < h and reduce it to (h ^ S). The new nim-sum is 0. Returns
  // {row, take, leave} or null if the position is already lost (S == 0).
  function winningMove(heaps) {
    const S = nimSum(heaps);
    if (S === 0) return null;
    for (let i = 0; i < heaps.length; i++) {
      const target = heaps[i] ^ S;
      if (target < heaps[i]) return { row: i, take: heaps[i] - target, leave: target };
    }
    return null; // unreachable when S != 0
  }

  // From a LOSING position (nim-sum 0) the bot is theoretically beaten; it plays
  // a "best try" — take the whole largest heap, hoping for a human slip.
  function fallbackMove(heaps) {
    let best = -1, bestVal = -1;
    heaps.forEach((h, i) => { if (h > bestVal) { bestVal = h; best = i; } });
    return best < 0 || bestVal === 0 ? null : { row: best, take: heaps[best], leave: 0 };
  }

  // ---- state -----------------------------------------------------------------
  let G = null;
  function newGame() {
    G = {
      heaps: START.slice(),
      turn: "you",            // "you" | "bot"
      over: false, winner: null,
      sel: null,              // {row, take} a hovered/selected removal preview
      lastBot: null,          // {row, before, leave} for highlighting
      log: [],
    };
    log(`New game. Heaps ${fmt(G.heaps)} — nim-sum ${nimSum(G.heaps)} ` +
        `(${nimSum(G.heaps) ? "you can win: take to make XOR 0" : "you are theoretically lost"}).`);
    render();
  }

  const fmt = h => "{" + h.join(", ") + "}";
  function log(s) { G.log.unshift(s); if (G.log.length > 30) G.log.pop(); }

  function finishIfOver() {
    if (isOver(G.heaps)) {
      G.over = true;
      // whoever just moved took the last object and WON (normal play).
      G.winner = (G.turn === "you") ? "you" : "bot";
      return true;
    }
    return false;
  }

  // human removes `take` objects from row `row`
  function humanTake(row, take) {
    if (G.over || G.turn !== "you") return;
    if (take < 1 || take > G.heaps[row]) return;
    G.heaps[row] -= take;
    G.sel = null; G.lastBot = null;
    log(`You take ${take} from row ${row + 1} → ${fmt(G.heaps)} (nim-sum ${nimSum(G.heaps)}).`);
    if (finishIfOver()) { render(); return; }
    G.turn = "bot"; render();
    setTimeout(botMove, 650);
  }

  function botMove() {
    if (G.over || G.turn !== "bot") return;
    const mv = winningMove(G.heaps) || fallbackMove(G.heaps);
    const before = G.heaps[mv.row];
    G.heaps[mv.row] = mv.leave;
    G.lastBot = { row: mv.row, before, leave: mv.leave };
    const certified = nimSum(G.heaps) === 0 && !isOver(G.heaps);
    log(`Bot takes ${mv.take} from row ${mv.row + 1} → ${fmt(G.heaps)} ` +
        `(nim-sum ${nimSum(G.heaps)}${certified ? " — back to XOR 0, you are losing" : ""}).`);
    if (finishIfOver()) { render(); return; }
    G.turn = "you"; render();
  }

  // ---- rendering -------------------------------------------------------------
  function render() {
    renderBoard();
    renderHud();
    explain();
    $("log").innerHTML = G.log.map(s => `<div>${s}</div>`).join("");
    const act = $("actions");
    act.innerHTML = G.over
      ? `<div class="prompt">Game over — <b>${G.winner === "you" ? "you win!" : "the bot wins."}</b> ` +
        `${G.winner === "bot" ? "It played the certified nim-sum-0 strategy." : "(The bot only loses from a position that was already losing for it.)"} Press “New game”.</div>`
      : "";
  }

  function renderBoard() {
    const board = $("board");
    board.innerHTML = "";
    G.heaps.forEach((h, row) => {
      const r = document.createElement("div");
      r.className = "nim-row";
      const label = document.createElement("div");
      label.className = "nim-rowlabel";
      label.innerHTML = `<b>row ${row + 1}</b><small>${h} left</small>`;
      r.appendChild(label);

      const objs = document.createElement("div");
      objs.className = "nim-objs";
      // start size of this heap, so emptied slots still show as faded gaps
      for (let k = 0; k < START[row]; k++) {
        const o = document.createElement("button");
        const present = k < h;
        // hovering object index k (0-based) means "take (h - k)" from this row,
        // i.e. remove this object and every one to its right.
        const takeIfClicked = present ? (h - k) : 0;
        const previewing = present && G.sel && G.sel.row === row && k >= h - G.sel.take;
        o.className = "nim-obj" + (present ? "" : " gone") + (previewing ? " preview" : "");
        o.disabled = !present || G.over || G.turn !== "you";
        o.textContent = "";
        if (present && !G.over && G.turn === "you") {
          o.onmouseenter = () => { G.sel = { row, take: takeIfClicked }; renderBoard(); };
          o.onmouseleave = () => { G.sel = null; renderBoard(); };
          o.onclick = () => humanTake(row, takeIfClicked);
        }
        objs.appendChild(o);
      }
      r.appendChild(objs);

      // quick "take N" buttons as an accessible alternative to clicking objects
      const quick = document.createElement("div");
      quick.className = "nim-quick";
      if (!G.over && G.turn === "you" && h > 0) {
        for (let t = 1; t <= h; t++) {
          const b = document.createElement("button");
          b.className = "nim-take";
          b.textContent = "−" + t;
          b.onclick = () => humanTake(row, t);
          quick.appendChild(b);
        }
      }
      r.appendChild(quick);

      if (G.lastBot && G.lastBot.row === row) r.classList.add("nim-justmoved");
      board.appendChild(r);
    });
  }

  function renderHud() {
    const S = nimSum(G.heaps);
    const binWidth = Math.max(3, ...G.heaps.map(h => h.toString(2).length));
    const pad = v => v.toString(2).padStart(binWidth, "0");
    // live XOR breakdown
    const rows = G.heaps.map((h, i) =>
      `<div class="nim-xrow"><span class="nim-xlab">row ${i + 1}</span>` +
      `<span class="nim-bits">${pad(h)}</span><span class="nim-dec">= ${h}</span></div>`).join("");
    $("xor").innerHTML =
      rows +
      `<div class="nim-xrow nim-xsum"><span class="nim-xlab">XOR</span>` +
      `<span class="nim-bits">${pad(S)}</span><span class="nim-dec">= ${S}</span></div>`;

    // verdict for the side to move
    let phase, cls;
    if (G.over) {
      phase = G.winner === "you" ? "★ YOU WIN" : "☠ BOT WINS";
      cls = G.winner === "you" ? "win" : "lose";
    } else if (G.turn === "you") {
      const win = S !== 0;
      phase = win ? "Your turn — you can WIN (XOR ≠ 0)" : "Your turn — you are LOSING (XOR = 0)";
      cls = win ? "win" : "lose";
    } else {
      phase = "Bot thinking…";
      cls = "";
    }
    $("phaselbl").textContent = phase;
    $("hubphase").textContent = G.over
      ? (G.winner === "you" ? "★ YOU WIN" : "☠ BOT WINS")
      : "PERFECT BOT · UNBEATABLE FROM XOR ≠ 0";

    // certificate banner
    const yourTurnWin = !G.over && G.turn === "you" && S !== 0;
    const yourTurnLose = !G.over && G.turn === "you" && S === 0;
    let banner = "";
    if (yourTurnWin) {
      const mv = winningMove(G.heaps);
      banner = `<div class="nim-banner win">Certificate: nim-sum = <b>${S} ≠ 0</b>, so <b>you can force a win</b>. ` +
        `A winning move: take <b>${mv.take}</b> from <b>row ${mv.row + 1}</b> to leave XOR 0.</div>`;
    } else if (yourTurnLose) {
      banner = `<div class="nim-banner lose">Certificate: nim-sum = <b>0</b>, so <b>every</b> move you make leaves XOR ≠ 0 ` +
        `(lemma L2). The bot will return it to 0 and win — you are theoretically lost.</div>`;
    } else if (G.over) {
      banner = `<div class="nim-banner ${G.winner === "you" ? "win" : "lose"}">${G.winner === "you" ? "You took the last object — you win." : "The bot took the last object — it wins, exactly as the nim-sum predicted."}</div>`;
    }
    $("banner").innerHTML = banner;

    // odds bar: from XOR != 0 the side to move wins with certainty (exact, not a guess)
    const youWin = G.over ? (G.winner === "you" ? 100 : 0)
                          : (G.turn === "you" ? (S !== 0 ? 100 : 0) : (S !== 0 ? 0 : 100));
    $("oddsYou").style.width = youWin + "%";
    $("oddsBot").style.width = (100 - youWin) + "%";
    $("oddsYou").textContent = "You " + youWin + "%";
    $("oddsBot").textContent = "Bot " + (100 - youWin) + "%";
  }

  function explain() {
    const S = nimSum(G.heaps);
    $("explain").innerHTML =
      `<b>Normal-play Nim is exactly solved (Bouton 1901).</b> The single number that decides it is the ` +
      `<b>nim-sum</b> — the bitwise <code>XOR</code> of the heap sizes (shown live on the right). ` +
      `<b>The player to move wins iff the nim-sum is ≠ 0.</b> ` +
      `The bot plays the certified strategy: from XOR ≠ 0 it always has a move to XOR 0 (lemma <b>L1</b>), ` +
      `and from XOR 0 every move you make leaves XOR ≠ 0 (lemma <b>L2</b>) — both machine-checked in z3. ` +
      `So from any winning position the bot is <b>unbeatable</b>; right now the nim-sum is <b>${S}</b>.`;
  }

  // ---- one-time scoped styles (so we don't edit style.css) -------------------
  function injectStyles() {
    if (document.getElementById("nim-style")) return;
    const css = `
      #panel-nim .nim-board{display:flex;flex-direction:column;gap:14px;padding:8px 4px}
      #panel-nim .nim-row{display:grid;grid-template-columns:84px 1fr;align-items:center;gap:14px;
        background:var(--panel2);border:1px solid var(--line);border-radius:14px;padding:12px 14px;transition:.3s}
      #panel-nim .nim-row.nim-justmoved{border-color:var(--accent);box-shadow:0 0 0 3px rgba(167,139,250,.18)}
      #panel-nim .nim-rowlabel{display:flex;flex-direction:column;line-height:1.25}
      #panel-nim .nim-rowlabel small{color:var(--muted);font-size:11px}
      #panel-nim .nim-objs{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
      #panel-nim .nim-obj{width:30px;height:30px;border-radius:50%;border:2px solid var(--accent);
        background:radial-gradient(circle at 35% 30%,#c4b5fd,#7c5cff);cursor:pointer;transition:.12s;padding:0}
      #panel-nim .nim-obj:hover:not(:disabled){transform:translateY(-2px) scale(1.06)}
      #panel-nim .nim-obj:disabled{cursor:default}
      #panel-nim .nim-obj.gone{background:transparent;border-style:dashed;border-color:var(--line);opacity:.35;cursor:default}
      #panel-nim .nim-obj.preview{background:radial-gradient(circle at 35% 30%,#fecaca,#ef4444);border-color:var(--spy);
        box-shadow:0 0 0 3px rgba(239,68,68,.25)}
      #panel-nim .nim-quick{grid-column:2;display:flex;flex-wrap:wrap;gap:6px;margin-top:2px}
      #panel-nim .nim-take{font-size:11.5px;padding:3px 9px;border-radius:8px;background:var(--panel);
        border:1px solid var(--line);color:var(--muted);cursor:pointer}
      #panel-nim .nim-take:hover{border-color:var(--spy);color:var(--ink)}
      #panel-nim .nim-hub{text-align:center}
      #panel-nim .nim-xor{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;
        background:#10151e;border:1px solid var(--line);border-radius:12px;padding:12px 14px;margin:2px 0 4px}
      #panel-nim .nim-xrow{display:flex;align-items:center;gap:10px;justify-content:space-between;padding:2px 0}
      #panel-nim .nim-xlab{color:var(--muted);width:46px;text-align:left;font-family:ui-sans-serif,system-ui}
      #panel-nim .nim-bits{letter-spacing:3px;color:#cfe0ff;flex:1;text-align:center}
      #panel-nim .nim-dec{color:var(--muted);width:48px;text-align:right}
      #panel-nim .nim-xsum{border-top:1px solid var(--line);margin-top:4px;padding-top:6px;font-weight:700}
      #panel-nim .nim-xsum .nim-bits{color:#fff}
      #panel-nim .nim-xsum .nim-xlab{color:var(--accent);font-weight:700}
      #panel-nim .nim-banner{margin:12px 0 2px;border-radius:12px;padding:11px 14px;font-size:13px;border:1px solid var(--line)}
      #panel-nim .nim-banner.win{background:rgba(34,197,94,.10);border-color:rgba(34,197,94,.4);color:#bdf3cf}
      #panel-nim .nim-banner.lose{background:rgba(239,68,68,.10);border-color:rgba(239,68,68,.4);color:#ffc7c7}
    `;
    const el = document.createElement("style");
    el.id = "nim-style"; el.textContent = css;
    document.head.appendChild(el);
  }

  // ---- wiring ----------------------------------------------------------------
  function init() {
    injectStyles();
    $("new").onclick = newGame;
    newGame();
  }

  // self-init when the panel exists
  if (document.getElementById("panel-nim")) init();
  else document.addEventListener("DOMContentLoaded", () => { if (document.getElementById("panel-nim")) init(); });
})();
