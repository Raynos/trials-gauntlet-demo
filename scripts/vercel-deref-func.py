"""Dereference a prebuilt Vercel function's pnpm symlinks: copy every filePathMap entry's real
directory into the .func tree and clear the map (the CLI/server stopped resolving those symlinks
on upload on 2026-09-16 — realpath ENOENT for /vercel/path0/node_modules/@vercel/blob)."""
import json, os, shutil, sys
func = sys.argv[1]
cfg_path = os.path.join(func, '.vc-config.json')
cfg = json.load(open(cfg_path))
for key in list(cfg['filePathMap'].keys()):
    src = os.path.realpath(key)
    dst = os.path.join(func, key)
    if os.path.islink(dst):
        os.remove(dst)
    elif os.path.isdir(dst):
        # already a real directory (from an earlier pass): leave it
        continue
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    shutil.copytree(src, dst, symlinks=False)
cfg['filePathMap'] = {}
json.dump(cfg, open(cfg_path, 'w'), indent=2)
print('dereferenced; symlinks left:', sum(1 for r, d, f in os.walk(func) for n in d + f if os.path.islink(os.path.join(r, n))))

# Hoist: every package under .pnpm/<x>/node_modules/<pkg> also at the function root, so Node's resolver finds
# @vercel/blob's dependencies from node_modules/@vercel/blob (pnpm's isolation needs the symlink farm we just removed).
nm = os.path.join(func, 'node_modules'); pn = os.path.join(nm, '.pnpm'); hoisted = 0
if os.path.isdir(pn):
    for entry in os.listdir(pn):
        inner = os.path.join(pn, entry, 'node_modules')
        if not os.path.isdir(inner): continue
        for pkg in os.listdir(inner):
            p = os.path.join(inner, pkg)
            names = [os.path.join(pkg, s) for s in os.listdir(p)] if pkg.startswith('@') else [pkg]
            for name in names:
                dst = os.path.join(nm, name)
                if os.path.exists(dst): continue
                os.makedirs(os.path.dirname(dst), exist_ok=True)
                shutil.copytree(os.path.join(inner, name), dst, symlinks=False); hoisted += 1
print('hoisted', hoisted)
