# gb-tstl-utils

A TypescriptToLua plugin providing various utility functions/methods.

## Installation

Run `npm install gb-tstl-utils`/`yarn add gb-tstl-utils` in your project directory.

Add to your tsconfig.json:

```json
{
  "compilerOptions": {
    "types": [
      "gb-tstl-utils"
    ]
  },
  "tstl": {
    //...
    "luaPlugins": [
      {
        name: "gb-tstl-utils/plugin"
        // options (see below)
      }
    ]
  }
}
```

## Provided functions

See [index.d.ts](index.d.ts) for a list of intrinsic functions/constants.

One highlight: the constant `nil` is provided as a shorthand for `undefined` (for TSTL specifically).

## Options

These features are disabled by default. To enable, add the fields to the `luaPlugins` object in your
tsconfig.json.

### `simplifyDelete: true`

Simplifies delete expressions to `table[key] = nil` instead of the `__TS__Delete` function.
This has the same behavior if you are not using `Object.defineProperty`, but is faster.

### `warnOnUseUndefined: true`

Emit a warning when using `undefined` instead of `nil` (provided by this plugin).

This is for enforcing a style preference.

### `warnUseDoubleEquals: true`

Emit a warning when using `==` instead of `===`, or `!=` instead of `!==`.
In TSTL/Lua, these operators have no difference.

This is for enforcing a style preference.
