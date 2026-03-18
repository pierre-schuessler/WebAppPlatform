# Registry

In-process app and capability management for JavaScript. Add one script tag — autostart handles the rest.

```html
<script type="module" src="registry.js"></script>
```

Registry loads `autostart.json` and boots each listed app. Apps register responsibilities, call each other, and manage their own lifecycle from there.

```json
[
  { "name": "Storage", "src": "./apps/Firebase/script.js" },
  { "name": "UI",      "src": "./apps/ui.js"      }
]
```

```js
// apps/Firebase/script.js
import { Registry } from '../../registry.js';

export default async function () {
  Registry.responsibility_create('Database', 'Firebase', async (caller, body) => {
    // handle get, set, subscribe, etc.
  });
}
```

---

## Concepts

- **App** — a named, running function. Must relinquish all responsibilities before terminating.
- **Responsibility** — a named capability owned by one *authority* app. Others call it or monitor it.
- **Lifecycle hooks** — fire globally on any app start or terminate.

---

## API

### Apps

| Method | Description |
|---|---|
| `app_start(name, fn)` | Register and immediately run an app |
| `app_terminate(name)` | Stop an app (fails if it still owns responsibilities) |
| `app_check_exists(name)` | Returns `boolean` |
| `app_list()` | Returns `string[]` of running app names |
| `app_on_lifecycle({ onStart, onTerminate })` | Subscribe to lifecycle events; returns unsubscribe fn |

### Responsibilities

| Method | Description |
|---|---|
| `responsibility_create(name, app, handler)` | Declare a capability owned by `app` |
| `responsibility_delete(name, app)` | Remove a responsibility (authority only) |
| `responsibility_call(name, app, body)` | Invoke the authority handler; returns its result |
| `responsibility_request_retire(name, app)` | Signal readiness for handoff |
| `responsibility_takeover(name, app, handler)` | Assume authority of a retiring responsibility |
| `responsibility_monitor_create(name, app, handler)` | Observe all calls; receives `(caller, body, resultPromise)` |
| `responsibility_monitor_delete(name, app)` | Remove a monitor |
| `responsibility_on_available(name, cb)` | Fire `cb` when responsibility is created; returns cancel fn |

All methods return `{ type: 'success' }` or `{ type: 'error', status }`.

---

## Patterns

**Wait for a dependency** — apps start concurrently, so don't assume load order:
```js
const cancel = Registry.responsibility_on_available('Database', () => {
  cancel();
  Registry.responsibility_call('Database', 'MyApp', { type: 'db_get', path: 'config' });
});
```

**Hot-swap a responsibility** — zero-downtime handoff:
```js
Registry.responsibility_request_retire('feature', 'OldApp');
Registry.responsibility_takeover('feature', 'NewApp', newHandler);
Registry.app_terminate('OldApp');
```

---

## Conventions

Responsibilities only work as a system if apps agree on names, call shapes, and return shapes. The [`conventions/`](./conventions) folder documents them — one file per domain (e.g. `storage.md`, `auth.md`), covering every responsibility under that namespace.
