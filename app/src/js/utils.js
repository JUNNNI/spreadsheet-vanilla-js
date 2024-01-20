/**
 * Creates a memoized version of a function.
 *
 * @param {Function} fn - The function to be memoized.
 *
 * @returns {Function} A memoized version of the input function.
 */
const memoized = (fn) => {
    const cache = {};

    /**
     * @type {MemoizedFunction}
     * @param {...any} args - Arguments to be passed to the original function.
     * @returns {*} Result of the original function or a memoized result if available.
     */
    return (...args) => {
        const key = JSON.stringify(args);

        if (cache[key]) {
            return cache[key];
        }

        const result = fn(...args);
        cache[key] = result;

        return result;
    };
};

/**
 * Get the column label based on the given index.
 * ex: 1 -> A, 2 -> B, 26 -> Z, 27 -> AA, 28 -> AB...
 * The result is memoized for every index.
 *
 * @param {number} index
 *
 * @returns {string}
 */
const getColumnLabel = memoized((index) => {
    let modulo;
    let columnName = '';
    let dividend = index;

    while (dividend > 0) {
        modulo = (dividend - 1) % 26;
        columnName = String.fromCharCode(65 + modulo) + columnName;
        dividend = parseInt((dividend - modulo) / 26);
    }

    return columnName;
});

/**
 * Creates a debounced version of a function.
 *
 * @param {Function} fn - The function to be debounced.
 * @param {number} delay - The delay in _milliseconds_.
 *
 * @returns {Function} A debounced version of the input function.
 */
const debounce = (fn, delay) => {
    let timeoutId;

    return function () {
        const context = this;
        const args = arguments;

        clearTimeout(timeoutId);

        timeoutId = setTimeout(function () {
            fn.apply(context, args);
        }, delay);
    };
};
