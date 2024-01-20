'use strict';

let DEBUG_MODE = true;

const ERROR_MESSAGES = {
    cyclic: '#ERROR CYCLIC',
    invalidFormula: '#INVALID FORMULA',
};

const useSpreadsheet = () => {
    const cellValues = {};
    const dependenciesOf = {};

    const formats = ['bold', 'italic', 'strike', 'underline'];

    let cursor = {
        ref: 'A1',
        columnLabel: 'A',
        col: '1',
        row: '1',
    };

    const getCursor = () => cursor;

    const setCursor = (config) => {
        cursor = {
            ...cursor,
            ...config,
        };
    };

    /**
     * Visible area of the spreadsheet.
     * Used to optimize the rendering of the spreadsheet.
     */
    const region = {
        startX: 0,
        endX: 0,
        startY: 0,
        endY: 0,
    };

    const getRegion = () => region;

    const setRegion = (config) => {
        const { startX, endX, startY, endY } = { ...region, ...config };

        region.startX = startX;
        region.endX = endX;
        region.startY = startY;
        region.endY = endY;

        return region;
    };

    /**
     * Verify if the given value is a formula.
     *
     * @param {string} value
     * @returns boolean
     */
    const isFormula = (value) => value.startsWith('=');

    /**
     * Verify if the given value is a valid formula.
     * @see examples https://regex101.com/r/U7vY7L/1
     *
     * @param {string} formula
     * @returns boolean
     */
    const isValidFormula = (formula) => {
        const regex =
            /^=([A-Za-z]\d*|\d+(\.\d+)?|\([^)]+\))(?:[+\-*\/]([A-Za-z]\d*|\d+(\.\d+)?|\([^)]+\)))*$/;
        return regex.test(formula);
    };

    /**
     * Verifiy that the given value for a cell is a number.
     * If it's not, we'll use 0 for calculations.
     * @see examples https://regex101.com/r/hNE2er/1
     *
     * @param {string} value
     *
     * @returns {number}
     */
    const isNumber = (value) => {
        if (/^(\d+(\.\d*)?|\.\d+)(?<!\.)$/.test(value)) {
            return true;
        }

        return false;
    };

    /**
     * Extracts the cell references from a formula.
     *
     * @param {string} formula
     * @returns {string[]}
     */
    const extractReferences = (formula) => {
        const matches = formula.match(/[A-Z]+\d+/gi) || [];
        return matches.map((match) => match.toUpperCase());
    };

    /**
     * Extracts tokens from a formula (numbers, operators, cell references).
     *
     * @param {string} formula
     * @returns {string[]}
     */
    const extractTokens = (formula) =>
        formula.match(/([A-Za-z]+\d*|\d+(\.\d+)?|[+\-*\/()])/g).map((token) => {
            if (isNumber(token)) {
                return parseFloat(token);
            }

            return token.toUpperCase();
        }) || [];

    const replaceTokensReferences = (tokens) =>
        tokens.map((token) => {
            if (cellValues[token]) {
                return cellValues[token]?.compute || 0;
            }

            return token;
        });

    const calculate = (tokens, idx = 0) => {
        const stack = [];
        let operator = '+';
        let num = 0;

        const totalTokens = tokens.length;

        for (let i = idx; i < totalTokens; i++) {
            let token = tokens[i];

            if (typeof token === 'number') {
                num = token;
            }

            // If the token is not a number, it's an operator or a parenthesis
            // or if it's the last token which means we need to calculate the expression
            if (typeof token !== 'number' || i === totalTokens - 1) {
                // If the token is an opening parenthesis '(',
                // recursively calculate the expression inside
                if (token === '(') {
                    num = calculate(tokens, i + 1);
                    let leftParenthesesCount = 1,
                        rightParenthesesCount = 0;

                    // Find the matching closing parenthesis
                    for (let j = i + 1; j < totalTokens; j++) {
                        if (tokens[j] === ')') {
                            rightParenthesesCount++;
                            if (rightParenthesesCount === leftParenthesesCount) {
                                i = j;
                                break;
                            }
                        } else if (tokens[j] === '(') leftParenthesesCount++;
                    }
                }

                let previousValue = -1;

                switch (operator) {
                    case '+':
                        stack.push(num);
                        break;
                    case '-':
                        stack.push(num * -1);
                        break;
                    case '*':
                        previousValue = stack.pop();
                        stack.push(previousValue * num);
                        break;
                    case '/':
                        previousValue = stack.pop();
                        stack.push(previousValue / num);
                        break;
                }

                operator = token;
                num = 0;

                if (token === ')') break;
            }
        }

        // Calculate the final result by summing up the values in the stack
        let result = 0;
        while (stack.length > 0) {
            result += stack.pop();
        }

        return result;
    };

    /**
     * Add or remove the current cell reference as a dependency of other cells.
     *
     * @param {string} reference
     * @param {string[]} prevDeps
     * @param {string[]} newDeps
     *
     * @returns {{ depsToRemove: string[], depsToAdd: string[] }}
     */
    const updateDependenciesOf = (reference, prevDeps, newDeps) => {
        // Remove cell reference from dependencies of other cells.
        const depsToRemove = prevDeps.filter((x) => !newDeps.includes(x));
        depsToRemove.forEach((ref) => {
            const depsOfRef = dependenciesOf[ref];
            if (depsOfRef) {
                dependenciesOf[ref] = depsOfRef.filter((x) => x !== reference);
            }
        });

        // Add cell reference as a dependency of other cells.
        const depsToAdd = newDeps.filter((x) => !prevDeps.includes(x));
        depsToAdd.forEach((ref) => {
            dependenciesOf[ref] = [...(dependenciesOf[ref] || []), reference];
        });

        return { depsToRemove, depsToAdd };
    };

    /**
     * Recalculate the value of the cells that depend on the given reference.
     *
     * @param {string} reference
     */
    const recalculateDependencies = (reference) => {
        const dependenciesOfReference = dependenciesOf[reference];

        if (dependenciesOfReference) {
            dependenciesOfReference.forEach((dependentReference) => {
                setCellValue(dependentReference);
            });
        }
    };

    /**
     * Based on the current region, we find the visible cells references.
     * The result is memoized until the region changes.
     */
    const getVisibleCells = memoized((region) => {
        const { startX, endX, startY, endY } = region;

        const references = [];
        for (let row = startY; row <= endY; row++) {
            if (row === 0) continue;

            for (let col = startX; col <= endX; col++) {
                if (col === 0) continue;
                references.push(`${getColumnLabel(col)}${row}`);
            }
        }

        return references;
    });

    /**
     * Apply the value of a cell into the DOM.
     *
     * @param {string} reference
     */
    const applyCellDOM = (reference, isBatchUpdate) => {
        const cellElement = document.querySelector(`[data-reference="${reference}"]`);
        if (!cellElement) {
            return;
        }

        let newText = '';
        const cell = getCell(reference);

        if (cell) {
            const { raw, compute, isExpression, format = {}, errors = {} } = cell;

            newText = isExpression ? compute : raw;

            // Apply Formats
            Object.keys(format).forEach((type) => {
                cellElement.classList.toggle(type, format[type]);

                if (!isBatchUpdate) {
                    const btnFormatEl = document.querySelector(`#${type}`);
                    btnFormatEl.classList.toggle('active', format[type]);
                }
            });

            // Apply Errors
            if (errors['cyclic'] || errors['invalidFormula']) {
                cellElement.classList.add('error');
                newText = errors['cyclic'] ? ERROR_MESSAGES.cyclic : ERROR_MESSAGES.invalidFormula;
            } else {
                cellElement.classList.remove('error');
            }

            cellElement.textContent = newText;
        } else {
            // Clear the cell value.
            cellElement.classList.remove('error');
        }

        cellElement.textContent = newText;

        // Apply to the top bar
        const { ref } = getCursor(); // We need to verify if the cursor is still on the same cell.
        if (spsInputEl.value !== newText && !isBatchUpdate && ref === reference) {
            spsInputEl.value = cell?.raw || '';
        }

        if (DEBUG_MODE) {
            cellElement.classList.add('debug-tracking');
            // Won't affect performances here as it will
            // be placed in the Event Queue before being executed.
            setTimeout(() => {
                cellElement.classList.remove('debug-tracking');
            }, 500);
        }
    };

    /**
     * Refresh DOM and the Entire spreadsheet but Only for the visible cells.
     * For each references registered (cellValues), we check if it's visible in the screen.
     * If it is, we refresh the value in the DOM.
     */
    const refreshRegionDOM = () => {
        const region = getRegion();

        // Generate the range of references to check.
        const references = getVisibleCells(region);

        const registeredCells = Object.keys(cellValues);
        const cellsToRefresh = references.filter((x) => registeredCells.includes(x));

        cellsToRefresh.forEach((reference) => {
            applyCellDOM(reference, true);
        });
    };

    /**
     * For a given reference, refresh a cell value if it's visible in the screen.
     *
     * @param {string} reference
     */
    const refreshCellDOM = (reference) => {
        const region = getRegion();

        const referencesVisible = getVisibleCells(region);

        if (!referencesVisible.includes(reference)) {
            return;
        }

        applyCellDOM(reference);
    };

    /**
     * Clear the value of a cell.
     *
     * @param {string} reference
     */
    const clearCellValue = (reference) => {
        const prevDependencies = cellValues?.[reference]?.dependencies;

        if (!prevDependencies) {
            return;
        }

        updateDependenciesOf(reference, prevDependencies, []);
        delete cellValues[reference];
        recalculateDependencies(reference);

        refreshCellDOM(reference);
    };

    /**
     * Recalculate the value of a cell.
     *
     * @param {string} reference
     * @param {string} insertValue
     */
    const setCellValue = (reference, insertValue) => {
        if (insertValue === cellValues?.[reference]?.raw) {
            return;
        }

        if (insertValue === '') {
            clearCellValue(reference);
            return;
        }

        const value = insertValue ? insertValue.trim() : cellValues?.[reference]?.raw;
        const isExpression = isFormula(value);

        let compute = 0;
        let errors = {
            cyclic: false,
            invalidFormula: false,
        };

        if (isExpression) {
            if (!isValidFormula(value)) {
                errors.invalidFormula = true;
            } else {
                const tokens = extractTokens(value);
                const tokensWithValues = replaceTokensReferences(tokens);

                compute = calculate(tokensWithValues);
            }
        } else {
            compute = isNumber(value) ? parseFloat(value) : 0;
        }

        const prevDependencies = cellValues?.[reference]?.dependencies || [];
        const dependencies = isExpression ? extractReferences(value) : [];

        cellValues[reference] = {
            ...cellValues[reference],
            raw: value,
            compute,
            dependencies,
            isExpression,
            errors,
            format: {
                ...cellValues?.[reference]?.format,
            },
        };

        updateDependenciesOf(reference, prevDependencies, dependencies);
        recalculateDependencies(reference);

        refreshCellDOM(reference);
    };

    const getCell = (reference) => cellValues?.[reference];

    /**
     * Format a cell and refresh it in the DOM.
     * Note: Formatting should be apply if the cell is empty.
     *
     * @param {'bold' | 'italic' | 'strike' | 'underline'} type
     * @param {string} reference
     */
    const onFormat = (type, reference) => {
        if (!formats.includes(type)) {
            return;
        }

        const cell = getCell(reference);

        const previousFormatType = cell?.format?.[type];
        const newFormatType = previousFormatType ? !previousFormatType : true;

        cellValues[reference] = {
            ...cellValues[reference],
            format: {
                ...(cell?.format || {}),
                [type]: newFormatType,
            },
        };

        refreshCellDOM(reference);
    };

    return {
        getCell,
        setCellValue,
        getRegion,
        setRegion,
        onFormat,
        refreshRegionDOM,
        getCursor,
        setCursor,
    };
};
