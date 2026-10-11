/**
 * The named stars of the about page's sky — topics from everywhere — and
 * the links between them that form a web across it. Each link is a real
 * connection between fields: attention is what AlphaFold folds proteins
 * with, Keynes wrote Bretton Woods, the press carried the Reformation.
 */

/** Named stars in the sky behind the page — topics, from everywhere. */
export const SKY_TOPICS = [
  'Graph theory', //            0
  'Evolution', //               1
  'The Silk Road', //           2
  'Plate tectonics', //         3
  'Attention mechanisms', //    4
  'The French Revolution', //   5
  'Bayesian inference', //      6
  'Photosynthesis', //          7
  'Game theory', //             8
  'Keynesian economics', //     9
  'Quantum entanglement', //    10
  'Byzantine fault tolerance', // 11
  'The printing press', //      12
  'Protein folding', //         13
  'Stoicism', //                14
  'Black holes', //             15
  'The expanding universe', //  16
  'Vaccines', //                17
  'The Reformation', //         18
];

/**
 * How those topics connect — the web that forms across the sky as the page
 * is scrolled, in the order it forms. Each is a real link between fields:
 * attention is what AlphaFold folds proteins with, Keynes wrote Bretton
 * Woods, the press carried the Reformation, entanglement is half of the
 * black-hole information problem.
 */
export const SKY_LINKS: [number, number][] = [
  [12, 18], [15, 16], [4, 13], [8, 9], [13, 17], [0, 8],
  [10, 15], [6, 4], [17, 1], [8, 11], [2, 12], [18, 5],
  [1, 7], [16, 6], [0, 11], [7, 3], [14, 5], [10, 6],
];
