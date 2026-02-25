// ============================================================
// ui.js — DOM Rendering, Animations, User Interactions
// ============================================================

class UI {
  constructor(game) {
    this.game = game;
    this.elements = {};
    this.raiseAmount = 0;
    this.animating = false;
    this.setupStartScreen();
    this.bindKeyboard();
  }

  // ---- Start Screen ----

  setupStartScreen() {
    const startScreen = document.getElementById('start-screen');
    const startBtn = document.getElementById('start-game-btn');
    const playerCountSelect = document.getElementById('player-count');

    startBtn.addEventListener('click', () => {
      const count = parseInt(playerCountSelect.value);
      this.game.initPlayers(count);
      startScreen.classList.add('hidden');
      document.getElementById('game-screen').classList.remove('hidden');
      this.cacheElements();
      this.setupControls();
      this.renderLeaderboard();
      this.startNewHand();
    });
  }

  cacheElements() {
    this.elements = {
      table: document.getElementById('poker-table'),
      community: document.getElementById('community-cards'),
      pot: document.getElementById('pot-display'),
      phase: document.getElementById('phase-display'),
      controls: document.getElementById('controls'),
      foldBtn: document.getElementById('fold-btn'),
      checkBtn: document.getElementById('check-btn'),
      callBtn: document.getElementById('call-btn'),
      raiseBtn: document.getElementById('raise-btn'),
      raiseSlider: document.getElementById('raise-slider'),
      raiseValue: document.getElementById('raise-value'),
      presetBtns: document.querySelectorAll('.preset-btn'),
      speedSelect: document.getElementById('speed-select'),
      stats: document.getElementById('stats-display'),
      handResult: document.getElementById('hand-result'),
      playerSlots: document.getElementById('player-slots'),
      leaderboard: document.getElementById('leaderboard-body'),
    };
  }

