// ============================================================
// game.js — Core NL Hold'em Engine
// ============================================================

class Deck {
  constructor() {
    this.cards = [];
    this.reset();
  }

  reset() {
    this.cards = [];
    const suits = ['h', 'd', 'c', 's'];
    const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
    for (const s of suits) {
      for (const r of ranks) {
        this.cards.push({ rank: r, suit: s });
      }
    }
    this.shuffle();
  }

  shuffle() {
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
  }

  deal() {
    return this.cards.pop();
  }
}

// ---- Hand Evaluator ----

const RANK_ORDER = '23456789TJQKA';

function rankVal(r) {
  return RANK_ORDER.indexOf(r);
}

const HandRank = {
  HIGH_CARD: 0,
  PAIR: 1,
  TWO_PAIR: 2,
  THREE_OF_A_KIND: 3,
  STRAIGHT: 4,
  FLUSH: 5,
  FULL_HOUSE: 6,
  FOUR_OF_A_KIND: 7,
  STRAIGHT_FLUSH: 8,
  ROYAL_FLUSH: 9,
};

const HAND_NAMES = [
  'High Card', 'Pair', 'Two Pair', 'Three of a Kind',
  'Straight', 'Flush', 'Full House', 'Four of a Kind',
  'Straight Flush', 'Royal Flush'
];

class HandEvaluator {
  static evaluate(cards) {
    // cards: array of 5-7 cards
    if (cards.length < 5) return { rank: HandRank.HIGH_CARD, value: [0], name: 'High Card', best: cards };
    const combos = HandEvaluator.combinations(cards, 5);
    let best = null;
    for (const combo of combos) {
      const result = HandEvaluator.evaluate5(combo);
      if (!best || HandEvaluator.compareHands(result, best) > 0) {
        best = result;
        best.best = combo;
      }
    }
    return best;
  }

  static evaluate5(cards) {
    const ranks = cards.map(c => rankVal(c.rank)).sort((a, b) => b - a);
    const suits = cards.map(c => c.suit);
    const isFlush = suits.every(s => s === suits[0]);

    // Check straight
    let isStraight = false;
    let straightHigh = -1;

    // Normal straight
    if (ranks[0] - ranks[4] === 4 && new Set(ranks).size === 5) {
      isStraight = true;
      straightHigh = ranks[0];
    }
    // Wheel (A-2-3-4-5)
    if (!isStraight && ranks[0] === 12 && ranks[1] === 3 && ranks[2] === 2 && ranks[3] === 1 && ranks[4] === 0) {
      isStraight = true;
      straightHigh = 3; // 5-high straight
    }

    // Count ranks
    const counts = {};
    for (const r of ranks) {
      counts[r] = (counts[r] || 0) + 1;
    }
    const groups = Object.entries(counts)
      .map(([r, c]) => ({ rank: parseInt(r), count: c }))
      .sort((a, b) => b.count - a.count || b.rank - a.rank);

    if (isStraight && isFlush) {
      if (straightHigh === 12) return { rank: HandRank.ROYAL_FLUSH, value: [straightHigh], name: 'Royal Flush' };
      return { rank: HandRank.STRAIGHT_FLUSH, value: [straightHigh], name: 'Straight Flush' };
    }
    if (groups[0].count === 4) {
      return { rank: HandRank.FOUR_OF_A_KIND, value: [groups[0].rank, groups[1].rank], name: 'Four of a Kind' };
    }
    if (groups[0].count === 3 && groups[1].count === 2) {
      return { rank: HandRank.FULL_HOUSE, value: [groups[0].rank, groups[1].rank], name: 'Full House' };
    }
    if (isFlush) {
      return { rank: HandRank.FLUSH, value: ranks, name: 'Flush' };
    }
    if (isStraight) {
      return { rank: HandRank.STRAIGHT, value: [straightHigh], name: 'Straight' };
    }
    if (groups[0].count === 3) {
      const kickers = groups.filter(g => g.count === 1).map(g => g.rank);
      return { rank: HandRank.THREE_OF_A_KIND, value: [groups[0].rank, ...kickers], name: 'Three of a Kind' };
    }
    if (groups[0].count === 2 && groups[1].count === 2) {
      const pairs = [groups[0].rank, groups[1].rank].sort((a, b) => b - a);
      const kicker = groups[2].rank;
      return { rank: HandRank.TWO_PAIR, value: [...pairs, kicker], name: 'Two Pair' };
    }
    if (groups[0].count === 2) {
      const kickers = groups.filter(g => g.count === 1).map(g => g.rank);
      return { rank: HandRank.PAIR, value: [groups[0].rank, ...kickers], name: 'Pair' };
    }
    return { rank: HandRank.HIGH_CARD, value: ranks, name: 'High Card' };
  }

