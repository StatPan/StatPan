import { mkdirSync, writeFileSync } from "node:fs";

const owner = process.env.GITHUB_REPOSITORY_OWNER || process.argv[2] || "StatPan";
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
const apiBase = "https://api.github.com";

async function github(path) {
  const response = await fetch(`${apiBase}${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub API ${response.status} for ${path}`);
  }
  return response.json();
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

const palette = [
  "#58A6FF",
  "#F1E05A",
  "#3178C6",
  "#DEA584",
  "#00ADD8",
  "#F97583",
  "#A371F7",
  "#79C0FF",
  "#56D364",
  "#FFA657",
];

const languageColors = {
  C: "#555555",
  "C#": "#178600",
  "C++": "#F34B7D",
  CSS: "#563D7C",
  Go: "#00ADD8",
  HTML: "#E34C26",
  Java: "#B07219",
  JavaScript: "#F1E05A",
  Kotlin: "#A97BFF",
  PHP: "#4F5D95",
  Python: "#3572A5",
  Rust: "#DEA584",
  Shell: "#89E051",
  Swift: "#F05138",
  TypeScript: "#3178C6",
};

const repos = [];
for (let page = 1; ; page += 1) {
  const batch = await github(
    `/users/${encodeURIComponent(owner)}/repos?type=owner&visibility=public&per_page=100&page=${page}`,
  );
  repos.push(...batch);
  if (batch.length < 100) break;
}

const languageTotals = new Map();
for (let start = 0; start < repos.length; start += 8) {
  const batch = repos.slice(start, start + 8).filter((repo) => !repo.fork);
  const results = await Promise.all(batch.map((repo) => github(`/repos/${owner}/${repo.name}/languages`)));
  for (const languages of results) {
    for (const [language, bytes] of Object.entries(languages)) {
      languageTotals.set(language, (languageTotals.get(language) || 0) + bytes);
    }
  }
}

const sorted = [...languageTotals.entries()].sort((a, b) => b[1] - a[1]);
const totalBytes = sorted.reduce((sum, [, bytes]) => sum + bytes, 0);
if (!totalBytes) throw new Error("No public repository language data found");

const visible = sorted.slice(0, 7).map(([name, bytes]) => ({ name, bytes }));
const otherBytes = sorted.slice(7).reduce((sum, [, bytes]) => sum + bytes, 0);
if (otherBytes) visible.push({ name: "Other", bytes: otherBytes });

const languages = visible.map(({ name, bytes }) => ({ name, bytes }));
const percentages = languages.map(({ name, bytes }, index) => ({
  name,
  bytes,
  pct: (bytes / totalBytes) * 100,
  color: name === "Other" ? "#6E7681" : languageColors[name] || palette[index % palette.length],
}));

const width = 1000;
const height = 420;
const cx = 205;
const cy = 233;
const radius = 112;
const circumference = 2 * Math.PI * radius;
let offset = 0;
const donut = percentages.map(({ pct, color }) => {
  const length = (pct / 100) * circumference;
  const segment = `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="${color}" stroke-width="28" stroke-dasharray="${Math.max(length - 2.5, 0)} ${circumference}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${cx} ${cy})"/>`;
  offset += length;
  return segment;
}).join("");

const maxPct = Math.max(...percentages.map(({ pct }) => pct));
const rows = percentages.map(({ name, pct, color }, index) => {
  const column = Math.floor(index / 4);
  const row = index % 4;
  const x = 390 + column * 290;
  const y = 132 + row * 59;
  const label = name.length > 17 ? `${name.slice(0, 16)}…` : name;
  const barWidth = Math.max((pct / maxPct) * 220, 4);
  return `<g transform="translate(${x} ${y})"><circle cx="5" cy="5" r="5" fill="${color}"/><text x="20" y="9" fill="#E6EDF3" font-size="16" font-weight="600">${escapeXml(label)}</text><text x="250" y="9" text-anchor="end" fill="#8B949E" font-size="15">${pct.toFixed(1)}%</text><rect x="20" y="22" width="220" height="6" rx="3" fill="#252B48"/><rect x="20" y="22" width="${barWidth.toFixed(1)}" height="6" rx="3" fill="${color}"/></g>`;
}).join("");

const today = new Date().toISOString().slice(0, 10);
const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
  <title id="title">${escapeXml(owner)} language breakdown</title>
  <desc id="desc">Programming language percentages across public non-fork repositories.</desc>
  <defs>
    <linearGradient id="background" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#0B1020"/><stop offset="100%" stop-color="#171D35"/></linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#000000" flood-opacity="0.28"/></filter>
  </defs>
  <rect x="8" y="8" width="984" height="404" rx="24" fill="url(#background)" stroke="#2B355C" filter="url(#shadow)"/>
  <text x="44" y="56" fill="#F0F6FC" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" font-size="22" font-weight="700" letter-spacing="2">LANGUAGE BREAKDOWN</text>
  <text x="44" y="82" fill="#8B949E" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" font-size="14">Public repositories · GitHub Linguist · updated ${today}</text>
  <circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="#252B48" stroke-width="28"/>
  ${donut}
  <circle cx="${cx}" cy="${cy}" r="78" fill="#11172A"/>
  <text x="${cx}" y="${cy - 3}" text-anchor="middle" fill="#F0F6FC" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" font-size="25" font-weight="700">${percentages.length}</text>
  <text x="${cx}" y="${cy + 22}" text-anchor="middle" fill="#8B949E" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" font-size="13" letter-spacing="1.5">LANGUAGES</text>
  ${rows}
  <text x="44" y="383" fill="#6E7681" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" font-size="12">Forks excluded · percentages are based on detected code bytes</text>
</svg>
`;

mkdirSync("assets", { recursive: true });
writeFileSync("assets/languages.svg", svg);
console.log(`Generated assets/languages.svg from ${repos.filter((repo) => !repo.fork).length} public non-fork repositories.`);
