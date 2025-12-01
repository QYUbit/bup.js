import { effect, signal } from "./reactivity.js";

export function resource<T>(
    fetcher: () => Promise<T>
): {
    data: () => T | undefined;
    loading: () => boolean;
    error: () => Error | undefined;
    refetch: () => void;
    mutate: (value: T | undefined) => void;
} {
    const [data, setData] = signal<T | undefined>(undefined);
    const [loading, setLoading] = signal(true);
    const [error, setError] = signal<Error | undefined>(undefined);
    const [refetchTrigger, setRefetchTrigger] = signal(0);
    
    effect(() => {
        refetchTrigger();
        
        setLoading(true);
        setError(undefined);
        
        fetcher()
        .then(result => {
            setData(result);
            setLoading(false);
        })
        .catch(err => {
            setError(err);
            setLoading(false);
        });
    });
    
    const refetch = () => {
        setRefetchTrigger(prev => prev + 1);
    };
    
    const mutate = (value: T | undefined) => {
        setData(value);
    };
    
    return {
        data,
        loading,
        error,
        refetch,
        mutate
    } as const;
}

export function store<T>(
    defaultValue: T,
    key: string,
    storage: "localStorage" | "sessionStorage" = "localStorage"
): {
    getter: () => T,
    setter: (value: T | ((prev: T) => T)) => void,
} {
    if (typeof window === "undefined") {
        throw new Error("Cannot use store outside the browser");
    }

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
        } catch (err) {
            initialValue = defaultValue;
            console.error(`Failed to load ${key}: ${err}`);
        }
    }

    const [getter, setter] = signal<T>(initialValue);

    effect(() => {
        store.setItem(key, JSON.stringify(getter()));
    });

    return {
        getter,
        setter
    } as const;
}
