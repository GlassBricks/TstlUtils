/// <reference types="@typescript-to-lua/language-extensions" />

/**
 * Returns a new LuaSet with the given values.
 *
 * Transpiles to a Lua table literal.
 */
declare function newLuaSet<T extends AnyNotNil>(...values: T[]): LuaSet<T>

/**
 * Utility to narrow the type of a value.
 *
 * Does not show up in the transpiled code.
 */
declare function assume<T>(value: unknown): asserts value is T

/**
 * Gets the keys of a type.
 *
 * Transpiles to a Lua list/array literal.
 */
declare function keys<T>(): Array<keyof T>

/**
 * Gets the keys of a type, as a LuaSet.
 *
 * Transpiles to a Lua table literal.
 */
declare function keySet<T>(): LuaSet<keyof T>

/**
 * Returns the names of output lua files that match the given regex.
 *
 * Parameter must be a string literal.
 */
declare function getProjectFilesMatchingRegex(regex: string): string[]


/**
 * Translates directly to `nil` in Lua.
 *
 * Shorter than `undefined`.
 */
declare const nil: undefined
