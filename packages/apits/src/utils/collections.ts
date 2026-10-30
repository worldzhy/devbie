/**
 * Minimal collection/type helpers, implemented locally to keep the dependency
 * tree clean (the `vtils` package this subset replaces pulls in deprecated
 * dependencies and is unmaintained). Behavior matches the upstream functions
 * for the call sites in this repository only.
 */

/**
 * Remove `undefined` from a type. Equivalent to vtils's `Defined<T>`.
 */
export type Defined<T> = Exclude<T, undefined>;

/**
 * Wrap a value in an array unless it is already an array.
 */
export function castArray<T>(value: T | T[]): T[] {
  return Array.isArray(value) ? value : [value];
}

/**
 * `Array.isArray` alias, kept for import symmetry with the other helpers.
 */
export const isArray = Array.isArray;

/**
 * Check whether a value is a plain object (not null, not an array, not a
 * function, not a primitive). Matches vtils `isObject` for the JSON-Schema
 * values used in this project.
 */
export function isObject(value: any): value is Record<string, any> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Check whether a value is "empty": null/undefined, empty string, empty
 * array, or an object with no own enumerable string-keyed properties.
 */
export function isEmpty(value: any): boolean {
  if (value == null) return true;
  if (typeof value === "string" || Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value).length === 0;
  return true;
}

/**
 * Iterate over the own enumerable string-keyed properties of an object,
 * invoking `callback(value, key)` for each.
 */
export function forOwn<T extends object>(obj: T, callback: (value: T[keyof T], key: keyof T) => void): void {
  if (obj == null) return;
  Object.keys(obj).forEach((key) => {
    callback((obj as any)[key], key as keyof T);
  });
}

/**
 * Iterate over a collection (array or object), invoking `callback(value, key)`
 * for each item. For arrays `key` is the numeric index. Types are intentionally
 * loose (matching vtils) because call sites pass heterogeneous OpenAPI data.
 */
export function each(collection: any, callback: (value: any, key: any) => void): void {
  if (collection == null) return;
  if (Array.isArray(collection)) {
    collection.forEach((value, index) => callback(value, index));
  } else if (typeof collection === "object") {
    Object.keys(collection).forEach((key) => {
      callback(collection[key], key);
    });
  }
}

/**
 * Return the first item in a collection for which `predicate` returns a
 * truthy value, or `undefined` if none matches.
 */
export function find(collection: any, predicate: (value: any, key: any) => boolean): any {
  if (collection == null) return undefined;
  if (Array.isArray(collection)) {
    return collection.find((value, index) => predicate(value, index));
  }
  if (typeof collection === "object") {
    for (const key of Object.keys(collection)) {
      const value = collection[key];
      if (predicate(value, key)) return value;
    }
  }
  return undefined;
}
