const fs = require("fs");
for (const f of ["en", "zh-CN"]) {
	const s = fs.readFileSync("ui/lib/locales/" + f + ".json", "utf8");
	const L = s.split("\n");
	const i = L.findIndex((l) => /routingRules/.test(l) && /:\s*\{\s*$/.test(l));
	console.log(f, "routingRules starts at 1-based line", i + 1, JSON.stringify(L[i]));
	console.log("  first:", JSON.stringify(L[i]));
	console.log("  sample keys:", JSON.stringify(L.slice(i + 1, i + 4)));
	console.log("  close:", JSON.stringify(L.slice(i + 33, i + 37)));
	console.log("  last3:", JSON.stringify(L.slice(-4)));
	console.log("  lines:", L.length);
}
