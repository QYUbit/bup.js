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

/**
 * Creates a reactive signal
 */
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

/**
 * Creates a computed signal
 */
export function computed<T>(fn: () => T): () => T {
    const [getter, setter] = signal(undefined as T);
    
    effect(() => {
        setter(fn());
    });
    
    return getter;
}

/**
 * Creates a side effect that automatically tracks dependencies
 */
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

/**
 * Pattern for async data fetching
 */
export function resource<T>(
    fetcher: () => Promise<T>
): [() => T | undefined, () => boolean, () => Error | undefined] {
    const [data, setData] = signal<T | undefined>(undefined);
    const [loading, setLoading] = signal(true);
    const [error, setError] = signal<Error | undefined>(undefined);
    
    effect(() => {
        setLoading(true);
        setError(undefined);
        
        fetcher()
        .then((result) => {
            setData(result);
            setLoading(false);
        })
        .catch((err) => {
            setError(err);
            setLoading(false);
        });
    });
    
    return [data, loading, error];
}

export function store<T>(
    defaultValue: T,
    key: string,
    storage: "localStorage" | "sessionStorage" = "localStorage"
) {
    const store =
    storage === "sessionStorage"
        ? window.sessionStorage
        : window.localStorage;

    const raw = store.getItem(key);

    let initialValue: T;
    if (raw === null) {
        initialValue = defaultValue;
    } else {
        try {
            initialValue = JSON.parse(raw) as T;
        } catch {
            initialValue = raw as unknown as T;
        }
    }

    const [getter, setter] = signal<T>(initialValue);

    effect(() => {
        store.setItem(key, JSON.stringify(getter()));
    });

    return [getter, setter] as const;
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
