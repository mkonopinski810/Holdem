// ============================================================
// ai.js — AI Opponent Logic
// ============================================================

class AIPlayer {
  static decideAction(player, game) {
    const state = game.getState();
    const validActions = state.validActions;
    if (validActions.length === 0) return null;

    const hand = player.hand;
    const community = game.communityCards;
    const phase = game.phase;
    const potSize = game.pot;
    const toCall = state.callAmount;
    const maxBet = state.currentMaxBet;
    const chips = player.chips;

    // Calculate hand strength
    let strength = 0;

    if (phase === GamePhase.PREFLOP) {
      strength = AIPlayer.preflopStrength(hand);
    } else {
      strength = AIPlayer.postflopStrength(hand, community);
    }

    // Add some randomness for unpredictability
    strength += (Math.random() - 0.5) * 0.15;
    strength = Math.max(0, Math.min(1, strength));

    // Position bonus (later position = slight boost)
    const posFromDealer = ((player.id - game.dealerIndex + game.players.length) % game.players.length);
    const posBonus = posFromDealer / game.players.length * 0.05;
    strength += posBonus;

    // Decision logic
    if (toCall === 0 && validActions.includes('check')) {
      // No bet to call
      if (strength > 0.65 && validActions.includes('raise')) {
        return AIPlayer.makeRaise(strength, game, player);
      }
      // Occasional bluff bet
      if (Math.random() < 0.12 && validActions.includes('raise')) {
        return AIPlayer.makeRaise(0.4, game, player);
      }
      return { action: 'check' };
    }

    // Facing a bet
    const potOdds = toCall / (potSize + toCall);

    if (strength > 0.8 && validActions.includes('raise') && chips > toCall) {
      // Strong hand — raise
      return AIPlayer.makeRaise(strength, game, player);
    }

    if (strength > potOdds + 0.05 || strength > 0.45) {
      if (validActions.includes('call')) {
        // Occasionally re-raise with good hands
        if (strength > 0.7 && Math.random() < 0.3 && validActions.includes('raise')) {
          return AIPlayer.makeRaise(strength, game, player);
        }
        return { action: 'call' };
      }
    }

    // Bluff occasionally
    if (Math.random() < 0.08 && validActions.includes('raise') && toCall < potSize * 0.3) {
      return AIPlayer.makeRaise(0.5, game, player);
    }

    // Marginal hand — call sometimes
    if (strength > 0.3 && toCall <= game.bigBlind * 3 && validActions.includes('call')) {
      return { action: 'call' };
    }

    return { action: 'fold' };
  }

  static makeRaise(strength, game, player) {
    const pot = game.pot;
    const minRaise = game.minRaiseAmount();
    const maxBet = game.currentMaxBet();
    const chips = player.chips;

    let raiseTotal;

    if (strength > 0.9 || Math.random() < 0.08) {
      // All-in with very strong hands or occasional bluff
      raiseTotal = player.bet + chips;
    } else if (strength > 0.75) {
      // Pot-sized raise
      raiseTotal = maxBet + pot;
    } else if (strength > 0.6) {
      // Half-pot raise
      raiseTotal = maxBet + Math.floor(pot / 2);
    } else {
      // Min raise
      raiseTotal = maxBet + game.minRaise;
    }

    // Ensure minimum
    const minTotal = maxBet + game.minRaise;
    raiseTotal = Math.max(raiseTotal, minTotal);
    // Cap at all-in
    raiseTotal = Math.min(raiseTotal, player.bet + chips);

    return { action: 'raise', amount: raiseTotal };
  }

  static preflopStrength(hand) {
    const r1 = rankVal(hand[0].rank);
    const r2 = rankVal(hand[1].rank);
    const suited = hand[0].suit === hand[1].suit;
    const high = Math.max(r1, r2);
    const low = Math.min(r1, r2);
    const gap = high - low;
    const pair = r1 === r2;

    let strength = 0;

    if (pair) {
      // Pairs: AA=1.0, KK=0.95, ... 22=0.5
      strength = 0.5 + (high / 12) * 0.5;
    } else {
      // High card value
      strength = (high + low) / 24 * 0.6;
      // Suited bonus
      if (suited) strength += 0.06;
      // Connected bonus
      if (gap === 1) strength += 0.04;
      else if (gap === 2) strength += 0.02;
      // Big gap penalty
      if (gap > 4) strength -= 0.05;
    }

    // Premium hands boost
    if (pair && high >= 10) strength = Math.max(strength, 0.85); // TT+
    if (high === 12 && low >= 9) strength = Math.max(strength, 0.75); // AJ+
    if (high === 12 && low === 11) strength = Math.max(strength, 0.8); // AK

    return Math.max(0, Math.min(1, strength));
  }

  static postflopStrength(hand, community) {
    const allCards = [...hand, ...community];
    const result = HandEvaluator.evaluate(allCards);

    // Map hand rank to a 0-1 strength
    const baseStrengths = {
      [HandRank.HIGH_CARD]: 0.15,
      [HandRank.PAIR]: 0.35,
      [HandRank.TWO_PAIR]: 0.55,
      [HandRank.THREE_OF_A_KIND]: 0.7,
      [HandRank.STRAIGHT]: 0.78,
      [HandRank.FLUSH]: 0.83,
      [HandRank.FULL_HOUSE]: 0.9,
      [HandRank.FOUR_OF_A_KIND]: 0.96,
      [HandRank.STRAIGHT_FLUSH]: 0.98,
      [HandRank.ROYAL_FLUSH]: 1.0,
    };

    let strength = baseStrengths[result.rank] || 0.1;

    // Bonus for using hole cards (not just board pairs)
    const holeRanks = hand.map(c => c.rank);
    if (result.rank === HandRank.PAIR) {
      const boardRanks = community.map(c => c.rank);
      const pairOnBoard = boardRanks.some(r => boardRanks.filter(x => x === r).length >= 2);
      if (pairOnBoard && !holeRanks.some(r => boardRanks.includes(r))) {
        strength -= 0.1; // Board pair, we don't connect
      }
      // Top pair bonus
      if (holeRanks.some(r => rankVal(r) >= rankVal(boardRanks.sort((a, b) => rankVal(b) - rankVal(a))[0]))) {
        strength += 0.08;
      }
    }

    // Draw potential (flush/straight draws)
    if (result.rank < HandRank.STRAIGHT && community.length < 5) {
      const suitCounts = {};
      for (const c of allCards) {
        suitCounts[c.suit] = (suitCounts[c.suit] || 0) + 1;
      }
      if (Object.values(suitCounts).some(c => c === 4)) strength += 0.1; // Flush draw

      // Straight draw (simplified check)
      const uniqueRanks = [...new Set(allCards.map(c => rankVal(c.rank)))].sort((a, b) => a - b);
      for (let i = 0; i < uniqueRanks.length - 3; i++) {
        if (uniqueRanks[i + 3] - uniqueRanks[i] <= 4) {
          strength += 0.06; // Open-ended or gutshot
          break;
        }
      }
    }

    return Math.max(0, Math.min(1, strength));
  }
}