  static compareHands(a, b) {
    if (a.rank !== b.rank) return a.rank - b.rank;
    for (let i = 0; i < Math.min(a.value.length, b.value.length); i++) {
      if (a.value[i] !== b.value[i]) return a.value[i] - b.value[i];
    }
    return 0;
  }

  static combinations(arr, k) {
    const result = [];
    function helper(start, combo) {
      if (combo.length === k) { result.push([...combo]); return; }
      for (let i = start; i < arr.length; i++) {
        combo.push(arr[i]);
        helper(i + 1, combo);
        combo.pop();
      }
    }
    helper(0, []);
    return result;
  }
}

// ---- Player ----

class Player {
  constructor(id, name, isHuman = false) {
    this.id = id;
    this.name = name;
    this.isHuman = isHuman;
    this.chips = 200;
    this.hand = [];
    this.bet = 0;
    this.folded = false;
    this.allIn = false;
    this.sittingOut = false;
  }

  reset() {
    this.hand = [];
    this.bet = 0;
    this.folded = false;
    this.allIn = false;
  }
}

// ---- Game States ----

const GamePhase = {
  WAITING: 'waiting',
  PREFLOP: 'preflop',
  FLOP: 'flop',
  TURN: 'turn',
  RIVER: 'river',
  SHOWDOWN: 'showdown',
};

// ---- Game ----

class Game {
  constructor(playerCount = 6) {
    this.players = [];
    this.communityCards = [];
    this.deck = new Deck();
    this.pot = 0;
    this.sidePots = [];
    this.phase = GamePhase.WAITING;
    this.dealerIndex = 0;
    this.currentPlayerIndex = -1;
    this.smallBlind = 1;
    this.bigBlind = 2;
    this.minRaise = this.bigBlind;
    this.lastRaise = 0;
    this.handNumber = 0;
    this.speed = 1; // 0=instant, 1=normal, 2=slow
    this.stats = this.loadStats();
    this.leaderboard = this.loadLeaderboard();
    this.onStateChange = null;
    this.onHandComplete = null;
    this.paused = false;
    this.handInProgress = false;

    this.initPlayers(playerCount);
  }

  initPlayers(count) {
    this.players = [];
    this.players.push(new Player(0, 'You', true));
    const botNames = ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve', 'Frank', 'Grace', 'Hank', 'Ivy'];
    for (let i = 1; i < count; i++) {
      this.players.push(new Player(i, botNames[i - 1]));
    }
  }

  loadStats() {
    try {
      return JSON.parse(localStorage.getItem('holdem_stats')) || { handsPlayed: 0, handsWon: 0, totalProfit: 0 };
    } catch { return { handsPlayed: 0, handsWon: 0, totalProfit: 0 }; }
  }

  saveStats() {
    localStorage.setItem('holdem_stats', JSON.stringify(this.stats));
  }

  loadLeaderboard() {
    try {
      return JSON.parse(localStorage.getItem('holdem_leaderboard')) || [];
    } catch { return []; }
  }

  saveLeaderboard() {
    localStorage.setItem('holdem_leaderboard', JSON.stringify(this.leaderboard));
  }

  addToLeaderboard(entry) {
    this.leaderboard.push(entry);
    this.leaderboard.sort((a, b) => b.profit - a.profit);
    if (this.leaderboard.length > 20) this.leaderboard.length = 20;
    this.saveLeaderboard();
  }

  activePlayers() {
    return this.players.filter(p => !p.folded && !p.sittingOut);
  }

  playersInHand() {
    return this.players.filter(p => !p.sittingOut);
  }

  playersStillActing() {
    return this.activePlayers().filter(p => !p.allIn);
  }

