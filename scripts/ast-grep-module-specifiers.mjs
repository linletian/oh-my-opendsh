// Collect module specifiers from a FULL TypeScript AST, never from comments or
// string contents. Shared by c29 and the hook's barrel-integrity unit test.
import { API } from 'typescript/unstable/sync'
import {
  isCallExpression,
  isExportDeclaration,
  isImportDeclaration,
  isStringLiteralLikeNode,
  SyntaxKind,
} from 'typescript/unstable/ast'

export function collectModuleSpecifiers(filePath, cwd = process.cwd()) {
  const api = new API({ cwd })
  try {
    const snapshot = api.updateSnapshot({ openFiles: [filePath] })
    const project = snapshot.getDefaultProjectForFile(filePath)
    const sourceFile = project?.program.getSourceFile(filePath)
    if (sourceFile === undefined) throw new Error(`TypeScript could not parse ${filePath} into a source file`)
    const staticSpecifiers = []
    const moduleSpecifiers = []
    const visit = (node) => {
      if ((isImportDeclaration(node) || isExportDeclaration(node))
        && node.moduleSpecifier !== undefined && isStringLiteralLikeNode(node.moduleSpecifier)) {
        // import … from 'x' / export … from 'x', and side-effect import 'x'.
        staticSpecifiers.push(node.moduleSpecifier.text)
        moduleSpecifiers.push(node.moduleSpecifier.text)
      } else if (isCallExpression(node) && node.expression.kind === SyntaxKind.ImportKeyword) {
        // Dynamic import('x'), including comments around the argument.
        const [specifier] = node.arguments
        if (specifier !== undefined && isStringLiteralLikeNode(specifier)) moduleSpecifiers.push(specifier.text)
      }
      node.forEachChild(visit)
    }
    visit(sourceFile)
    return { staticSpecifiers, moduleSpecifiers }
  } finally {
    api.close()
  }
}
