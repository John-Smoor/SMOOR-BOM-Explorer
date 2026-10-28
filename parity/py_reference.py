"""
Parity reference: runs the ORIGINAL Python calculations (functions copied verbatim from app.py via ast,
plus bom_store / erp_soh imported as-is) on real + randomized inputs and writes cases/results to JSON.
Usage: python -I parity/py_reference.py <path-to-original-streamlit-app> <out.json>
"""
import ast, json, math, random, sys, types, os
import numpy as np
import pandas as pd

APP_DIR, OUT = sys.argv[1], sys.argv[2]
sys.path.insert(0, APP_DIR)
import config as C   # noqa
import bom_store as S  # noqa
import erp_soh as E  # noqa

random.seed(7)
np.random.seed(7)

# ── pull calc functions verbatim from app.py ──
src = open(os.path.join(APP_DIR, "app.py"), encoding="utf-8").read()
tree = ast.parse(src)
WANT = {"short_wh", "attach_soh", "suggestions", "search", "order_check", "fg_summary"}
ns = {"pd": pd, "math": math, "C": C, "S": S, "E": E}
for node in tree.body:
    if isinstance(node, ast.FunctionDef) and node.name in WANT:
        exec(compile(ast.Module([node], []), "app.py", "exec"), ns)

SOH = {"df": None, "meta": {}}
ns["soh"] = lambda: (SOH["df"], SOH["meta"])


def j(v):
    if v is None:
        return None
    if isinstance(v, (np.integer,)):
        return int(v)
    if isinstance(v, (float, np.floating)):
        return None if pd.isna(v) else float(v)
    if v is pd.NA:
        return None
    return v


def records(df):
    return [{k: j(v) for k, v in r.items()} for r in df.to_dict("records")]


def bom_json(df):
    return [dict(fgCode=r[C.COL_FG_CODE], fgName=r[C.COL_FG_NAME], pmCode=r[C.COL_PM_CODE], pmName=r[C.COL_PM_NAME],
                 qty=j(r[C.COL_QTY]), uom=r[C.COL_UOM], rate=j(r[C.COL_RATE]), rowId=r[C.COL_ROW_ID]) for _, r in df.iterrows()]


def soh_json(sdf, meta):
    wh = [c for c in sdf.columns if c not in ("Item Code", "ERP Item Name", "SOH Total")]
    has_name = "ERP Item Name" in sdf.columns
    items = [dict(itemCode=r["Item Code"], erpName=(None if not has_name or pd.isna(r["ERP Item Name"]) else r["ERP Item Name"]),
                  wh={c: j(r[c]) for c in wh}, total=j(r["SOH Total"])) for _, r in sdf.iterrows()]
    return dict(items=items, whCols=wh, hasNameCol=has_name, meta=meta)


out = {"datasets": []}

real_master = S.load_master()
real_soh, real_meta = E.load_soh()
out["loaded_master"] = bom_json(real_master)
out["loaded_soh"] = soh_json(real_soh, real_meta)


def synth(master, soh_df):
    """Fractional quantities/rates/stock to stress floor/round/sum boundaries."""
    m = master.copy()
    fr = [0.1, 0.2, 0.3, 1 / 3, 0.25, 0.125, 0.05, 2.5, 0.7, 1.1, 0.01, 0.001]
    m[C.COL_QTY] = [random.choice(fr + [1, 2, 3, 0, None, 1.5, 4]) for _ in range(len(m))]
    m[C.COL_RATE] = [random.choice([0.1, 0.2, 9.9, 1.005, 2.675, 0.125, None, 3.3333, 12.345, 0.0]) for _ in range(len(m))]
    m.loc[m.sample(frac=0.03, random_state=1).index, C.COL_PM_CODE] = ""
    s = soh_df.copy()
    codes = set(m[C.COL_PM_CODE])
    s = s[s["Item Code"].isin(codes) | (np.random.rand(len(s)) < 0.02)].copy()
    whc = [c for c in s.columns if "stock balance" in c.lower()]
    for c in whc + ["SOH Total"]:
        s[c] = [random.choice([0, 0.3, 1, 2.5, 7, 10.1, 100, 333.3, 1000, 12.5, 0.1 + 0.2, 55.55]) for _ in range(len(s))]
    s = s.sample(frac=0.9, random_state=3)  # some PMs missing from SOH
    return S.normalize(m), s.reset_index(drop=True)


empty_soh = pd.DataFrame(columns=["Item Code", "SOH Total"])
sets = [("real", real_master, real_soh), ("synthetic", *synth(real_master, real_soh)), ("empty_soh", real_master, empty_soh)]

