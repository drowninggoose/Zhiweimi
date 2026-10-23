import hashlib, os, io, json

SRC = r"C:\Users\20587\Documents\ChatGPT\“仓颉杯”美食APP开发"
DST = r"C:\Users\20587\Desktop\知味咪"
SKIP = {"node_modules", ".git", "dist", ".tmp", "tmp", "output", "playwright-report",
        ".latest-merge", ".task-cooking-ai", ".backups", "_mascot-backup-20261021-1500",
        "_motion-v3-backup-20261022", "_ui-backup-20261021-1330"}

def walk(root):
    res = {}
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP]
        for fn in filenames:
            full = os.path.join(dirpath, fn)
            rel = os.path.relpath(full, root)
            try:
                res[rel] = os.path.getsize(full)
            except OSError:
                pass
    return res

def h(p):
    try:
        with open(p, "rb") as f:
            return hashlib.sha256(f.read()).hexdigest()
    except OSError:
        return None

a, b = walk(SRC), walk(DST)
only_a = sorted(set(a) - set(b))
only_b = sorted(set(b) - set(a))
common = sorted(set(a) & set(b))
diff = [r for r in common if a[r] != b[r] or h(os.path.join(SRC, r)) != h(os.path.join(DST, r))]
same = len(common) - len(diff)

stat = {
    "src_files": len(a), "dst_files": len(b),
    "only_src": len(only_a), "only_dst": len(only_b),
    "common": len(common), "differing": len(diff), "identical": same,
}
out = io.open(r"C:\Users\20587\Desktop\知味咪\compare.txt", "w", encoding="utf-8")
print(json.dumps(stat, ensure_ascii=False, indent=2), file=out)
print("\n--- ONLY IN SRC (%d) ---" % len(only_a), file=out)
for r in only_a: print(" ", r, file=out)
print("\n--- ONLY IN DST (%d) ---" % len(only_b), file=out)
for r in only_b: print(" ", r, file=out)
print("\n--- DIFFERING (%d) ---" % len(diff), file=out)
for r in diff[:400]: print(" ", r, file=out)
out.close()
print(json.dumps(stat, ensure_ascii=False))
