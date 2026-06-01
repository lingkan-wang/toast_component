# toast_component

A from-scratch, zero-dependency recreation of [Sonner](https://github.com/emilkowalski/sonner) (Emil Kowalski's toast component) in **vanilla HTML / CSS / JS**. Built as a learning project to understand the mechanics behind polished toast micro-interactions.

## Run it

No build step, no dependencies. Just open the file:

```
open index.html
```

(or double-click `index.html`)

## Features

- **Stacking** — multiple toasts collapse into a tidy stack; only the front few show
- **Hover to expand** — the stack fans out into a list on hover
- **Swipe to dismiss** — drag sideways; flick velocity or distance dismisses it (exits in the swipe direction)
- **Auto-dismiss + hover pause** — timed dismissal that pauses while you're hovering
- **Types** — default, success, error, warning, info, loading
- **Hand-drawn doodle icons** — monochrome SVG icons that follow the text color (black ink on light, white on dark), with subtle micro-animations (success sketches itself, error shakes, warning pulses, loading spins)
- **Promise toasts** — `loading → success / error` in place
- **Rich colors, dark theme, 6 positions, action / cancel / close buttons**
- **Respects `prefers-reduced-motion`**

## How it works

The interesting part is the **CSS-variable-driven stacking model**: JS only maintains the toast list and writes a few custom properties per toast (`--index`, `--toasts-before`, `--before-height`, …). All the positioning, scaling, and stacking math lives in CSS `calc()`, and transitions interpolate it automatically. Collapsing vs. expanding is a single `data-expanded` flip on the container.

```
index.html    demo page: control panel + wiring
sonner.css    toast styles + the stacking model (the calc lives here)
sonner.js     the toast engine — exposes window.toast
tests.html    dependency-free assertions for the timer model + config merge
```

## API

```js
toast('Saved to drafts')
toast.success('Uploaded successfully', { description: '3 files synced' })
toast.error('Something went wrong')
toast.promise(saveData(), { loading: 'Saving…', success: 'Saved', error: 'Failed' })
toast('Deleted', { action: { label: 'Undo', onClick: () => {} } })
toast.dismiss(id)
toast.configure({ position: 'top-center', theme: 'dark', richColors: true })
```

## Credit

Interaction design and behavior modeled on [Sonner](https://sonner.emilkowal.ski/) by Emil Kowalski. This is an educational re-implementation.
