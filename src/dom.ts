import { effect } from "./reactivity.js";

export function create(tagName: string, attributes: Record<string, string> = {}): HTMLElement {
    const element = document.createElement(tagName);
    for (const name in attributes) {
        element.setAttribute(name, attributes[name] as string);
    }
    return element;
}

export function query(selector: string) {
    const el = document.querySelector(selector);
    return new ElementSet(el ? [el] : []);
}

export function queryAll(selector: string) {
    const els = document.querySelectorAll(selector);
    return new ElementSet(Array.from(els));
}

export class ElementSet {
    private elements: Element[];
    private cleanups: (() => void)[];

    constructor(elements: Element[]) {
        this.elements = elements;
        this.cleanups = [];
    }

    text(getter: () => any): ElementSet {
        for (const element of this.elements) {
            const cleanup = effect(() => {
                element.textContent = String(typeof getter === "function" ? getter() : getter);
            });
            this.cleanups.push(cleanup);
        }
        return this;
    }

    attr(attributeName: string, getter: () => any): ElementSet {
        for (const element of this.elements) {
            const cleanup = effect(() => {
                element.setAttribute(attributeName, String(typeof getter === "function" ? getter() : getter));
            });
            this.cleanups.push(cleanup);
        }
        return this;
    }

    on(eventName: string, cb: EventListenerOrEventListenerObject): ElementSet {
        for (const element of this.elements) {
            element.addEventListener(eventName, cb);
            this.cleanups.push(() => element.removeEventListener(eventName, cb));
        }
        return this;
    }

    children<T>(
        getter: () => T[],
        render: (element: Element, value: T, index: number) => () => void | void
    ) {
        for (const element of this.elements) {
            let prevCleanups: (() => void)[] = []

            const cleanup = effect(() => {
                prevCleanups.forEach(fn => fn());
                prevCleanups = [];

                element.innerHTML = "";

                const arr = getter();

                arr.forEach((value, i) => {
                    const _cleanup = render(element, value, i);
                    if (_cleanup) {
                        prevCleanups.push(_cleanup);
                    }
                });
            });

            this.cleanups.push(() => {
                cleanup();
                prevCleanups.forEach(fn => fn());
            });
        }
        return this;
    }

    forEach(cb: (value: Element, index: number, array: Element[]) => void): ElementSet {
        this.elements.forEach(cb);
        return this;
    }

    do(cb: (element: Element | undefined) => void): ElementSet {
        cb(this.elements[0]);
        return this;
    }

    cleanup(): void {
        this.cleanups.forEach(fn => fn());
    }

    get all() {
        return this.elements;
    }

    get one() {
        return this.elements[0];
    }

    get length(): number {
        return this.elements.length;
    }
}