  startHand() {
    if (this.handInProgress) return;
    this.handInProgress = true;
    this.handNumber++;
    this.deck.reset();
    this.communityCards = [];
    this.pot = 0;
    this.sidePots = [];
    this.minRaise = this.bigBlind;
    this.lastRaise = 0;

    // Reset players, give them 200 chips
    for (const p of this.players) {
      p.reset();
      p.chips = 200;
    }

    // Move dealer
    this.dealerIndex = (this.dealerIndex) % this.players.length;

    // Post blinds
    const sbIdx = this.nextActiveIndex(this.dealerIndex);
    const bbIdx = this.nextActiveIndex(sbIdx);
    this.postBlind(sbIdx, this.smallBlind);
    this.postBlind(bbIdx, this.bigBlind);

    // Deal hole cards
    for (const p of this.players) {
      if (!p.sittingOut) {
        p.hand = [this.deck.deal(), this.deck.deal()];
      }
    }

    this.phase = GamePhase.PREFLOP;
    this.currentPlayerIndex = this.nextActiveIndex(bbIdx);

    // Track who needs to act
    this.resetActed();
    // BB has already acted by posting blind but gets option to raise
    this.players[bbIdx]._acted = false;

    this.emitState();
  }

  postBlind(idx, amount) {
    const p = this.players[idx];
    const actual = Math.min(amount, p.chips);
    p.bet = actual;
    p.chips -= actual;
    this.pot += actual;
    if (p.chips === 0) p.allIn = true;
  }

  nextActiveIndex(from) {
    let idx = (from + 1) % this.players.length;
    let safety = 0;
    while ((this.players[idx].folded || this.players[idx].sittingOut || this.players[idx].allIn) && safety < this.players.length) {
      idx = (idx + 1) % this.players.length;
      safety++;
    }
    return idx;
  }

  resetActed() {
    for (const p of this.players) {
      p._acted = p.folded || p.sittingOut || p.allIn;
    }
  }

  currentMaxBet() {
    return Math.max(...this.players.map(p => p.bet));
  }

  canCheck() {
    const p = this.players[this.currentPlayerIndex];
    return p.bet >= this.currentMaxBet();
  }

  callAmount() {
    const p = this.players[this.currentPlayerIndex];
    return Math.min(this.currentMaxBet() - p.bet, p.chips);
  }

  minRaiseAmount() {
    const p = this.players[this.currentPlayerIndex];
    const toCall = this.currentMaxBet() - p.bet;
    const minTotal = this.currentMaxBet() + Math.max(this.minRaise, this.bigBlind);
    return Math.min(minTotal - p.bet, p.chips);
  }

  getValidActions() {
    const p = this.players[this.currentPlayerIndex];
    if (p.allIn || p.folded) return [];

    const actions = ['fold'];
    const maxBet = this.currentMaxBet();
    const toCall = maxBet - p.bet;

    if (toCall === 0) {
      actions.push('check');
    } else {
      actions.push('call');
    }

    // Can raise if player has more chips than needed to call
    if (p.chips > toCall) {
      actions.push('raise');
    }

    return actions;
  }

  performAction(action, amount = 0) {
    const p = this.players[this.currentPlayerIndex];
    if (p.folded || p.allIn) return;

    switch (action) {
      case 'fold':
        p.folded = true;
        break;
      case 'check':
        break;
      case 'call': {
        const toCall = this.callAmount();
        p.chips -= toCall;
        p.bet += toCall;
        this.pot += toCall;
        if (p.chips === 0) p.allIn = true;
        break;
      }
      case 'raise': {
        const maxBet = this.currentMaxBet();
        const totalBet = Math.min(amount, p.chips + p.bet);
        const raiseBy = totalBet - maxBet;
        const chipsCost = totalBet - p.bet;
        p.chips -= chipsCost;
        this.pot += chipsCost;
        p.bet = totalBet;
        if (raiseBy > 0) {
          this.minRaise = raiseBy;
          this.lastRaise = totalBet;
        }
        if (p.chips === 0) p.allIn = true;
        // Everyone else needs to act again
        this.resetActed();
        p._acted = true;
        break;
      }
    }

    p._acted = true;

    // Check if hand is over (only 1 player left)
    if (this.activePlayers().length === 1) {
      this.awardPotToWinner();
      return;
    }

    // Check if betting round is over
    if (this.isBettingRoundComplete()) {
      this.advancePhase();
    } else {
      this.currentPlayerIndex = this.nextActiveIndex(this.currentPlayerIndex);
      this.emitState();
    }
  }

