# Database

This responsibility handles saving and loading data from a database of some kind.
All paths are relative — the app prepends the platform namespace internally.

---

## Calls

### `get`
Read a single value at a path.
```js
{ type: 'get', path: 'users/alice' }
// → { type: 'success', data: value | null }
// → { type: 'error', status: "Missing 'path' field." }
```

### `set`
Write a value at a path.
```js
{ type: 'set', path: 'users/alice', value: { name: 'Alice' } }
// → { type: 'success' }
// → { type: 'error', status: "Missing 'path' field." }
// → { type: 'error', status: "Missing 'value'." }
```

### `delete`
Remove a path and all its children.
```js
{ type: 'delete', path: 'users/alice' }
// → { type: 'success' }
// → { type: 'error', status: "Missing 'path' field." }
```

### `list`
List the keys at a path. Returns `[]` if the path doesn't exist.
```js
{ type: 'list', path: 'users' }
// → { type: 'success', data: ['alice', 'bob', ...] }
// → { type: 'error', status: "Missing 'path' field." }
```

### `get_all`
Read an entire subtree.
```js
{ type: 'get_all', path: 'users' }
// → { type: 'success', data: { alice: {...}, bob: {...} } | null }
// → { type: 'error', status: "Missing 'path' field." }
```

### `query`
Filter children at a path by matching fields. Returns `[]` if the path doesn't exist.
```js
{ type: 'query', path: 'users', filter: { role: 'admin' } }
// → { type: 'success', data: [...matching values] }
// → { type: 'error', status: "Missing 'path' field." }
```

### `subscribe`
Attach a live listener to a path. Fires `callback(path, value)` on any change. Replaces any existing listener for the same `subscriberId`.
```js
{ type: 'subscribe', path: 'users/alice', subscriberId: 'my-listener', callback: fn }
// → { type: 'success' }
// → { type: 'error', status: "Missing 'path' field." }
// → { type: 'error', status: "Missing 'subscriberId'." }
// → { type: 'error', status: "Missing 'callback' function." }
```

### `unsubscribe`
Remove a live listener. Silently succeeds if the `subscriberId` isn't active.
```js
{ type: 'unsubscribe', subscriberId: 'my-listener' }
// → { type: 'success' }
// → { type: 'error', status: "Missing 'subscriberId'." }
```

### `flush`
No-op — writes are real-time. Safe to call.
```js
{ type: 'flush' }
// → { type: 'success' }
```

### `stats`
Returns diagnostics about the connection and active subscribers.
```js
{ type: 'stats' }
// → { type: 'success', data: { topLevelKeys, backend, subscriberCount, subscribers } }
```
