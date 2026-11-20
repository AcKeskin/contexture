# Input traps per parameter type

Read in step 3 of `/write-tests`. For each parameter, pick the traps that can change the result. A trap the code cannot reach (a typed `int` never gets `NaN`) is skipped, not tested.

| Type | Traps |
| --- | --- |
| String | empty `""`; whitespace only; non-ASCII (`"Größe"`, `"日本"`); emoji, including a joined one (`"👍🏽"`, `"👨‍👩‍👧"`); combining marks (`"é"` vs `"é"`); very long (10,000+ chars); upper, lower and mixed case; leading or trailing spaces; a separator the code splits on |
| Number | `0` and `-0`; `-1`; `NaN`; `Infinity` and `-Infinity`; an int where a float is expected and a float where an int is expected (`2.5`); the largest and smallest value (`Number.MAX_SAFE_INTEGER`, `int.MaxValue`); one past a limit |
| List, array, set | empty; one item; duplicates; unsorted when the code expects sorted; very large; contains `null` or an empty item |
| Map, object | empty; missing key; extra key; key with a `null` value |
| Optional, nullable | `null` / `None` / `undefined` where the type allows it |
| Date, time | leap day; month and year ends; a DST change; time zone other than UTC; epoch `0` |
| Path, URL | spaces; non-ASCII; trailing separator; relative vs absolute; Windows `\` |

**Error paths:** one failing case for every error path the code has (each `throw`, each returned error, each rejected promise). Assert the error type and the part of the message a caller relies on. An error path with no case is listed under "Deliberately NOT covering" with the reason.

Adapted from `erkamyaman/rust-anything` (MIT), read 2026-11-19.