for name, master, sdf in sets:
    SOH["df"] = sdf
    ds = {"name": name, "master": bom_json(master), "soh": soh_json(sdf, {}), "suggestions": {}, "search": [], "order": []}
    for field in ["Any", "FG Code", "FG Name", "PM Code", "PM Name"]:
        sg = ns["suggestions"](master, field)
        ds["suggestions"][field] = [[k, v[0], v[1]] for k, v in sg.items()]
    words = list({w for t in master[C.COL_FG_NAME].tolist() + master[C.COL_PM_NAME].tolist() for w in str(t).split()})
    for i in range(160):
        field = random.choice(["Any", "FG Code", "FG Name", "PM Code", "PM Name"])
        sg = ns["suggestions"](master, field)
        keys = list(sg)
        picks = []
        for _ in range(random.choice([0, 1, 1, 2, 3])):
            r = random.random()
            if r < 0.5 and keys:
                picks.append(random.choice(keys))
            elif r < 0.8:
                picks.append(" ".join(random.sample(words, random.choice([1, 1, 2]))).lower()[: random.randint(2, 12)])
            else:
                picks.append(random.choice(["fgc0", "pkg3", "box", "  wax   paper ", "zzz", "Truffle", "a"]))
        full = random.random() < 0.6
        split = random.random() < 0.5
        res = ns["search"](master, field, picks, sg, full)
        view = ns["attach_soh"](res, split).drop(columns=[C.COL_ROW_ID])
        zero = int((view["SOH Total"].fillna(-1) == 0).sum()) if "SOH Total" in view else 0
        fgs = ns["fg_summary"](ns["attach_soh"](res, False))
        ds["search"].append(dict(field=field, picks=picks, full=full, split=split, rowIds=res[C.COL_ROW_ID].tolist(),
                                 view=records(view), zeroSoh=zero, nFg=int(view[C.COL_FG_CODE].nunique()), fgSummary=records(fgs)))
    fg_codes = list(dict.fromkeys(master[C.COL_FG_CODE]))
    for i in range(160):
        picked = random.sample(fg_codes, random.randint(1, min(15, len(fg_codes))))
        qtys = [random.choice([0, 1, 5, 10, 50, 100, 250, 999, 1000, 3333, 10000, random.randint(0, 20000)]) for _ in picked]
        order = pd.DataFrame({C.COL_FG_CODE: picked, "Order Qty": qtys})
        o = order[order["Order Qty"].fillna(0) > 0]
        if o.empty:
            continue
        fg_v, pm_v, line_v = ns["order_check"](master, o.reset_index(drop=True))
        ds["order"].append(dict(order=[{"fgCode": a, "orderQty": int(b)} for a, b in zip(o[C.COL_FG_CODE], o["Order Qty"])],
                                fg=records(fg_v), pm=records(pm_v), lines=records(line_v)))
    out["datasets"].append(ds)

# ── bom_store: diff / validate / data_warnings / replace_fg_in ──
m0 = real_master.copy()
dcases = []
for i in range(80):
    n = m0.copy()
    for _ in range(random.randint(1, 12)):
        op = random.random()
        idx = random.choice(n.index.tolist())
        if op < 0.35:
            col = random.choice([C.COL_QTY, C.COL_RATE, C.COL_UOM, C.COL_PM_NAME, C.COL_PM_CODE, C.COL_FG_NAME])
            if col in (C.COL_QTY, C.COL_RATE):
                n.loc[idx, col] = random.choice([0, 1, 2.5, 0.1, 1e-05, 123456.789, None, -1, 1e17, 3.0])
            else:
                n.loc[idx, col] = random.choice(["nos.", "kg", "", "New name", "PKG9999", "pkg3680"])
        elif op < 0.55:
            n = n.drop(index=idx)
        elif op < 0.75:
            r = n.loc[idx].copy()
            r[C.COL_ROW_ID] = f"{random.getrandbits(40):010x}"
            r[C.COL_QTY] = random.choice([1, 0.5, None])
            n = pd.concat([n, r.to_frame().T], ignore_index=True)
        elif op < 0.85:
            fg = random.choice(n[C.COL_FG_CODE].unique().tolist())
            n = n[n[C.COL_FG_CODE] != fg]
        else:
            r = n.loc[idx].copy()
            r[C.COL_FG_CODE] = f"FGX{random.randint(0, 99):02d}"
            r[C.COL_ROW_ID] = f"{random.getrandbits(40):010x}"
            n = pd.concat([n, r.to_frame().T], ignore_index=True)
        n = n.reset_index(drop=True)
    n = S.normalize(n)
    fg_pick = random.choice(n[C.COL_FG_CODE].unique().tolist() + ["", "NEWFG"])
    sub = n[n[C.COL_FG_CODE] == n[C.COL_FG_CODE].iloc[0]].copy()
    sub[C.COL_FG_CODE] = fg_pick or "Q1"
    replaced = S.replace_fg_in(n, fg_pick, sub)
    dcases.append(dict(old=bom_json(m0), new=bom_json(n), diff=records(S.diff(m0, n)),
                       validate=S.validate(n, only_fgs=[fg_pick]), validateAll=S.validate(n), warnings=S.data_warnings(n),
                       replaceFg=fg_pick, replaceRows=bom_json(sub), replaced=[r for r in bom_json(replaced)]))
    for r in dcases[-1]["replaced"]:
        pass
    m0 = n if random.random() < 0.3 else m0
