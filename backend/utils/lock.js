class Lock {
    constructor() {
        this.locks = new Map();
    }

    get(name) {
        if (!this.locks.has(name)) {
            this.locks.set(name, Promise.resolve());
        }
        const lock = this.locks.get(name);
        let release;
        this.locks.set(
            name,
            lock.then(
                () =>
                    new Promise((resolve) => {
                        release = resolve;
                    })
            )
        );
        return {
            acquire: () => lock,
            release: () => {
                if (!release) {
                    console.error("Lock.release() called without Lock.acquire()");
                    return;
                }
                release();
            },
        };
    }
}

module.exports = new Lock();
