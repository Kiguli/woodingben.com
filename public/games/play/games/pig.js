// Pig (dice) — interactive 2-player Pig vs the OPTIMAL bot.
// Self-contained module; binds to elements prefixed "pig-" inside #panel-pig.
// Mirrors the Python value-iteration solution (mdp.py): the certified optimal value
// table V(myScore, oppScore, turnTotal) drives the bot, the live "optimal call", and
// the win-odds bar. The first-player optimal win prob (0.5306) is CERTIFIED in Python;
// the live numbers here are read from the embedded certified table (labelled estimates
// for the running tally, certified for the headline value-iteration value).
(function () {
  "use strict";

  const TARGET = 100, SIDES = 6, BUST = 1;
  const SCORING = [2, 3, 4, 5, 6];
  const P = 1 / SIDES;

  // Certified headline numbers from the Python value iteration (verify.py / results/).
  const CERT = {
    firstPlayer: 0.530593,     // V(0,0,0): first-player optimal win prob (≈ 53.06%)
    hold20: 0.534698,          // hold-at-20 self-play, first player
    optVsHold20First: 0.587368,// optimal best-responder vs hold-20, going first
    optVsHold20Second: 0.522382,// optimal best-responder vs hold-20, going second
  };

  // ----- the certified fresh-turn table P0[i][j] = V(i,j,0), 100x100 -----------
  // Packed little-endian uint16 (value*65535), base64. Decoded once at load. From
  // mdp.py's converged value iteration; near-exact (16-bit) so the bot, the live
  // optimal call and the odds bar match the certified Python solution.
  const P0_B64 = "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";

  function decodeP0(b64) {
    const bin = atob(b64);
    const n = bin.length;
    const bytes = new Uint8Array(n);
    for (let i = 0; i < n; i++) bytes[i] = bin.charCodeAt(i);
    const u16 = new Uint16Array(bytes.buffer);            // little-endian on all target platforms
    const P0 = [];
    for (let i = 0; i < TARGET; i++) {
      const row = new Float64Array(TARGET);
      for (let j = 0; j < TARGET; j++) row[j] = u16[i * TARGET + j] / 65535;
      P0.push(row);
    }
    return P0;
  }
  const P0 = decodeP0(P0_B64);

  // V(i,j,0) for the player to move, fresh turn (the decoded handover table).
  function P0v(i, j) {
    if (i >= TARGET) return 1.0;          // already won
    if (j >= TARGET) return 0.0;          // opp already won
    return P0[i][j];
  }

  // Solve the turn-total chain for state (i,j,*) from the handover table, returning
  // {value:[k], action:[k]} — exactly mdp.py's per-(i,j) backward pass. O(TARGET).
  function chain(i, j) {
    const kmax = TARGET - 1;
    const Vk = new Float64Array(kmax + 1);
    const Ak = new Array(kmax + 1);
    const bust = 1 - P0v(j, i);           // bust -> opp fresh turn at (j,i,0)
    for (let k = kmax; k >= 0; k--) {
      if (i + k >= TARGET) { Vk[k] = 1.0; Ak[k] = "hold"; continue; }
      const hold = 1 - P0v(j, i + k);     // bank i+k -> opp to move
      let acc = bust;
      for (const f of SCORING) acc += (i + k + f >= TARGET) ? 1.0 : Vk[k + f];
      const roll = P * acc;
      if (roll >= hold) { Vk[k] = roll; Ak[k] = "roll"; }
      else { Vk[k] = hold; Ak[k] = "hold"; }
    }
    return { Vk, Ak };
  }

  // The optimal win prob for the player to move in (i,j,k).
  function value(i, j, k) {
    if (i + k >= TARGET) return 1.0;
    return chain(i, j).Vk[k];
  }
  // The optimal action in (i,j,k).
  function action(i, j, k) {
    if (i + k >= TARGET) return "hold";
    return chain(i, j).Ak[k];
  }
  // The optimal "hold at" threshold for fresh state (i,j).
  function holdThreshold(i, j) {
    const { Ak } = chain(i, j);
    for (let k = 0; k <= TARGET - 1; k++) {
      if (i + k >= TARGET) return k;
      if (Ak[k] === "hold") return k;
    }
    return TARGET;
  }

  // ----- game state ------------------------------------------------------------
  // Players: 0 = YOU (human), 1 = BOT (optimal). humanFirst toggles who starts.
  let G = null, rolling = false;
  const $ = id => document.getElementById("pig-" + id);

  function newGame(humanFirst) {
    G = {
      score: [0, 0], turn: 0, cur: humanFirst ? 0 : 1,
      humanFirst, winner: null, log: [], lastDie: null, botThinking: false,
    };
    log(`New game to ${TARGET}. ${humanFirst ? "You" : "The optimal bot"} go first.`);
    render();
    if (G.cur === 1) setTimeout(botTurn, 700);
  }

  function log(s) { G.log.unshift(s); if (G.log.length > 40) G.log.pop(); }
  const isHuman = () => G.cur === 0;

  // ----- core moves ------------------------------------------------------------
  function endTurnPass() {
    // The turn is changing hands. Reset both flags here: `rolling` clears the input lock
    // a bust sets during its hand-over pause, and `botThinking` is reset so a bot BUST
    // (which reaches endTurnPass without re-entering the bot step that clears it) doesn't
    // leave the human's controls permanently disabled.
    rolling = false;
    G.botThinking = false;
    G.turn = 0; G.cur = 1 - G.cur; render();
    if (G.cur === 1 && !G.winner) setTimeout(botTurn, 650);
  }

  function doRoll(after) {
    if (G.winner || rolling) return;
    rolling = true;
    const die = 1 + Math.floor(Math.random() * SIDES);
    animateDie(die, () => {
      rolling = false;
      G.lastDie = die;
      const me = G.cur, opp = 1 - me;
      if (die === BUST) {
        log(`${who(me)} rolled a 1 — bust! Turn total lost.`);
        G.turn = 0;
        rolling = true;          // lock input through the hand-over pause so a bust truly
                                 // ends the turn (else the human could Roll again during the
                                 // 500ms before endTurnPass flips the turn over).
        render();
        setTimeout(() => endTurnPass(), 500);
      } else {
        G.turn += die;
        if (G.score[me] + G.turn >= TARGET) {
          G.score[me] += G.turn; G.winner = me;
          log(`${who(me)} reached ${TARGET} — ${who(me)} win${me === 0 ? "" : "s"}!`);
          G.turn = 0; render(); return;
        }
        log(`${who(me)} rolled ${die}. Turn total: ${G.turn}.`);
        render();
        if (after) after();
      }
    });
  }

  function doHold() {
    if (G.winner || rolling) return;
    const me = G.cur;
    G.score[me] += G.turn;
    log(`${who(me)} holds, banking ${G.turn}. Score: ${G.score[me]}.`);
    if (G.score[me] >= TARGET) {
      G.winner = me;
      log(`${who(me)} reached ${TARGET} — ${who(me)} win${me === 0 ? "" : "s"}!`);
      G.turn = 0; render(); return;
    }
    endTurnPass();
  }

  // The optimal bot plays one full turn following the certified policy.
  function botTurn() {
    if (G.winner || G.cur !== 1) return;
    G.botThinking = true; render();
    const step = () => {
      if (G.winner || G.cur !== 1) { G.botThinking = false; render(); return; }
      const a = action(G.score[1], G.score[0], G.turn);
      if (a === "roll") {
        doRoll(() => { if (!G.winner && G.cur === 1) setTimeout(step, 620); });
      } else {
        G.botThinking = false;
        doHold();
      }
    };
    setTimeout(step, 500);
  }

  function who(p) { return p === 0 ? "You" : "Bot"; }

  // ----- dice animation --------------------------------------------------------
  const PIPS = {
    1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8],
    5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8],
  };
  function dieFace(v) {
    let s = "";
    for (let i = 0; i < 9; i++) s += `<i class="${PIPS[v].includes(i) ? "on" : ""}"></i>`;
    return s;
  }
  function animateDie(finalVal, done) {
    const el = $("die");
    el.classList.add("rolling");
    let ticks = 0;
    const iv = setInterval(() => {
      const v = 1 + Math.floor(Math.random() * SIDES);
      el.innerHTML = dieFace(v);
      if (++ticks >= 8) {
        clearInterval(iv);
        el.innerHTML = dieFace(finalVal);
        el.classList.remove("rolling");
        el.classList.add(finalVal === BUST ? "bust" : "good");
        setTimeout(() => el.classList.remove("bust", "good"), 450);
        done();
      }
    }, 55);
  }

  // ----- rendering -------------------------------------------------------------
  function render() {
    // scores
    $("you-score").textContent = G.score[0];
    $("bot-score").textContent = G.score[1];
    $("you-card").classList.toggle("active", G.cur === 0 && !G.winner);
    $("bot-card").classList.toggle("active", G.cur === 1 && !G.winner);
    $("turn-total").textContent = G.turn;

    // who-to-move banner
    const banner = $("phase");
    if (G.winner !== null) {
      banner.textContent = G.winner === 0 ? "★ YOU WIN" : "☠ BOT WINS";
      banner.className = "phase " + (G.winner === 0 ? "win" : "lose");
    } else {
      banner.textContent = (isHuman() ? "YOUR TURN" : "BOT THINKING…");
      banner.className = "phase";
    }

    // live optimal call for the player to move (the solver's decision in this state)
    const me = G.cur, opp = 1 - me;
    const a = G.winner !== null ? "—" : action(G.score[me], G.score[opp], G.turn);
    const thr = G.winner !== null ? "—" : holdThreshold(G.score[me], G.score[opp]);
    const callEl = $("optcall");
    if (G.winner !== null) {
      callEl.innerHTML = `<b>Game over.</b>`;
    } else {
      const verb = a === "roll" ? "ROLL" : "HOLD";
      callEl.innerHTML =
        `Optimal play for <b>${who(me)}</b> here: <span class="pig-call ${a}">${verb}</span>`
        + ` &middot; policy: roll until turn total ≥ <b>${thr === TARGET ? "win" : thr}</b>`;
    }

    // win-odds bar: certified value V(i,j,k) for the player to move, framed as
    // P(YOU win). If it is your move, that's value(you,bot,turn); if bot's move,
    // it's 1 - value(bot,you,turn).
    let pYou;
    if (G.winner !== null) pYou = G.winner === 0 ? 1 : 0;
    else if (isHuman()) pYou = value(G.score[0], G.score[1], G.turn);
    else pYou = 1 - value(G.score[1], G.score[0], G.turn);
    const r = Math.round(pYou * 100);
    $("oddsYou").style.width = r + "%"; $("oddsBot").style.width = (100 - r) + "%";
    $("oddsYou").textContent = "You " + r + "%";
    $("oddsBot").textContent = "Bot " + (100 - r) + "%";

    // controls
    const canAct = G.winner === null && isHuman() && !rolling && !G.botThinking;
    $("roll").disabled = !canAct;
    $("hold").disabled = !canAct || G.turn === 0;   // nothing to bank on an empty turn total

    // analysis readouts
    $("a-thr").textContent = G.winner !== null ? "—" : (thr === TARGET ? "all-in (roll to win)" : "≥ " + thr);
    $("a-val").textContent = (pYou * 100).toFixed(1) + "%";
    $("a-state").textContent = `you ${G.score[0]} · bot ${G.score[1]} · turn ${G.turn}`;

    // optimal call advice for the human specifically (only when it's your move)
    const advice = $("advice");
    if (G.winner === null && isHuman()) {
      const same = a;  // optimal call for you
      advice.innerHTML = `The solver would <span class="pig-call ${same}">${same.toUpperCase()}</span>`
        + ` in your position (estimate from the certified table).`;
    } else if (G.winner !== null) {
      advice.textContent = G.winner === 0
        ? "You won. Try again — the bot plays the certified optimal policy."
        : "The bot (optimal policy) won. Rematch?";
    } else {
      advice.textContent = "The bot is playing its certified optimal turn…";
    }

    // dice face (idle)
    if (!rolling && (!$("die").innerHTML || G.lastDie === null)) $("die").innerHTML = dieFace(G.lastDie || 1);

    $("log").innerHTML = G.log.map(s => `<div>${s}</div>`).join("");
  }

  // ----- wiring ----------------------------------------------------------------
  $("roll").onclick = () => { if (isHuman()) doRoll(); };
  $("hold").onclick = () => { if (isHuman()) doHold(); };
  $("new-you").onclick = () => newGame(true);
  $("new-bot").onclick = () => newGame(false);

  newGame(true);
})();