out["diff"] = dcases

# ── normalize / clean_code on messy input ──
messy = pd.DataFrame({C.COL_FG_CODE: [" fgc001\xa0", None, "", 12345, 1.5, "abc"], C.COL_FG_NAME: [" A ", None, "", "x", 2.0, "y"],
                      C.COL_PM_CODE: ["pkg1", "", "", None, "p", " z "], C.COL_PM_NAME: ["n", "", "", "q", None, "w"],
                      C.COL_QTY: ["1.5", "abc", None, 2, "  3 ", "1e3"], C.COL_UOM: [None, "kg", "", 1.0, "g", "m"],
                      C.COL_RATE: [9.9, "x", None, "0.1", "", "-2"], C.COL_ROW_ID: ["a1", "b2", "c3", "d4", "e5", "f6"]})
out["normalize"] = dict(input=records(messy.astype(object).where(messy.notna(), None)), output=bom_json(S.normalize(messy)))

# ── drystock_to_soh ──
dry_cases = []
for k in range(4):
    d = real_soh.copy().rename(columns={"ERP Item Name": "Item Name"}).drop(columns=["SOH Total"])
    d = d.sample(frac=0.3, random_state=k)
    dup = d.sample(frac=0.2, random_state=10 + k).copy()
    dup["Item Code"] = dup["Item Code"].str.lower() + "\xa0"
    d = pd.concat([d, dup])
    whc = [c for c in d.columns if "stock balance" in c.lower()]
    for c in whc:
        d[c] = [random.choice([0, 0.1, 0.2, 1 / 3, 7, None, "12", "x", 2.5]) for _ in range(len(d))]
    if k == 3:
        d = d.drop(columns=["Item Name"])
    d = d.astype(object).where(d.notna(), None)
    res = E.drystock_to_soh(pd.DataFrame(d.to_dict("records")))
    dry_cases.append(dict(columns=list(d.columns), rows=records(d), out=soh_json(res, {})))
out["drystock"] = dry_cases

# ── number formatting & sums ──
nums = [0, 1, 2.5, 3.5, -2.5, 0.125, 0.375, 1.005, 2.675, 1234567.5, 0.5, 1.5, 1e-05, 123456.789, 1e16, 1e17, 1 / 3, 2 / 3,
        0.1 + 0.2, 99999.95, 1e21, -0.0, 12.345, 1e-07, 5e-324, 1234.5678, 1000000.0, 999999.5, 0.0001, 0.00001234]
nums += [random.uniform(-1e6, 1e6) for _ in range(300)] + [random.randint(0, 10 ** 6) / 8 for _ in range(300)]
out["fmt"] = [dict(x=x, g=format(x, "g"), f2=format(x, ".2f"), f0=format(x, ",.0f"), f1=format(x, ".1f"),
                   r1=float(np.round(np.float64(x), 1)), r2=float(round(np.float64(x), 2)), fmt=S._fmt(x)) for x in nums]
sums = []
for k in range(300):
    n = random.choice([1, 2, 3, 7, 8, 9, 15, 16, 17, 100, 129, 300, 1000])
    a = [random.choice([0.1, 0.2, 0.3, 1 / 3, 1e16, 1, 2.5, random.random()]) for _ in range(n)]
    sums.append(dict(a=a, series=float(pd.Series(a).sum()), grp=float(pd.DataFrame({"k": [1] * n, "v": a}).groupby("k")["v"].sum().iloc[0])))
out["sums"] = sums

with open(OUT, "w") as f:
    json.dump(out, f, ensure_ascii=False, allow_nan=False, default=str)
print("datasets", [(d["name"], len(d["search"]), len(d["order"])) for d in out["datasets"]], "diff", len(dcases))
