import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

const roots = ['src/app', 'src/components', 'src/modules']
const attributes = new Set([
  'aria-label',
  'placeholder',
  'title',
  'label',
  'description',
  'confirmLabel',
  'cancelLabel',
  'accessibleLabel',
  'emptyText',
])
const properties = new Set([
  'label',
  'title',
  'description',
  'help',
  'message',
  'emptyText',
  'confirmLabel',
  'cancelLabel',
  'accessibleLabel',
])
const files = []

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name)
    if (entry.isDirectory()) walk(file)
    else if (file.endsWith('.tsx')) files.push(file)
  }
}

function addFinding(findings, sourceFile, node, value, kind) {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (!/[A-Za-z]{2}/.test(normalized) || normalized.includes('://')) return
  findings.push({
    file: sourceFile.fileName,
    line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
    kind,
    value: normalized,
  })
}

function inspect(file) {
  const source = fs.readFileSync(file, 'utf8')
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  const findings = []

  function visit(node) {
    if (ts.isJsxText(node)) addFinding(findings, sourceFile, node, node.text, 'text')
    if (
      ts.isJsxAttribute(node) &&
      attributes.has(node.name.text) &&
      node.initializer &&
      ts.isStringLiteral(node.initializer)
    ) {
      addFinding(findings, sourceFile, node, node.initializer.text, 'attribute')
    }
    if (
      ts.isPropertyAssignment(node) &&
      ts.isIdentifier(node.name) &&
      properties.has(node.name.text) &&
      ts.isStringLiteral(node.initializer)
    ) {
      addFinding(findings, sourceFile, node, node.initializer.text, 'property')
    }
    if (ts.isJsxExpression(node) && node.expression && ts.isStringLiteral(node.expression)) {
      addFinding(findings, sourceFile, node, node.expression.text, 'expression')
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return findings
}

for (const root of roots) walk(root)

const findings = files.flatMap(inspect)
for (const finding of findings) {
  console.log(`${finding.file}:${finding.line} [${finding.kind}] ${finding.value}`)
}

if (findings.length > 0) process.exitCode = 1