  setupControls() {
    this.elements.foldBtn.addEventListener('click', () => this.doAction('fold'));
    this.elements.checkBtn.addEventListener('click', () => this.doAction('check'));
    this.elements.callBtn.addEventListener('click', () => this.doAction('call'));
    this.elements.raiseBtn.addEventListener('click', () => {
      this.doAction('raise', parseInt(this.elements.raiseSlider.value));
    });

    this.elements.raiseSlider.addEventListener('input', () => {
      this.elements.raiseValue.textContent = this.elements.raiseSlider.value;
    });

    this.elements.presetBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const type = btn.dataset.preset;
        const pot = this.game.pot;
        const maxBet = this.game.currentMaxBet();
        const player = this.game.players[0];
        let val;
        if (type === 'half') val = maxBet + Math.floor(pot / 2);
        else if (type === 'pot') val = maxBet + pot;
        else if (type === '2x') val = maxBet + pot * 2;
        else if (type === 'allin') val = player.bet + player.chips;
        val = Math.max(val, parseInt(this.elements.raiseSlider.min));
        val = Math.min(val, parseInt(this.elements.raiseSlider.max));
        this.elements.raiseSlider.value = val;
        this.elements.raiseValue.textContent = val;
      });
    });

    this.elements.speedSelect.addEventListener('change', () => {
      this.game.speed = parseInt(this.elements.speedSelect.value);
    });

    // New hand button
    document.getElementById('new-hand-btn').addEventListener('click', () => {
      if (!this.game.handInProgress) {
        this.startNewHand();
      }
    });

    // Set up game callbacks
    this.game.onStateChange = () => this.render();
    this.game.onHandComplete = (result) => this.showHandResult(result);
  }

  bindKeyboard() {
    document.addEventListener('keydown', (e) => {
      if (this.game.phase === GamePhase.WAITING || this.game.phase === GamePhase.SHOWDOWN) return;
      if (this.game.currentPlayerIndex !== 0) return;
      const player = this.game.players[0];
      if (player.folded || player.allIn) return;

      switch (e.key.toLowerCase()) {
        case 'f': this.doAction('fold'); break;
        case 'c':
          if (this.game.canCheck()) this.doAction('check');
          else this.doAction('call');
          break;
        case 'r':
          this.doAction('raise', parseInt(this.elements.raiseSlider.value));
          break;
      }
    });
  }

  doAction(action, amount) {
    if (this.game.currentPlayerIndex !== 0) return;
    if (this.game.phase === GamePhase.SHOWDOWN || this.game.phase === GamePhase.WAITING) return;
    this.game.performAction(action, amount);
    this.continuePlay();
  }

  startNewHand() {
    this.elements.handResult.classList.add('hidden');
    this.game.startHand();
    this.render();
    this.continuePlay();
  }

  continuePlay() {
    if (this.game.phase === GamePhase.SHOWDOWN || this.game.phase === GamePhase.WAITING) return;

    const current = this.game.players[this.game.currentPlayerIndex];
    if (!current.isHuman && !current.folded && !current.allIn) {
      setTimeout(() => {
        if (this.game.phase === GamePhase.SHOWDOWN) return;
        const decision = AIPlayer.decideAction(current, this.game);
        if (decision) {
          this.game.performAction(decision.action, decision.amount);
          this.continuePlay();
        }
      }, this.game.getDelay());
    }
  }

  // ---- Rendering ----

  render() {
    this.renderPlayers();
    this.renderCommunityCards();
    this.renderPot();
    this.renderPhase();
    this.renderControls();
    this.renderStats();
  }

  renderPlayers() {
    const container = this.elements.playerSlots;
    container.innerHTML = '';
    const count = this.game.players.length;
    const positions = this.getPlayerPositions(count);

    this.game.players.forEach((player, i) => {
      const pos = positions[i];
      const el = document.createElement('div');
      el.className = 'player-slot';
      if (player.folded) el.classList.add('folded');
      if (i === this.game.currentPlayerIndex && this.game.phase !== GamePhase.SHOWDOWN && this.game.phase !== GamePhase.WAITING) {
        el.classList.add('active');
      }
      if (player.isHuman) el.classList.add('human');

      el.style.left = pos.x + '%';
      el.style.top = pos.y + '%';

      // Dealer button
      const dealerBadge = i === this.game.dealerIndex ? '<span class="dealer-btn">D</span>' : '';

      // Cards
      let cardsHTML = '';
      if (player.hand.length === 2) {
        if (player.isHuman || this.game.phase === GamePhase.SHOWDOWN) {
          cardsHTML = `<div class="hole-cards">
            ${this.cardHTML(player.hand[0])}${this.cardHTML(player.hand[1])}
          </div>`;
        } else {
          cardsHTML = `<div class="hole-cards">
            <div class="card card-back"></div><div class="card card-back"></div>
          </div>`;
        }
      }

      // Hand result at showdown
      let handName = '';
      if (this.game.phase === GamePhase.SHOWDOWN && player.handResult && !player.folded) {
        handName = `<div class="hand-name">${player.handResult.name}</div>`;
      }

      // Bet display
      let betHTML = '';
      if (player.bet > 0) {
        betHTML = `<div class="player-bet"><span class="chip-icon"></span>${player.bet}</div>`;
      }

      el.innerHTML = `
        ${dealerBadge}
        ${cardsHTML}
        <div class="player-info">
          <div class="player-name">${player.name}</div>
          <div class="player-chips">${player.chips} chips</div>
          ${player.allIn ? '<div class="all-in-badge">ALL IN</div>' : ''}
          ${player.folded ? '<div class="folded-badge">FOLD</div>' : ''}
          ${handName}
        </div>
        ${betHTML}
      `;

      container.appendChild(el);
    });
  }

  getPlayerPositions(count) {
    // Arrange players around an oval. Player 0 (human) at bottom center.
    const positions = [];
    for (let i = 0; i < count; i++) {
      // Start from bottom (270 deg) and go clockwise
      const angle = (270 + (360 / count) * i) * (Math.PI / 180);
      const rx = 44; // horizontal radius %
      const ry = 40; // vertical radius %
      const cx = 50;
      const cy = 48;
      positions.push({
        x: cx + rx * Math.cos(angle),
        y: cy + ry * Math.sin(angle),
      });
    }
    return positions;
  }

  cardHTML(card) {
    const suitSymbols = { h: '\u2665', d: '\u2666', c: '\u2663', s: '\u2660' };
    const suitColors = { h: 'red', d: 'red', c: 'black', s: 'black' };
    const rankDisplay = card.rank === 'T' ? '10' : card.rank;
    return `<div class="card card-${suitColors[card.suit]}">
      <span class="card-rank">${rankDisplay}</span><span class="card-suit">${suitSymbols[card.suit]}</span>
    </div>`;
  }

  renderCommunityCards() {
    const container = this.elements.community;
    const existing = container.children.length;
    const cards = this.game.communityCards;
    // Only append newly dealt cards — never rebuild existing ones
    for (let i = existing; i < cards.length; i++) {
      const wrapper = document.createElement('div');
      wrapper.innerHTML = this.cardHTML(cards[i]);
      container.appendChild(wrapper.firstElementChild);
    }
    // If fewer cards than DOM nodes (new hand), clear all
    if (cards.length < existing) {
      container.innerHTML = '';
    }
  }

  renderPot() {
    this.elements.pot.textContent = `Pot: ${this.game.pot}`;
  }

  renderPhase() {
    const names = {
      [GamePhase.WAITING]: 'Waiting',
      [GamePhase.PREFLOP]: 'Pre-Flop',
      [GamePhase.FLOP]: 'Flop',
      [GamePhase.TURN]: 'Turn',
      [GamePhase.RIVER]: 'River',
      [GamePhase.SHOWDOWN]: 'Showdown',
    };
    this.elements.phase.textContent = names[this.game.phase] || '';
  }

  renderControls() {
    const state = this.game.getState();
    const isMyTurn = this.game.currentPlayerIndex === 0 &&
      this.game.phase !== GamePhase.SHOWDOWN &&
      this.game.phase !== GamePhase.WAITING;
    const player = this.game.players[0];

    // Show/hide controls
    this.elements.controls.classList.toggle('disabled', !isMyTurn || player.folded || player.allIn);

    if (!isMyTurn) return;

    const actions = state.validActions;

    this.elements.foldBtn.disabled = !actions.includes('fold');
    this.elements.checkBtn.disabled = !actions.includes('check');
    this.elements.checkBtn.classList.toggle('hidden', !actions.includes('check'));
    this.elements.callBtn.disabled = !actions.includes('call');
    this.elements.callBtn.classList.toggle('hidden', !actions.includes('call'));
    this.elements.callBtn.textContent = `Call ${state.callAmount}`;
    this.elements.raiseBtn.disabled = !actions.includes('raise');

    // Update slider
    if (actions.includes('raise')) {
      const min = state.currentMaxBet + this.game.minRaise;
      const max = player.bet + player.chips;
      this.elements.raiseSlider.min = min;
      this.elements.raiseSlider.max = max;
      if (parseInt(this.elements.raiseSlider.value) < min) {
        this.elements.raiseSlider.value = min;
      }
      this.elements.raiseValue.textContent = this.elements.raiseSlider.value;
    }
  }

  renderStats() {
    const s = this.game.stats;
    const winRate = s.handsPlayed > 0 ? ((s.handsWon / s.handsPlayed) * 100).toFixed(1) : '0.0';
    this.elements.stats.innerHTML = `
      <span>Hands: ${s.handsPlayed}</span>
      <span>Won: ${s.handsWon}</span>
      <span>Win Rate: ${winRate}%</span>
      <span>Profit: <span class="${s.totalProfit >= 0 ? 'profit-pos' : 'profit-neg'}">${s.totalProfit >= 0 ? '+' : ''}${s.totalProfit}</span></span>
    `;
  }

  showHandResult(result) {
    const el = this.elements.handResult;
    const winnerNames = result.winners.map(w => w.name).join(', ');
    const handName = result.winners[0].handResult ? result.winners[0].handResult.name : '';
    const profitText = result.profit >= 0 ? `+${result.profit}` : `${result.profit}`;
    const profitClass = result.profit >= 0 ? 'profit-pos' : 'profit-neg';

    el.innerHTML = `
      <div class="result-title">${result.humanWon ? 'You Win!' : `${winnerNames} Wins`}</div>
      ${handName ? `<div class="result-hand">${handName}</div>` : ''}
      <div class="result-profit ${profitClass}">${profitText} chips</div>
      <button class="result-new-hand-btn">New Hand</button>
    `;
    el.classList.remove('hidden');

    el.querySelector('.result-new-hand-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      this.startNewHand();
    });

    this.renderLeaderboard();
  }

  renderLeaderboard() {
    const lb = this.game.leaderboard;
    const tbody = this.elements.leaderboard;
    if (!tbody) return;
    tbody.innerHTML = '';
    if (lb.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;opacity:0.5;">No entries yet</td></tr>';
      return;
    }
    lb.slice(0, 10).forEach((entry, i) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${i + 1}</td><td>${entry.date || '-'}</td><td class="${entry.profit >= 0 ? 'profit-pos' : 'profit-neg'}">${entry.profit >= 0 ? '+' : ''}${entry.profit}</td>`;
      tbody.appendChild(tr);
    });
  }
}
