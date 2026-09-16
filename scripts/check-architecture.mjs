import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const failures = [];
function walk(directory) {
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory()
        ? walk(path.join(directory, entry.name))
        : [path.join(directory, entry.name)],
    );
}
function runtimeImports(file) {
  const ast = ts.createSourceFile(
    file,
    fs.readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const imports = [];
  function visit(node) {
    if (ts.isImportDeclaration(node)) {
      const clause = node.importClause;
      const named = clause?.namedBindings;
      const typeOnly =
        clause?.isTypeOnly ||
        (!clause?.name &&
          named &&
          ts.isNamedImports(named) &&
          named.elements.every((item) => item.isTypeOnly));
      if (!typeOnly && ts.isStringLiteral(node.moduleSpecifier))
        imports.push(node.moduleSpecifier.text);
    } else if (
      ts.isExportDeclaration(node) &&
      !node.isTypeOnly &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      imports.push(node.moduleSpecifier.text);
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require")) &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      imports.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return imports;
}
function resolvedImport(file, specifier) {
  if (specifier.startsWith("@/")) return path.resolve("src", specifier.slice(2));
  if (specifier.startsWith(".")) return path.resolve(path.dirname(file), specifier);
  return null;
}
for (const file of [...walk("src/components"), ...walk("src/hooks")].filter((file) =>
  /\.[jt]sx?$/.test(file),
)) {
  for (const specifier of runtimeImports(file)) {
    const target = resolvedImport(file, specifier);
    const databaseDriver = /^(better-sqlite3|dexie|rxdb)(\/|$)/.test(specifier);
    const server = target?.startsWith(path.resolve("src/server") + path.sep);
    const localDatabase =
      target?.replace(/\.[jt]s$/, "") === path.resolve("src/lib/storage/local/database");
    if (databaseDriver || server || localDatabase)
      failures.push(`${file}: UI must not import server/database implementations (${specifier}).`);
  }
}
// Community services must not acquire a private-library or browser-storage dependency.
for (const file of walk("src/server/community").filter((file) => file.endsWith(".ts"))) {
  for (const specifier of runtimeImports(file)) {
    const target = resolvedImport(file, specifier);
    if (
      target &&
      [
        "src/server/repo",
        "src/server/files",
        "src/server/sync",
        "src/server/drive",
        "src/lib/storage",
      ].some(
        (boundary) =>
          target === path.resolve(boundary) || target.startsWith(path.resolve(boundary) + path.sep),
      )
    )
      failures.push(`${file}: community must not import private library services (${specifier}).`);
  }
}
for (const file of [
  "AGENTS.md",
  "CLAUDE.md",
  "docs/contributing.md",
  "docs/architecture/overview.md",
  "docs/architecture/offline-sync.md",
  "docs/decisions/0001-local-first-reading.md",
  "docs/architecture/community.md",
  "docs/decisions/0002-community-pilot.md",
]) {
  if (!fs.existsSync(file)) failures.push(`Missing contributor contract: ${file}`);
}
if (!fs.readFileSync("CLAUDE.md", "utf8").includes("AGENTS.md"))
  failures.push("CLAUDE.md must point to the canonical AGENTS.md.");
if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else console.log("Architecture boundaries and contributor entry points passed.");
