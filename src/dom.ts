import { effect } from "./reactivity.js";

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

export function create<K extends keyof HTMLElementTagNameMap>(
    tagName: K, attributes: Record<string, string> = {}
): ElementSet {
    const element = document.createElement(tagName);
    for (const name in attributes) {
        element.setAttribute(name, attributes[name] as string);
    }
    return new ElementSet([element]);
}

export function html(strings: TemplateStringsArray, ...values: any[]): ElementSet {
    const template = document.createElement('template');
    template.innerHTML = strings.reduce((acc, str, i) => 
        acc + str + (values[i] ?? ''), ''
    );
    const el = template.content.firstElementChild as HTMLElement;
    return new ElementSet(el ? [el] : []);
}

export function query(selector: string): ElementSet | null {
    const el = document.querySelector(selector);
    if (!(el instanceof HTMLElement)) return null;
    return new ElementSet(el ? [el] : []);
}

export function queryAll(selector: string): ElementSet {
    const els = document.querySelectorAll(selector);
    return new ElementSet(Array.from(els).filter(el => el instanceof HTMLElement) as HTMLElement[]);
}

export class ElementSet {
    private elements: HTMLElement[];
    private cleanups: (() => void)[];

    constructor(elements: HTMLElement[]) {
        this.elements = elements;
        this.cleanups = [];
    }

    setText(text: any): this {
        for (const element of this.elements) {
            element.textContent = String(text);
        }
        return this;
    }

    setAttr(attributeName: string, value: any): this {
        for (const element of this.elements) {
            element.setAttribute(attributeName, String(value));
        }
        return this;
    }

    addClass(...classNames: string[]): this {
        for (const element of this.elements) {
            element.classList.add(...classNames);
        }
        return this;
    }

    removeClass(...classNames: string[]): this {
        for (const element of this.elements) {
            element.classList.remove(...classNames);
        }
        return this;
    }

    toggleClass(className: string): this {
        for (const element of this.elements) {
            if (element.classList.contains(className)) {
                element.classList.remove(className);
            } else {
                element.classList.add(className);
            }
        }
        return this;
    }

    setStyle(styles: Record<string, string>): this {
        for (const element of this.elements) {
            for (const [property, value] of Object.entries(styles))
            element.style.setProperty(property, value);
        }
        return this;
    }

    $text(getter: () => any): this {
        for (const element of this.elements) {
            const cleanup = effect(() => {
                element.textContent = String(getter());
            });
            this.cleanups.push(cleanup);
        }
        return this;
    }

    $attr(attributeName: string, getter: () => any): this {
        for (const element of this.elements) {
            const cleanup = effect(() => {
                element.setAttribute(attributeName, String(getter()));
            });
            this.cleanups.push(cleanup);
        }
        return this;
    }

    $show(getter: () => boolean): this {
        for (const element of this.elements) {
            const cleanup = effect(() => {
                const shouldShow = getter();

                if ((element as ShowElement)._shouldShow === shouldShow) return;
                (element as ShowElement)._shouldShow = shouldShow;

                if (element.style) {
                    element.style.display = shouldShow ? "" : "none";
                }
            });
            this.cleanups.push(cleanup);
        }
        return this;
    }

    $class(
        getter: Record<string, () => boolean> | (() => string[]) | (() => string)
    ): this {
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
                        if (condition()) {
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

    $style(getter: Record<string, (() => string)> | (() => string)): this {
        for (const element of this.elements) {

            if (!(element as StyleElement)._originalStyle) {
                (element as StyleElement)._originalStyle = element.getAttribute("style") || "";
            }

            const cleanup = effect(() => {                
                if ((element as StyleElement)._bupStyles) {
                    Object.keys((element as StyleElement)._bupStyles!).forEach((prop) => {
                        element.style?.removeProperty(prop);
                    });
                }
                
                if ((element as StyleElement)._originalStyle) {
                    element.setAttribute("style", (element as StyleElement)._originalStyle!);
                } else {
                    element.removeAttribute("style");
                }
                
                const newStyles: Record<string, string> = {}

                const dynamicStyles = typeof getter === "function" ? getter() : getter;
               
                if (typeof dynamicStyles === "string") {
                    const cssString = dynamicStyles.trim();
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
                        const finalValue = styleValue();
                        const cssProperty = property.replace(/([A-Z])/g, "-$1").toLowerCase();
                        element.style?.setProperty(cssProperty, String(finalValue));
                        newStyles[cssProperty] = String(finalValue);
                    });
                }
                
                (element as StyleElement)._bupStyles = newStyles;
            });
            this.cleanups.push(cleanup);
        }

        return this;
    }

