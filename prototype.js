/**
 * Swap two elements of this array.
 * @param {number} i 
 * @param {number} j 
 */
Array.prototype.swap = function(i, j) {
  [this[i], this[j]] = [this[j], this[i]];
};
