# Bare UI Patterns

A lightweight, reactive library for building dynamic UIs with fine-grained reactivity and practical DOM access.

## Installation

```bash
npm install bup.js
```

## Example

```typescript
    import { signal, query } from 'bup.js';

    const [count, setCount] = signal(0);

    query('#counter').text(() => `Count: ${count()}`);
    query('#increment').on('click', () => setCount(count() + 1));
```

## Reactivity API

bup's reactivity is inspired by solid.js. Here is how it works:

**signal(initialValue)**
Creates a reactive signal and returns getter and setter.

```typescript
const [count, setCount] = signal(0);
setCount(5);
setCount(n => n + 1);

console.log(`Count: ${count()}`); // "Count: 6"
```

**effect(cb)**
Runs a callback when dependencies (used signals) change.

```typescript
const [count, setCount] = signal(0);

effect(() => {
  console.log('Count:', count()); // "Count: 0"
  return () => console.log('Cleanup'); // Optional cleanup
});

setCount(1) // "Count: 1"
```

## DOM API

**query(selector) / queryAll(selector)**
Finds elements and returns a chainable ElementSet.

```typescript
query('#app').text(() => 'Hello');
queryAll('.item').attr('value': () => 'active');
```

**create(tagName, attributes?)**
Creates a new HTML element.

```typescript
const button = create('button', { class: 'btn', id: 'submit' });
```

### ElementSet:

**.text(getter)**
Sets reactive text content.

```typescript
query('#greeting').text(() => `Hello ${name()}!`);
```


**.attr(name, getter)**
Sets a reactive attribute.

```typescript
query('button').attr('disabled', () => isDisabled() ? 'true' : null);
```

**.show(getter)**
Reactively shows or hides elements.

```typescript
query('.modal').show(() => isOpen());
```

**.on(eventName, callback)**
Attaches an event listener.

```typescript
query('button').on('click', () => console.log('clicked'));
```

## Examples

### Counter

```typescript
const [count, setCount] = signal(0);
query('#counter').text(() => count());
query('button').on('click', () => setCount(prev => prev + 1));
```

### Todo List

```typescript
const [todos, setTodos] = signal([]);
query('ul').children(
  () => todos(),
  (parent, todo) => {
    const div = create('div');
    div.setText(todo.text);
    parent.appendChild(div);
  }
);
```

## License

MIT