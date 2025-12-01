interface Signal<T> {
    value: T,
    subs: Set<Effect>
}

interface Effect {
    run: () => void;
    deps: Set<Signal<any>>;
    cleanups: (() => void)[];
}

let currentEffect: Effect | null = null;

export function signal<T>(initialValue: T): [() => T, (value: T | ((prev: T) => T)) => void] {
    const signal: Signal<T> = {
        value: initialValue,
        subs: new Set()
    };

    const getter = () => {
        if (currentEffect) {
            signal.subs.add(currentEffect);
            currentEffect.deps.add(signal);
        }
        return signal.value;
    };

    const setter = (nextValue: T | ((prev: T) => T)) => {
        const newValue =
        typeof nextValue === "function"
            ? (nextValue as ((prev: T) => T))(signal.value)
            : nextValue;

        if (!Object.is(signal.value, newValue)) {
            signal.value = newValue;
            signal.subs.forEach(sub => schedule(sub.run));
        }
    };

    return [getter, setter] as const;
}

export function computed<T>(fn: () => T): () => T {
    const [getter, setter] = signal(undefined as T);
    
    effect(() => {
        setter(fn());
    });
    
    return getter;
}

export function effect(fn: () => void | (() => void)): () => void {
    const effect: Effect = {
        run: () => {
            effect.cleanups.forEach(cleanup => cleanup());
            effect.cleanups = [];
            
            effect.deps.forEach((signal) => {
                signal.subs.delete(effect);
            });
            effect.deps.clear();
            
            const prevEffect = currentEffect;
            currentEffect = effect;
            
            try {
                const cleanup = fn();
                if (cleanup && typeof cleanup === "function") {
                    effect.cleanups.push(cleanup);
                }
            } finally {
                currentEffect = prevEffect;
            }
        },
        deps: new Set(),
        cleanups: []
    };
    
    effect.run();
    
    return () => {
        effect.cleanups.forEach(cleanup => cleanup());
        effect.deps.forEach(signal => {
            signal.subs.delete(effect);
        });
    };
}

export function ignore<T>(fn: () => T): T {
    const prevEffect = currentEffect;
    currentEffect = null;
    
    try {
        return fn();
    } finally {
        currentEffect = prevEffect;
    }
}

export function scope<T>(fn: (dispose: () => void) => T): T {
    const prevEffect = currentEffect;
    currentEffect = null;
    
    const cleanups: (() => void)[] = [];
    
    const dispose = () => {
        cleanups.forEach(cleanup => cleanup());
        cleanups.length = 0;
    };
    
    try {
        const result = fn(dispose);
        
        if (currentEffect) {
            cleanups.push(() => {
                currentEffect?.cleanups.forEach(cleanup => cleanup());
            });
        }
        
        return result;
    } finally {
        currentEffect = prevEffect;
    }
}

let flushing = false;
const queue: (() => void)[] = [];

function schedule(job: () => void): void {
    if (!queue.includes(job)) {
        queue.push(job);
    }
    
    if (!flushing) {
        flushing = true;
        queueMicrotask(flush);
    }
}

function flush(): void {
    for (let i = 0; i < queue.length; i++) {
        if (queue[i]) (queue[i] as () => void)();
    }
    queue.length = 0;
    flushing = false;
}
