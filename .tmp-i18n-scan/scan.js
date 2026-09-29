const fs = require("fs");
const path = require("path");

const root = "F:/project/bifrost/ui/app/workspace/routing-rules";
const out = [];

function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith(".tsx") || e.name.endsWith(".ts")) out.push(p);
  }
}
walk(root);

const patterns = [
  ["JSX", />\s*([A-Za-z][^<>{}]{1,120}?)\s*</],
  ["ATTR", /(aria-label|placeholder|title|alt)\s*=\s*"([^"]{2,160})"/],
  ["STR", /"([A-Z][A-Za-z0-9 ,.'!?()\-/:&]{2,80})"/],
  ["TMPL", /`([^`]*[A-Za-z]{3}[^`]*)`/],
];

for (const f of out.sort()) {
  const src = fs.readFileSync(f, "utf8");
  const lines = src.split(/\r?\n/);
  const hits = [];
  lines.forEach((l, i) => {
    if (l.trim().startsWith("//") || l.trim().startsWith("*")) return;
    for (const [tag, re] of patterns) {
      const m = re.exec(l);
      if (m) hits.push(String(i + 1).padStart(4) + " [" + tag + "] " + l.trim());
    }
  });
  if (hits.length) {
    console.log("===== " + f.replace(root, "RR") + "  (" + hits.length + ") =====");
    console.log(hits.join("\n"));
  }
}
