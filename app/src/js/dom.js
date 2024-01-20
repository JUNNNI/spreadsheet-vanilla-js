'use strict';

const spreadsheetEl = document.getElementById('spreadsheet');

// ---- Header ----
const spsHeaderEl = spreadsheetEl.querySelector('#sps-header');
const spsCurrentRefEl = spsHeaderEl.querySelector('#sps-current-reference');
const spsInputEl = spsHeaderEl.querySelector('#sps-input');

// Buttons
const spsBtnRedraw = spsHeaderEl.querySelector('#redraw');
const spsBtnDestroy = spsHeaderEl.querySelector('#destroy');
const spsBtnBold = spsHeaderEl.querySelector('#bold');
const spsBtnItalic = spsHeaderEl.querySelector('#italic');
const spsBtnStroke = spsHeaderEl.querySelector('#stroke');
const spsBtnDebug = spsHeaderEl.querySelector('#debug');

// ---- Table ----
const spsContainerEl = spreadsheetEl.querySelector('#sps-container');
const spsTableEl = spsContainerEl.querySelector('#sps-table');
const spsVScrollViewportEl = spsContainerEl.querySelector('.vscroll-viewport');
