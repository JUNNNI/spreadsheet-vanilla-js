'use strict';

const main = () => {
    const { onFormat, refreshRegionDOM, getCursor, onDestroy, onInit } = Spreadsheet();

    spsBtnDestroy.addEventListener('click', () => {
        onDestroy();

        spsTableEl.innerHTML = `
            <div class="rebuild">Table destroyed, rebuilding in <span id="countdown">3</span> seconds...</div>
        `;
        document.body.classList.add('destroyed');

        let secondsLeft = 3;

        const countdownElement = document.getElementById('countdown');
        const countdownInterval = setInterval(() => {
            secondsLeft--;
            countdownElement.textContent = secondsLeft;

            if (secondsLeft === 0) {
                clearInterval(countdownInterval);
                spsTableEl.innerHTML = '';
                document.body.classList.remove('destroyed');
                onInit();
            }
        }, 1000);
    });

    spsBtnRedraw.addEventListener('click', () => {
        refreshRegionDOM();
    });

    spsBtnDebug.addEventListener('click', () => {
        DEBUG_MODE = !DEBUG_MODE;

        spsBtnDebug.textContent = `Tracking ${DEBUG_MODE ? 'ON' : 'OFF'}`;
        spsBtnDebug.classList.toggle('active');
    });

    document.querySelectorAll('.btn-format').forEach((btn) => {
        btn.addEventListener('click', (event) => {
            const id = event.target.id;
            const { ref } = getCursor();

            onFormat(id, ref);
        });
    });
};

document.addEventListener('DOMContentLoaded', main);
