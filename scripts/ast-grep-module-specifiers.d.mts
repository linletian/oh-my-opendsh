export declare function collectModuleSpecifiers(filePath: string, cwd?: string): {
  staticSpecifiers: string[]
  moduleSpecifiers: string[]
  unresolvedDynamicImports: string[]
}
