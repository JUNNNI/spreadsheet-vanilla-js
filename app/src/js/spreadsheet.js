'use strict';

const Spreadsheet = ({
    rowHeight = 25,
    numberOfRows = 10000,
    numberOfColumns = 10000,
    columnWidth = 120,
    firstColumnWidth = 45,
    rowsRenderedAhead = 5,
    cellsRenderedAhead = 5,
    rowOutput = (cells) => cells,
    cellOutput = (data) => data,
} = {}) => {
    const { getCell, setCellValue, setRegion, refreshRegionDOM, onFormat, getCursor, setCursor } =
        useSpreadsheet();

    spsVScrollViewportEl.style.height = `${numberOfRows * rowHeight}px`;
    spsVScrollViewportEl.style.width = `${numberOfColumns * columnWidth + firstColumnWidth}px`;
    spsContainerEl.style.height = `${window.innerHeight - spsHeaderEl.offsetHeight}px`;

    const totalRowsVisible = Math.ceil(spsContainerEl.offsetHeight / rowHeight);
    const totalRowsToRender = totalRowsVisible + rowsRenderedAhead;

    const totalCellsVisible = Math.ceil(
        (spsContainerEl.offsetWidth - firstColumnWidth) / columnWidth,
    );
    const totalCellsToRender = totalCellsVisible + cellsRenderedAhead;

    setRegion({
        endX: totalCellsVisible,
        endY: totalRowsVisible,
    });

    // Cache
    let renderedRows = {};
    let renderedCells = {};

    /**
     * Render a cell.
     *
     * @param {number} col
     * @param {number} row
     * @returns {string} HTML output for the cell
     */
    const renderCell = (col, row) => {
        const columnLabel = getColumnLabel(col);
        const reference = row === 0 ? columnLabel : `${columnLabel}${row}`;
        const isLabelCell = row === 0 || col === 0;
        const width = col === 0 ? firstColumnWidth : columnWidth;

        const classList = ['sps-cell'];

        const { ref: currentRef, columnLabel: currentCol, row: currentRow } = getCursor();

        if (isLabelCell) {
            classList.push(
                'sps-cell-label',
                (columnLabel === currentCol || row == currentRow) && 'selected',
            );
        } else {
            classList.push('sps-cell-reference');
        }

        if (reference === currentRef) {
            classList.push('focus');
        }

        let data = reference;
        if (!isLabelCell) {
            const cell = getCell(reference);
            data = cell?.isExpression ? cell.compute : cell?.raw || '';

            if (cell?.errors?.cyclic) {
                data = ERROR_MESSAGES.cyclic;
                classList.push('error');
            }

            if (cell?.errors?.invalidFormula) {
                data = ERROR_MESSAGES.invalidFormula;
                classList.push('error');
            }
        }

        const className = classList.join(' ');

        renderedCells[reference] = true;

        return `
            <div class="${className}" style="width: ${width}px;" data-column="${columnLabel}" data-row="${row}"  data-index="${col}" data-reference="${reference}">
               ${cellOutput(data)}
            </div>
        `;
    };

    /**
     * Render a row with its cells.
     *
     * @param {number} row
     * @param {number} startCol
     * @param {number} lastCol
     *
     * @returns {string} HTML output for the row
     */
    const renderRow = (row, startCol, lastCol = totalCellsToRender) => {
        let cells = '';
        for (let col = startCol; col <= lastCol; col++) {
            cells += renderCell(col, row);
        }

        return `
            <div class="sps-row" style="height: ${rowHeight}px;" data-key="${row}">
                ${rowOutput(cells)}
            </div>
        `;
    };

    /**
     * Insert a row in the DOM at the top or bottom of the table.
     *
     * @param {number} row
     * @param {string} scrollDirection
     */
    const insertRow = (row, scrollDirection, startCol, lastCol) => {
        if (renderedRows[row]) {
            return;
        }

        spsTableEl.insertAdjacentHTML(
            scrollDirection === 'up' ? 'afterbegin' : 'beforeend',
            renderRow(row, startCol, lastCol),
        );
        renderedRows[row] =
            scrollDirection === 'up' ? spsTableEl.firstElementChild : spsTableEl.lastElementChild;
    };

    /**
     * Remove rows that are no longer visible.
     * Happens when the user scrolls vertically.
     *
     * @param {number} startRow
     * @param {number} lastRow
     */
    const clearUnusedRows = (startRow, lastRow) => {
        Object.keys(renderedRows).forEach((rowIndex) => {
            if (rowIndex < startRow || rowIndex > lastRow) {
                spsTableEl.querySelector(`[data-key="${rowIndex}"]`).remove();
                delete renderedRows[rowIndex];
            }
        });
    };

    /**
     * Render the rows that are visible in the viewport and remove the ones that are no longer.
     * Depending on the scroll direction, the rows are inserted at the top or bottom of the table.
     *
     * This function is called when the user scrolls vertically.
     *
     * @param {number} startRow
     * @param {number} lastRow
     * @param {number} startCol
     * @param {number} lastCol
     * @param {'down' | 'up'} scrollDirection
     */
    const renderVisibleRows = ({ startRow, lastRow, scrollDirectionY, startCol, lastCol }) => {
        const rowIncrement = scrollDirectionY === 'down' ? 1 : -1;
        const start = scrollDirectionY === 'down' ? startRow : lastRow;
        const condition = (rowIndex) =>
            scrollDirectionY === 'down' ? rowIndex <= lastRow : rowIndex >= startRow;

        for (let rowIndex = start; condition(rowIndex); rowIndex += rowIncrement) {
            insertRow(rowIndex, scrollDirectionY, startCol, lastCol);
        }

        clearUnusedRows(startRow, lastRow);
    };

    /**
     * Clear cells that are no longer visible.
     * Happens when the user scrolls horizontally.
     *
     * @param {number} startCol
     * @param {number} lastCol
     */
    const clearUnusedCells = (startCol, lastCol) => {
        Object.keys(renderedRows).forEach((rowIndex) => {
            const rowElement = renderedRows[rowIndex];
            const cells = rowElement.querySelectorAll('.sps-cell');

            cells.forEach((cell) => {
                const cellIndex = cell.getAttribute('data-index');

                if (cellIndex < startCol || cellIndex > lastCol) {
                    cell.remove();

                    const reference = cell.getAttribute('data-reference');
                    delete renderedCells[reference];
                }
            });
        });
    };

    /**
     * Insert a cell in the DOM at the left or right of the row.
     *
     * @param {number} col
     * @param {number} row
     * @param {number} scrollDirectionX
     */
    const insertCell = (col, row, scrollDirectionX) => {
        const columnLabel = getColumnLabel(col);
        const reference = row === 0 ? columnLabel : `${columnLabel}${row}`;

        if (renderedCells[reference]) {
            return;
        }

        const rowElement = renderedRows[row];
        rowElement.insertAdjacentHTML(
            scrollDirectionX === 'left' ? 'afterbegin' : 'beforeend',
            renderCell(col, row),
        );
    };

    /**
     * Render the cells that are visible in the viewport and remove the ones that are no longer.
     * Depending on the scroll direction, the cells are inserted at the left or right of the table.
     *
     * This function is called when the user scrolls horizontally.
     *
     * @param {number} startRow
     * @param {number} lastRow
     * @param {number} startCol
     * @param {number} lastCol
     * @param {'left' | 'right'} scrollDirection
     */
    const renderVisibleCells = ({ startRow, lastRow, startCol, lastCol, scrollDirectionX }) => {
        const colIncrement = scrollDirectionX === 'right' ? 1 : -1;
        const start = scrollDirectionX === 'right' ? startCol : lastCol;
        const condition = (col) =>
            scrollDirectionX === 'right' ? col <= lastCol : col >= startCol;

        for (let row = startRow; row <= lastRow; row++) {
            for (let col = start; condition(col); col += colIncrement) {
                insertCell(col, row, scrollDirectionX);
            }
        }

        clearUnusedCells(startCol, lastCol);
    };

    /**
     * Updates the current reference in the header.
     * Insert the formula/text in the input.
     *
     * @param {Element} cellElement
     */
    const updateTopBarFormula = (cellElement) => {
        const ref = cellElement.getAttribute('data-reference');
        const row = cellElement.getAttribute('data-row');
        const col = cellElement.getAttribute('data-index');
        const columnLabel = cellElement.getAttribute('data-column');

        const cell = getCell(ref);

        spsCurrentRefEl.textContent = ref; // Update the current reference in the header
        spsInputEl.value = cell?.raw ?? ''; // Insert the formula/text in the input

        if (cell) {
            const { format = {} } = cell;

            Object.keys(format).forEach((type) => {
                const btnFormatEl = spsHeaderEl.querySelector(`#${type}`);
                btnFormatEl.classList.toggle('active', format[type]);
            });
        } else {
            spsHeaderEl.querySelectorAll('.btn-format.active').forEach((el) => {
                el.classList.remove('active');
            });
        }

        setCursor({
            ref,
            columnLabel,
            row,
            col,
        });
    };

    /**
     * LISTENERS
     * =================================================================================
     */

    let lastScrollTop = 0;
    let lastScrollLeft = 0;

    let lastTranslateX = 0;
    let lastTranslateY = 0;

    let isEditing = false; // True when the user is editing a cell (input via double click)
    let isFocusingTopInput = false;

    /**
     * Refreshes the list of rendered rows based on the current scroll position.
     *
     * @param {Event} event
     *
     * @returns void
     */
    const onScroll = (event) => {
        requestAnimationFrame(() => {
            const scrollTop = event.target.scrollTop;
            const scrollLeft = event.target.scrollLeft;

            const startRow = Math.floor(scrollTop / rowHeight);
            const lastRow = Math.min(numberOfRows, startRow + totalRowsToRender);

            const startCol = Math.floor(scrollLeft / columnWidth);
            const lastCol = Math.min(numberOfColumns, startCol + totalCellsToRender);

            const scrollDirectionY = scrollTop > lastScrollTop ? 'down' : 'up';
            const scrollDirectionX = scrollLeft > lastScrollLeft ? 'right' : 'left';

            const vScrollConfig = {
                startRow,
                lastRow,
                startCol,
                lastCol,
                scrollDirectionY,
                scrollDirectionX,
            };

            const borderSize = 1;

            // Horizontal scroll
            if (scrollTop === lastScrollTop) {
                lastTranslateX =
                    scrollDirectionX === 'right'
                        ? startCol * columnWidth - columnWidth + firstColumnWidth - borderSize
                        : startCol * columnWidth;

                renderVisibleCells(vScrollConfig);
            } else {
                lastTranslateY =
                    scrollDirectionY === 'down'
                        ? startRow * rowHeight - rowHeight - borderSize
                        : startRow * rowHeight;

                renderVisibleRows(vScrollConfig);
            }

            spsTableEl.style.transform = `translate(${lastTranslateX}px, ${lastTranslateY}px)`;

            lastScrollTop = scrollTop;
            lastScrollLeft = scrollLeft;

            setRegion({
                startX: startCol,
                endX: lastCol,
                startY: startRow,
                endY: lastRow,
            });
        });
    };

    /**
     * Set focus on a cell and display its reference in the header.
     * Apply focus on cell labels (column and row).
     *
     * @param {HTMLElement} cellEl
     */
    const onFocusCell = (cellEl) => {
        const focusedCell = spsTableEl.querySelector('.focus');
        if (focusedCell) {
            focusedCell.classList.remove('focus');
        }

        cellEl.classList.add('focus');

        // Remove focus from header cells (column and row)
        spsTableEl
            .querySelectorAll('.sps-cell-label.selected')
            .forEach((el) => el.classList.remove('selected'));

        const currentCol = cellEl.getAttribute('data-column');
        const currentRow = cellEl.getAttribute('data-row');

        // Add focus to header cells (column and row)
        spsTableEl
            .querySelector(`.sps-cell-label[data-reference="${currentCol}"]`)
            ?.classList?.add?.('selected');
        spsTableEl
            .querySelector(`.sps-cell-label[data-reference="${currentRow}"]`)
            ?.classList?.add?.('selected');

        updateTopBarFormula(cellEl);
    };

    /**
     * Set focus on a cell and display its reference in the header
     * when the user clicks on a cell.
     *
     * @param {MouseEvent} event
     */
    const onClickCell = (event) => {
        const cellEl = event.target.closest('.sps-cell-reference');
        if (!cellEl || isFocusingTopInput) {
            return;
        }

        onFocusCell(cellEl);
    };

    /**
     * Find the next cell to focus when arrow key pressed.
     *
     * @param {'x' | 'y'} axis
     * @param {number} increment
     *
     * @returns {string} The reference of the next cell to focus
     */
    const findNextMove = (axis, increment) => {
        const { ref, columnLabel, col, row } = getCursor();

        const rowInt = parseInt(row);
        const colInt = parseInt(col);

        if (axis === 'y' && increment === -1 && rowInt === 1) {
            return ref;
        }

        if (axis === 'x' && increment === -1 && colInt === 1) {
            return ref;
        }

        return axis === 'y'
            ? `${columnLabel}${rowInt + increment}`
            : `${getColumnLabel(colInt + increment)}${row}`;
    };

    /**
     * Move the focus to the next cell based on the arrow key pressed.
     *
     * @param {Keydown} event
     */
    const onArrowMove = (event) => {
        if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
            return;
        }

        event.preventDefault();

        let newReference;
        let isPreventDefault = false;

        switch (event.key) {
            case 'ArrowDown':
                newReference = findNextMove('y', 1);
                break;
            case 'ArrowUp':
                newReference = findNextMove('y', -1);
                break;
            case 'ArrowLeft':
                newReference = findNextMove('x', -1);
                break;
            case 'ArrowRight':
                newReference = findNextMove('x', 1);
                break;
            default:
                isPreventDefault = true;
        }

        if (!isPreventDefault) {
            const cellElement = spsTableEl.querySelector(`[data-reference="${newReference}"]`);
            onFocusCell(cellElement);
        }
    };

    /**
     * Render an input in the cell to edit its content.
     * The input is removed when the user unfocuses it.
     *
     * @param {HTMLElement} cellElement
     * @param {string} value - Optionnal value to insert in the input
     */
    const renderInputCell = (cellElement, value) => {
        isEditing = true;
        const reference = cellElement.getAttribute('data-reference');

        // Create an input in the cell
        const input = document.createElement('input');
        input.className = 'sps-cell-input';
        input.value = value ? value : getCell(reference)?.raw ?? '';
        cellElement.appendChild(input);

        // Listen when the user unfocuses the input
        input.addEventListener('blur', () => {
            setCellValue(reference, input.value);
            if (cellElement.contains(input)) {
                cellElement.removeChild(input);
            }
            isEditing = false;
        });

        // Listen when the user presses enter
        input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                input.blur(); // Remove focus from the input
                event.stopPropagation();
            }
        });

        input.focus();
    };

    /**
     * Handle focus on the input in the header.
     *
     * @param {FocusEvent} event
     */
    const onTopInputFocus = (event) => {
        const { ref } = getCursor();
        isFocusingTopInput = true;

        const handleBlur = () => {
            setCellValue(ref, spsInputEl.value);

            // Remove event listeners to avoid side effects on further inputs
            spsInputEl.removeEventListener('blur', handleBlur);
            spsInputEl.removeEventListener('keydown', handleKeydown);

            isFocusingTopInput = false;

            event.stopPropagation();
        };

        const handleKeydown = (event) => {
            if (event.key === 'Enter') {
                spsInputEl.blur();
                event.stopPropagation();
            }
        };

        // Attach event listeners
        spsInputEl.addEventListener('blur', handleBlur);
        spsInputEl.addEventListener('keydown', handleKeydown);
    };

    /**
     * Handle keydown events.
     *
     * @param {keydown} event
     */
    const onPressKey = (event) => {
        if (isEditing || isFocusingTopInput) {
            return;
        }

        const { ref } = getCursor();

        if (event.key === 'Delete' || event.key === 'Backspace') {
            setCellValue(ref, '');
            return;
        }

        if (event.key === 'Enter') {
            const cellElement = spsTableEl.querySelector(`[data-reference="${ref}"]`);
            renderInputCell(cellElement);
            return;
        }

        if (!event.ctrlKey && /^[a-zA-Z0-9*./-=+]$/.test(event.key)) {
            event.preventDefault();
            const cellElement = spsTableEl.querySelector(`[data-reference="${ref}"]`);
            renderInputCell(cellElement, event.key);
            return;
        }

        onArrowMove(event);
    };

    /**
     * Display an edit input when the user double clicks on a cell.
     *
     * @param {MouseEvent} event
     */
    const onDoubleClickCell = (event) => {
        const cellElement = event.target.closest('.sps-cell-reference');
        if (!cellElement || isEditing || isFocusingTopInput) {
            return;
        }

        renderInputCell(cellElement);
    };

    const onInit = () => {
        renderVisibleRows({
            startRow: 0,
            lastRow: totalRowsToRender,
            startCol: 0,
            lastCol: totalCellsToRender,
            scrollDirectionX: 'right',
            scrollDirectionY: 'down',
        });

        spsContainerEl.addEventListener('scroll', onScroll);
        spsInputEl.addEventListener('focus', onTopInputFocus);
        spsTableEl.addEventListener('mousedown', onClickCell);
        spsTableEl.addEventListener('dblclick', onDoubleClickCell);
        document.addEventListener('keydown', onPressKey);
    };

    const onDestroy = () => {
        spsContainerEl.removeEventListener('scroll', onScroll);
        spsInputEl.removeEventListener('focus', onTopInputFocus);
        spsTableEl.removeEventListener('mousedown', onClickCell);
        spsTableEl.removeEventListener('dblclick', onDoubleClickCell);
        document.removeEventListener('keydown', onPressKey);

        // Clear cache
        renderedRows = {};
        renderedCells = {};

        spsTableEl.innerHTML = '';
    };

    onInit();

    return {
        onInit,
        onDestroy,
        onFormat,
        getCursor,
        refreshRegionDOM,
    };
};