  isBettingRoundComplete() {
    const maxBet = this.currentMaxBet();
    for (const p of this.players) {
      if (p.folded || p.sittingOut || p.allIn) continue;
      if (!p._acted) return false;
      if (p.bet < maxBet) return false;
    }
    return true;
  }

  advancePhase() {
    // Collect bets into pot (already done incrementally)
    for (const p of this.players) {
      p.bet = 0;
    }
    this.minRaise = this.bigBlind;
    this.lastRaise = 0;

    switch (this.phase) {
      case GamePhase.PREFLOP:
        this.phase = GamePhase.FLOP;
        this.communityCards.push(this.deck.deal(), this.deck.deal(), this.deck.deal());
        break;
      case GamePhase.FLOP:
        this.phase = GamePhase.TURN;
        this.communityCards.push(this.deck.deal());
        break;
      case GamePhase.TURN:
        this.phase = GamePhase.RIVER;
        this.communityCards.push(this.deck.deal());
        break;
      case GamePhase.RIVER:
        this.phase = GamePhase.SHOWDOWN;
        this.resolveShowdown();
        return;
    }

    // If all active players are all-in, just advance
    if (this.playersStillActing().length <= 1) {
      this.emitState();
      // Auto-advance after delay
      setTimeout(() => {
        if (this.phase !== GamePhase.SHOWDOWN) {
          this.advancePhase();
        }
      }, this.getDelay());
      return;
    }

    this.resetActed();
    // First to act is first active player after dealer
    this.currentPlayerIndex = this.nextActiveIndex(this.dealerIndex);
    this.emitState();
  }

  resolveShowdown() {
    const active = this.activePlayers();

    // Evaluate hands
    for (const p of active) {
      const allCards = [...p.hand, ...this.communityCards];
      p.handResult = HandEvaluator.evaluate(allCards);
    }

    // Sort by hand strength (best first)
    const ranked = [...active].sort((a, b) => HandEvaluator.compareHands(b.handResult, a.handResult));

    // Find winners (could be a tie)
    const winners = [ranked[0]];
    for (let i = 1; i < ranked.length; i++) {
      if (HandEvaluator.compareHands(ranked[i].handResult, ranked[0].handResult) === 0) {
        winners.push(ranked[i]);
      } else break;
    }

    // Split pot among winners
    const share = Math.floor(this.pot / winners.length);
    const remainder = this.pot - share * winners.length;
    for (let i = 0; i < winners.length; i++) {
      winners[i].chips += share + (i === 0 ? remainder : 0);
    }

    this.finishHand(winners, ranked);
  }

  awardPotToWinner() {
    const winner = this.activePlayers()[0];
    winner.chips += this.pot;

    this.phase = GamePhase.SHOWDOWN;
    this.finishHand([winner], [winner]);
  }

  finishHand(winners, ranked) {
    const humanPlayer = this.players[0];
    const humanWon = winners.some(w => w.id === 0);
    const profit = humanPlayer.chips - 200;

    this.stats.handsPlayed++;
    if (humanWon) this.stats.handsWon++;
    this.stats.totalProfit += profit;
    this.saveStats();

    this.handInProgress = false;
    this.lastHandResult = {
      winners,
      ranked,
      profit,
      humanWon,
    };

    this.dealerIndex = (this.dealerIndex + 1) % this.players.length;

    this.emitState();
    if (this.onHandComplete) {
      this.onHandComplete(this.lastHandResult);
    }
  }

  getDelay() {
    if (this.speed === 0) return 50;
    if (this.speed === 1) return 600;
    return 1200;
  }

  emitState() {
    if (this.onStateChange) this.onStateChange();
  }

  getState() {
    return {
      players: this.players,
      communityCards: this.communityCards,
      pot: this.pot,
      phase: this.phase,
      dealerIndex: this.dealerIndex,
      currentPlayerIndex: this.currentPlayerIndex,
      handNumber: this.handNumber,
      validActions: this.phase !== GamePhase.SHOWDOWN && this.phase !== GamePhase.WAITING
        ? this.getValidActions() : [],
      callAmount: this.callAmount(),
      minRaiseAmount: this.minRaiseAmount(),
      canCheck: this.canCheck(),
      currentMaxBet: this.currentMaxBet(),
    };
  }
}