    $children<T>(
        getter: T[] |(() => T[]),
        render: (element: HTMLElement, value: T, index: number) => (() => void) | void
    ): this {
        for (const element of this.elements) {
            let prevCleanups = new Set<() => void>();

            const cleanup = effect(() => {
                prevCleanups.forEach(fn => fn());
                prevCleanups.clear();

                const arr = typeof getter === "function" ? getter() : getter;

                arr.forEach((value, i) => {
                    const _cleanup = render(element, value, i);
                    if (_cleanup) {
                        prevCleanups.add(_cleanup);
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

    $keyedChildren<T>(
        getter: T[] |(() => T[]),
        key: (value: T, index: number) => string,
        render: (element: HTMLElement, value: T, index: number) => (() => void) | void
    ): this {
        for (const element of this.elements) {
            const cleanups = new Map<string, (() => void)>();

            const cleanup = effect(() => {
                const arr = typeof getter === "function" ? getter() : getter;

                const keys = arr.map((value, i) => key(value, i));

                const prevKeys = Array.from(cleanups.keys());

                const keysToRemove = prevKeys.filter(key => !keys.includes(key));

                keysToRemove.forEach((key) => {
                    const fn = cleanups.get(key);
                    fn && fn();
                    cleanups.delete(key);
                });

                keys.forEach((key, i) => {
                    if (cleanups.has(key)) return;
                    const cleanup = render(element, arr[i] as T, i);
                    cleanups.set(key, cleanup ?? (() => {}));
                });
            });

            this.cleanups.push(() => {
                cleanup();
                cleanups.forEach(fn => fn());
            });
        }
        return this;
    }

    on<K extends keyof HTMLElementEventMap>(
        eventName: K,
        cb: (e: HTMLElementEventMap[K]) => void
    ): this {
        for (const element of this.elements) {
            element.addEventListener(eventName, cb);
            this.cleanups.push(() => element.removeEventListener(eventName, cb));
        }
        return this;
    }

    find(selector: string): ElementSet {
        const found = this.elements.flatMap(el => 
            Array.from(el.querySelectorAll(selector))
        );
        return new ElementSet(found as HTMLElement[]);
    }

    parent(): ElementSet {
        const parents = this.elements
            .map(el => el.parentElement)
            .filter((el): el is HTMLElement => el !== null);
        return new ElementSet(parents);
    }

    append(...children: (ElementSet | HTMLElement)[]): this {
        for (const element of this.elements) {
            children.forEach(child => {
                if (child instanceof ElementSet) {
                    child.all.forEach(c => element.appendChild(c));
                } else {
                    element.appendChild(child);
                }
            });
        }
        return this;
    }


    map<T>(cb: (element: HTMLElement, index: number) => T): T[] {
        return this.elements.map(cb);
    }

    filter(cb: (element: HTMLElement, index: number) => boolean): ElementSet {
        return new ElementSet(this.elements.filter(cb));
    }

    forEach(cb: (value: HTMLElement, index: number, array: HTMLElement[]) => void): this {
        this.elements.forEach(cb);
        return this;
    }

    forOne(cb: (element: HTMLElement | undefined) => void): this {
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

    isEmpty(): boolean {
        return this.elements.length === 0;
    }
}
