import assert from 'node:assert/strict';

export async function testBrilliance(harnessPage) {
  const result = await harnessPage.evaluate(async () => {
    const { Chess } = await import('/node_modules/.vite/deps/chess__js.js');
    const { brilliantSacrifice, isSacrificeCandidate } = await import('/src/brilliance.ts');
    const { analyzedNode, classifyMove } = await import('/src/analysis.ts');
    const check = (condition, message) => { if (!condition) throw Error(message); };
    const nodeFor = (fen, san) => {
      const chess = new Chess(fen);
      return { id: san, move: chess.move(san), classification: 'none', score: null, parentId: null, childrenIds: [] };
    };
    // Synthetic scores exercise the label's rules, not an assertion about the
    // objective strength of this position. Every proof move is checked legally.
    const node = nodeFor('rnbq1rk1/ppp2ppp/3bpn2/3p4/3P4/2NBPN2/PPP2PPP/R1BQ1RK1 w - - 0 8', 'Bxh7+');
    const evaluate = (fen, data = {}) => ({ fen, cp: 100, depth: 18, finished: true, ...data });
    const before = evaluate(node.move.before, { bestMove: node.move.lan });
    const after = evaluate(node.move.after, { cp: 90 });
    const played = evaluate(node.move.before, { cp: 90, bestMove: node.move.lan,
      searchMoves: [node.move.lan], pvLine: ['d3h7', 'g8h7', 'f3g5'] });
    check(isSacrificeCandidate(node.move), 'Legal bishop offer was not sent for verification');
    const evidence = brilliantSacrifice(node.move, before, after, played);
    check(evidence?.piece === 'b' && evidence.materialDropCp === 230 && evidence.line.length === 3,
      'Legal accepted bishop sacrifice did not retain a material proof');
    check(classifyMove(node, before, after, [], played) === 'brilliant', 'Best-move fast path swallowed brilliant label');

    const alternativeMoves = new Chess(node.move.before).moves({ verbose: true }).map(move => move.lan).filter(lan => lan !== node.move.lan);
    const alternative = evaluate(node.move.before, { cp: 0, bestMove: 'd3e2', searchMoves: alternativeMoves });
    const mateBefore = { ...before, cp: undefined, mate: 3, mateWinner: 'w' };
    const matePlayed = { ...played, cp: undefined, mate: 9, mateWinner: 'w' };
    const mateAfter = { ...after, cp: undefined, mate: 8, mateWinner: 'w' };
    check(classifyMove(node, mateBefore, mateAfter, [], matePlayed, alternative) === 'brilliant',
      'Forced mating sacrifice was mistaken for a routine already-won conversion');
    check(analyzedNode(node, mateBefore, mateAfter, [], matePlayed, alternative).alternativeEvaluation === alternative,
      'Alternative evaluation was not retained for the move explanation');
    const noAlternativeLabel = (other, message) => check(
      !brilliantSacrifice(node.move, mateBefore, mateAfter, matePlayed, other), message);
    noAlternativeLabel(undefined, 'Mate with no checked alternative bypassed the conservative guard');
    noAlternativeLabel({ ...alternative, cp: 300 }, 'An equally winning alternative earned a brilliant');
    noAlternativeLabel({ ...alternative, cp: undefined, mate: 20, mateWinner: 'w' },
      'Another winning mate without the sacrifice earned a brilliant');
    noAlternativeLabel({ ...alternative, fen: node.move.after }, 'Stale alternative earned a brilliant');
    noAlternativeLabel({ ...alternative, depth: 15 }, 'Shallow alternative earned a brilliant');
    noAlternativeLabel({ ...alternative, finished: false }, 'Unfinished alternative earned a brilliant');
    noAlternativeLabel({ ...alternative, searchMoves: [node.move.lan, 'd3e2'] },
      'Alternative search containing the sacrifice earned a brilliant');
    noAlternativeLabel({ ...alternative, searchMoves: [] }, 'Empty alternative search earned a brilliant');
    noAlternativeLabel({ ...alternative, searchMoves: ['d3e2'] }, 'One weak alternative pretended to represent all other moves');
    noAlternativeLabel({ ...alternative, searchMoves: undefined }, 'Unrestricted alternative earned a brilliant');

    const noLabel = (root, position, candidate, message) =>
      check(!brilliantSacrifice(node.move, root, position, candidate), message);
    noLabel(before, after, undefined, 'Unrestricted search was sufficient to invent a brilliant');
    noLabel(before, after, { ...played, searchMoves: undefined }, 'Missing explicit same-root scope was accepted');
    noLabel({ ...before, searchMoves: [node.move.lan] }, after, played, 'Restricted baseline pretended to be an unrestricted best search');
    noLabel(before, after, { ...played, depth: 15 }, 'Shallow search earned a brilliant');
    noLabel({ ...before, cp: 300 }, after, played, 'Already-won conversion earned a brilliant');
    noLabel(before, { ...after, cp: -100 }, played, 'Losing resulting board earned a brilliant');
    noLabel(before, after, { ...played, cp: 50 }, 'Sacrifice losing over 25cp earned a brilliant');
    noLabel(before, after, { ...played, finished: false }, 'Unfinished search earned a brilliant');
    noLabel(before, after, { ...played, previous: { cp: 250, depth: 17 } }, 'Unstable score earned a brilliant');
    noLabel(before, after, { ...played, pvLine: ['d3h7', 'g8h7'] }, 'Capture without a follow-up earned a brilliant');
    noLabel(before, after, { ...played, pvLine: ['d3h7', 'g8h7', 'f3f5'] }, 'Illegal proof line earned a brilliant');
    noLabel(before, after, { ...played, pvLine: ['d3h7', 'g8h8', 'f3g5'] }, 'Declined offer was reported as proven');
    noLabel({ ...before, fen: node.move.after }, after, played, 'Stale root earned a brilliant');

    const trade = nodeFor('4k3/8/4p3/3q4/8/8/8/3QK3 w - - 0 1', 'Qxd5');
    const tradeBefore = evaluate(trade.move.before, { bestMove: trade.move.lan });
    const tradeAfter = evaluate(trade.move.after);
    const tradePlayed = evaluate(trade.move.before, { bestMove: trade.move.lan, searchMoves: [trade.move.lan],
      pvLine: ['d1d5', 'e6d5', 'e1e2'] });
    check(!isSacrificeCandidate(trade.move) && !brilliantSacrifice(trade.move, tradeBefore, tradeAfter, tradePlayed),
      'Ordinary queen exchange was treated as a sacrifice');
    const pawn = nodeFor('4k3/8/8/3p4/8/4P3/8/4K3 w - - 0 1', 'e4');
    check(!isSacrificeCandidate(pawn.move), 'Routine pawn offer triggered expensive brilliant verification');

    // Mirror color and coordinates to verify white-perspective engine scores.
    const mirror = fen => {
      const [position, turn] = fen.split(' ');
      return `${position.split('/').reverse().map(rank => [...rank].map(piece => /[a-z]/.test(piece)
        ? piece.toUpperCase() : /[A-Z]/.test(piece) ? piece.toLowerCase() : piece).join('')).join('/')} ${turn === 'w' ? 'b' : 'w'} - - 0 8`;
    };
    const black = nodeFor(mirror(node.move.before), 'Bxh2+');
    const blackBefore = evaluate(black.move.before, { cp: -100, bestMove: black.move.lan });
    const blackAfter = evaluate(black.move.after, { cp: -90 });
    const blackPlayed = evaluate(black.move.before, { cp: -90, bestMove: black.move.lan,
      searchMoves: [black.move.lan], pvLine: ['d6h2', 'g1h2', 'f6g4'] });
    check(classifyMove(black, blackBefore, blackAfter, [], blackPlayed) === 'brilliant',
      'Black bishop sacrifice lost its score perspective');
    const blackAlternative = evaluate(black.move.before, { cp: 0, bestMove: 'd6e7', searchMoves:
      new Chess(black.move.before).moves({ verbose: true }).map(move => move.lan).filter(lan => lan !== black.move.lan) });
    check(classifyMove(black,
      { ...blackBefore, cp: undefined, mate: -3, mateWinner: 'b' },
      { ...blackAfter, cp: undefined, mate: -8, mateWinner: 'b' }, [],
      { ...blackPlayed, cp: undefined, mate: -9, mateWinner: 'b' }, blackAlternative) === 'brilliant',
    'Black forced mating sacrifice lost its alternative-score perspective');
    return true;
  });
  assert.equal(result, true);
  return ['Brilliant labels require a deep, legal accepted piece sacrifice for either color; shallow, losing, unstable, illegal and ordinary exchanges are excluded'];
}
