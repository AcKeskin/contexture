"""Python runner for record-replay.mjs: call the named functions on the
type-trap pool and write the encoded results as JSON.

    python3 record-replay.py <spec.json> <result.json>

Parameters with a type annotation (str, int, float, bool, list, dict, Optional)
get only the pool values of that type. Run by record-replay.mjs, not by hand.
"""

import asyncio
import copy
import importlib.util
import inspect
import json
import math
import os
import sys
import typing

LONG = 10000


def pool():
    return [
        "", " ", "Größe", "👍🏽", "é", "a" * LONG, "ABC", "abc",
        0, -0.0, -1, 1, 2.5, math.nan, math.inf, -math.inf, 2**53 - 1,
        None, True, False,
        [], [1], [1, 1], [3, 1, 2], {}, {"a": 1},
    ]


def fits(value, ann):
    """True when value suits the annotation; unknown annotations accept all."""
    if ann is inspect.Parameter.empty:
        return True
    origin = typing.get_origin(ann)
    if origin is typing.Union or str(origin) == "<class 'types.UnionType'>":
        return any(fits(value, a) for a in typing.get_args(ann))
    if ann is type(None):
        return value is None
    base = origin or ann
    if base is bool:
        return isinstance(value, bool)
    if base is int:
        return isinstance(value, int) and not isinstance(value, bool)
    if base is float:
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    if base in (str, list, dict):
        return isinstance(value, base)
    return True


def label(v):
    if isinstance(v, str):
        return f'"{v[0]}"×{len(v)}' if len(v) > 40 else json.dumps(v, ensure_ascii=False)
    if isinstance(v, float) and v == 0 and math.copysign(1, v) < 0:
        return "-0.0"
    return repr(v)


def encode(v, seen=None):
    seen = seen or set()
    if isinstance(v, bool) or v is None or isinstance(v, str):
        return v
    if isinstance(v, int):
        return v if abs(v) < 2**53 else {"$": "bigint", "v": str(v)}
    if isinstance(v, float):
        if math.isnan(v):
            return {"$": "NaN"}
        if math.isinf(v):
            return {"$": "Infinity" if v > 0 else "-Infinity"}
        if v == 0 and math.copysign(1, v) < 0:
            return {"$": "-0"}
        return {"$": "float", "v": repr(v)}
    if id(v) in seen:
        return {"$": "cycle"}
    seen = seen | {id(v)}
    if isinstance(v, list):
        return [encode(x, seen) for x in v]
    if isinstance(v, tuple):
        return {"$": "tuple", "v": [encode(x, seen) for x in v]}
    if isinstance(v, (set, frozenset)):
        return {"$": "set", "v": sorted((encode(x, seen) for x in v), key=json.dumps)}
    if isinstance(v, dict):
        return {"$": "dict", "v": sorted(([encode(k, seen), encode(x, seen)] for k, x in v.items()), key=json.dumps)}
    if isinstance(v, (bytes, bytearray)):
        return {"$": "bytes", "v": v.hex()}
    if isinstance(v, BaseException):
        return {"$": "error", "name": type(v).__name__, "message": str(v)}
    if hasattr(v, "__dict__"):
        return {"$": "obj", "type": type(v).__name__, "v": encode(vars(v), seen)}
    return {"$": "repr", "v": repr(v)}


def call_once(fn, args):
    try:
        r = fn(*args)
        if inspect.isawaitable(r):
            try:
                return {"resolves": encode(asyncio.run(asyncio.wait_for(r, 5)))}
            except Exception as e:  # noqa: BLE001 - the error is the recorded result
                return {"rejects": {"name": type(e).__name__, "message": str(e)}}
        return {"returns": encode(r)}
    except Exception as e:  # noqa: BLE001 - the error is the recorded result
        return {"throws": {"name": type(e).__name__, "message": str(e)}}


def cases(params, seed, extra):
    arity = len(params)
    per = [[v for v in pool() if fits(v, p.annotation)] for p in params]
    out = []
    if arity == 0:
        out.append([])
    elif arity == 1:
        out += [[a] for a in per[0]]
    elif arity == 2:
        out += [[a, b] for a in per[0] for b in per[1]]
    elif seed is not None:
        out.append(list(seed))
        for i in range(arity):
            for v in per[i]:
                args = list(seed)
                args[i] = v
                out.append(args)
    out += [list(a) for a in extra]
    return out


def run(spec):
    path = spec["file"]
    sys.path[:0] = [os.path.dirname(path), os.getcwd()]
    module_spec = importlib.util.spec_from_file_location("_record_replay_target", path)
    module = importlib.util.module_from_spec(module_spec)
    module_spec.loader.exec_module(module)
    out = {}
    for name in spec["names"]:
        fn = getattr(module, name, None)
        if not callable(fn):
            out[name] = {"error": f'no function "{name}"'}
            continue
        params = [
            p for p in inspect.signature(fn).parameters.values()
            if p.kind in (p.POSITIONAL_ONLY, p.POSITIONAL_OR_KEYWORD) and p.default is p.empty
        ]
        if len(params) > 2 and spec["seed"] is None:
            out[name] = {"error": f"{name} takes {len(params)} parameters: pass --seed with typical arguments"}
            continue
        results = []
        for args in cases(params, spec["seed"], spec["extra"]):
            lbl = "(" + ", ".join(label(a) for a in args) + ")"
            a = call_once(fn, copy.deepcopy(args))
            b = call_once(fn, copy.deepcopy(args))
            same = json.dumps(a, sort_keys=True) == json.dumps(b, sort_keys=True)
            results.append({"label": lbl, "out": a} if same else {"label": lbl, "unstable": True})
        out[name] = {"arity": len(params), "results": results}
    return out


def main():
    with open(sys.argv[1], encoding="utf-8") as f:
        spec = json.load(f)
    result = run(spec)
    with open(sys.argv[2], "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False)


if __name__ == "__main__":
    main()
