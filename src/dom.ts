import { effect } from "./reactivity.js";

export type Getter<T> = T | (() => T);

interface ShowElement extends HTMLElement {
    _shouldShow?: boolean
}

interface ClassElement extends HTMLElement {
    _originalClasses?: Set<string>
    _bupClasses?: Set<string>
}

interface StyleElement extends HTMLElement {
    _originalStyle?: string
    _bupStyles?: Record<string, string>
}

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

    text(getter: Getter<any>): ElementSet {
        for (const element of this.elements) {
            const cleanup = effect(() => {
                element.textContent = String(typeof getter === "function" ? getter() : getter);
            });
            this.cleanups.push(cleanup);
        }
        return this;
    }

    attr(attributeName: string, getter: Getter<any>): ElementSet {
        for (const element of this.elements) {
            const cleanup = effect(() => {
                element.setAttribute(attributeName, String(typeof getter === "function" ? getter() : getter));
            });
            this.cleanups.push(cleanup);
        }
        return this;
    }

    show(getter: Getter<boolean>): ElementSet {
        for (const element of this.elements) {
            const cleanup = effect(() => {
                const shouldShow = typeof getter === "function" ? getter() : getter;

                if ((element as ShowElement)._shouldShow === shouldShow) return;
                (element as ShowElement)._shouldShow = shouldShow;

                if ((element as HTMLElement).style) {
                    (element as HTMLElement).style.display = shouldShow ? "" : "none";
                }
            });
            this.cleanups.push(cleanup);
        }
        return this;
    }

    class(
        getter: Record<string, Getter<boolean>> | Getter<string[]> | Getter<string>
    ): ElementSet {
        for (const element of this.elements) {

            if (!(element as ClassElement)._originalClasses) {
                (element as ClassElement)._originalClasses = new Set(Array.from(element.classList));
            }

            const cleanup = effect(() => {    
                if ((element as ClassElement)._bupClasses) {
                    (element as ClassElement)._bupClasses!.forEach(cls => element.classList.remove(cls));
                }
            
                const newClasses = new Set<string>();
                const classes = typeof getter === "function" ? getter() : getter;
        
                if (typeof classes === "string") {
                    classes.split(/\s+/).forEach((cls) => {
                        if (cls.trim()) newClasses.add(cls.trim());
                    })
                } else if (Array.isArray(classes)) {
                    classes.forEach((cls) => {
                        newClasses.add(cls);
                    });
                } else if (typeof classes === "object" && classes !== null) {
                    Object.entries(classes).forEach(([className, condition]) => {
                        if (typeof condition === "function") condition = condition();
                        if (condition) {
                            className.split(/\s+/).forEach((cls) => {
                                if (cls.trim()) newClasses.add(cls.trim());
                            })
                        }
                    });
                }
                
                newClasses.forEach(cls => element.classList.add(cls));
                (element as ClassElement)._bupClasses = newClasses;
            });
            this.cleanups.push(cleanup);
        }
        return this;
    }

    style(getter: Record<string, Getter<string>> | Getter<string>): ElementSet {
        for (const element of this.elements) {

            if (!(element as StyleElement)._originalStyle) {
                (element as StyleElement)._originalStyle = element.getAttribute("style") || "";
            }

            const cleanup = effect(() => {                
                if ((element as StyleElement)._bupStyles) {
                    Object.keys((element as StyleElement)._bupStyles!).forEach((prop) => {
                        (element as HTMLElement).style?.removeProperty(prop);
                    });
                }
                
                if ((element as StyleElement)._originalStyle) {
                    element.setAttribute("style", (element as StyleElement)._originalStyle!);
                } else {
                    element.removeAttribute("style");
                }
                
                const newStyles: Record<string, string> = {}
                
                if (typeof getter === "function") {
                    getter = getter();
                }

                if (typeof getter === "string") {
                    const cssString = getter.trim();
                    if (cssString) {
                        const currentStyle = element.getAttribute("style") || "";
                        const separator = currentStyle && !currentStyle.endsWith(";") ? "; " : "";
                        const finalCssString = cssString.endsWith(";") ? cssString : cssString + ";";
                        element.setAttribute("style", currentStyle + separator + finalCssString);
                        
                        const rules = finalCssString.split(';').filter(rule => rule.trim());
                        
                        rules.forEach(rule => {
                            const colonIndex = rule.indexOf(':');
                            if (colonIndex > 0) {
                                const property = rule.substring(0, colonIndex).trim();
                                const value = rule.substring(colonIndex + 1).trim();
                                if (property && value) {
                                    newStyles[property] = value;
                                }
                            }
                        });
                    }
                } else if (typeof getter === "object" && getter !== null) {
                    Object.entries(getter).forEach(([property, styleValue]) => {
                        const finalValue = typeof styleValue === "function" ? styleValue() : styleValue;
                        const cssProperty = property.replace(/([A-Z])/g, "-$1").toLowerCase();
                        (element as HTMLElement).style?.setProperty(cssProperty, String(finalValue));
                        newStyles[cssProperty] = String(finalValue);
                    });
                }
                
                (element as StyleElement)._bupStyles = newStyles;
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
        getter: Getter<T[]>,
        render: (element: Element, value: T, index: number) => (() => void) | void
    ) {
        for (const element of this.elements) {
            let prevCleanups: (() => void)[] = []

            const cleanup = effect(() => {
                prevCleanups.forEach(fn => fn());
                prevCleanups = [];

                element.innerHTML = "";

                const arr = typeof getter === "function" ? getter() : getter;

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
