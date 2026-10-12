/**
 * X PIDER Async Operation Queue Module
 * Provides strict serialized mutex execution for background service worker operations
 * to prevent concurrent write races and storage corruption.
 */

(function(root) {
    'use strict';

    class AsyncOperationQueue {
        constructor() {
            this._queue = Promise.resolve();
            this._activeCount = 0;
        }

        /**
         * Enqueue an async operation to execute sequentially after all prior enqueued operations settle.
         * @param {Function} operationFn - Async function returning a Promise.
         * @returns {Promise} Resolves or rejects with the result of operationFn.
         */
        enqueue(operationFn) {
            this._activeCount++;
            const next = this._queue.then(() => operationFn()).finally(() => {
                this._activeCount--;
            });
            // Ensure failure of one operation does not stall subsequent operations in the chain
            this._queue = next.catch(() => {});
            return next;
        }

        get activeCount() {
            return this._activeCount;
        }
    }

    // Universal Export
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { AsyncOperationQueue };
    }
    if (typeof root !== 'undefined') {
        root.AsyncOperationQueue = AsyncOperationQueue;
    }
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));
