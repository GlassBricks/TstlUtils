/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import * as assert from "assert"
import * as path from "path"
import * as ts from "typescript"
import {
  createAssignmentStatement,
  createBooleanLiteral,
  createNilLiteral,
  createStringLiteral,
  createTableExpression,
  createTableFieldExpression,
  createTableIndexExpression,
  File,
  getSourceDir,
  isCallExpression,
  LuaLibFeature,
  Plugin,
  TransformationContext,
  Visitors,
} from "typescript-to-lua"
import {transformExpressionList} from "typescript-to-lua/dist/transformation/visitors/expression-list"
import {createSerialDiagnosticFactory} from "typescript-to-lua/dist/utils"

const useNilInstead = createSerialDiagnosticFactory((node: ts.Node) => ({
  file: ts.getOriginalNode(node).getSourceFile(),
  start: ts.getOriginalNode(node).getStart(),
  length: ts.getOriginalNode(node).getWidth(),
  messageText: "Use nil instead of undefined.",
  category: ts.DiagnosticCategory.Warning,
}))
const useEqualsEquals = createSerialDiagnosticFactory((node: ts.Node) => ({
  file: ts.getOriginalNode(node).getSourceFile(),
  start: ts.getOriginalNode(node).getStart(),
  length: ts.getOriginalNode(node).getWidth(),
  messageText: "Use == instead of ===.",
  category: ts.DiagnosticCategory.Warning,
}))
const useNotEquals = createSerialDiagnosticFactory((node: ts.Node) => ({
  file: ts.getOriginalNode(node).getSourceFile(),
  start: ts.getOriginalNode(node).getStart(),
  length: ts.getOriginalNode(node).getWidth(),
  messageText: "Use != instead of !==.",
  category: ts.DiagnosticCategory.Warning,
}))

const spreadNotSupported = createSerialDiagnosticFactory((node: ts.Node) => ({
  file: ts.getOriginalNode(node).getSourceFile(),
  start: ts.getOriginalNode(node).getStart(),
  length: ts.getOriginalNode(node).getWidth(),
  messageText: "Spread is not supported in newLuaSet.",
  category: ts.DiagnosticCategory.Error,
}))

const firstParamShouldBeRegex = createSerialDiagnosticFactory((node: ts.Node) => ({
  file: ts.getOriginalNode(node).getSourceFile(),
  start: ts.getOriginalNode(node).getStart(),
  length: ts.getOriginalNode(node).getWidth(),
  messageText: "This must be called with a string literal, representing a regex.",
  category: ts.DiagnosticCategory.Error,
}))

interface PluginOptions {
  replaceDotWithDash?: boolean
}

function transformLuaSetNewCall(context: TransformationContext, node: ts.CallExpression) {
  let args = node.arguments ?? []
  if (args.length === 1 && ts.isSpreadElement(args[0]) && ts.isArrayLiteralExpression(args[0].expression)) {
    args = args[0].expression.elements
  }
  if (args.some(ts.isSpreadElement)) {
    context.diagnostics.push(spreadNotSupported(node))
  }

  const expressions = transformExpressionList(context, args)
  return createTableExpression(
    expressions.map((e) => createTableFieldExpression(createBooleanLiteral(true), e)),
    node,
  )
}

function transformKeysCall(context: TransformationContext, node: ts.CallExpression) {
  const typeArgs = node.typeArguments
  if (!typeArgs || typeArgs.length !== 1) {
    return createTableExpression(undefined, node)
  }
  const type = context.checker.getTypeFromTypeNode(typeArgs[0])
  const keys = context.checker.getPropertiesOfType(type)
  return createTableExpression(
    keys.map((k) => createTableFieldExpression(createStringLiteral(k.name))),
    node,
  )
}

function transformKeySetCall(context: TransformationContext, node: ts.CallExpression) {
  const typeArgs = node.typeArguments
  if (!typeArgs || typeArgs.length !== 1) {
    return createTableExpression(undefined, node)
  }
  const type = context.checker.getTypeFromTypeNode(typeArgs[0])
  const keys = context.checker.getPropertiesOfType(type)
  return createTableExpression(
    keys.map((k) => createTableFieldExpression(createBooleanLiteral(true), createStringLiteral(k.name))),
    node,
  )
}

function transformGetFilesMatchingPatternCall(context: TransformationContext, node: ts.CallExpression, options: PluginOptions) {

  const firstParam = node.arguments[0]
  if (!firstParam || !ts.isStringLiteral(firstParam)) {
    context.diagnostics.push(firstParamShouldBeRegex(node))
    return context.superTransformExpression(node)
  }

  const patternRegex = new RegExp(firstParam.text)
  const rootDir = getSourceDir(context.program)
  const sourceFiles = context.program.getSourceFiles()
  const fields = sourceFiles
    .filter((f) => patternRegex.test(f.fileName))
    .map((f) => {
      let filePath = path.relative(rootDir, f.fileName).replace(/\\/g, "/")
      // remove extension
      filePath = filePath.substring(0, filePath.lastIndexOf("."))
      // replace remaining . with -
      if (options.replaceDotWithDash) {
        filePath = filePath.replace(/\./g, "-")
      }
      return createTableFieldExpression(createStringLiteral(filePath))
    })
  return createTableExpression(fields)
}

function createPlugin(options: PluginOptions): Plugin {

  let newLuaSetSymbol: ts.Symbol | undefined
  let getTestFilesSymbol: ts.Symbol | undefined
  let nilSymbol: ts.Symbol | undefined
  let assumeSymbol: ts.Symbol | undefined
  let keysSymbol: ts.Symbol | undefined
  let keySetSymbol: ts.Symbol | undefined
  const beforeTransform: Plugin["beforeTransform"] = (program) => {
    const checker = program.getTypeChecker()
    const extensionsFile = program.getSourceFile(path.resolve(__dirname, "index.d.ts"))
    if (!extensionsFile) return
    const definedSymbolsByName = new Map<string, ts.Symbol>()
    for (const f of extensionsFile.statements) {
      if (ts.isFunctionDeclaration(f)) {
        definedSymbolsByName.set(f.name!.getText(), checker.getSymbolAtLocation(f.name!)!)
      } else if (ts.isVariableStatement(f)) {
        for (const d of f.declarationList.declarations) {
          definedSymbolsByName.set(d.name.getText(), checker.getSymbolAtLocation(d.name)!)
        }
      }
    }
    newLuaSetSymbol = definedSymbolsByName.get("newLuaSet")
    getTestFilesSymbol = definedSymbolsByName.get("getProjectFilesMatchingRegex")
    nilSymbol = definedSymbolsByName.get("nil")
    assumeSymbol = definedSymbolsByName.get("assume")
    keysSymbol = definedSymbolsByName.get("keys")
    keySetSymbol = definedSymbolsByName.get("keySet")
  }

  const visitors: Visitors = {
    [ts.SyntaxKind.DeleteExpression](node: ts.DeleteExpression, context: TransformationContext) {
      if (ts.isOptionalChain(node.expression)) return context.superTransformExpression(node)
      const deleteCall = context.superTransformExpression(node)
      assert(isCallExpression(deleteCall))
      // replace with set property to nil
      const table = deleteCall.params[0]
      const key = deleteCall.params[1]
      context.addPrecedingStatements(
        createAssignmentStatement(createTableIndexExpression(table, key), createNilLiteral(), node),
      )
      return createBooleanLiteral(true)
    },
    [ts.SyntaxKind.SourceFile](node, context) {
      const [result] = context.superTransformNode(node) as [File]
      context.usedLuaLibFeatures.delete(LuaLibFeature.Delete) // replaced by above
      return result
    },
    [ts.SyntaxKind.CallExpression](node: ts.CallExpression, context: TransformationContext) {
      // handle special case when call = __getTestFiles(), replace with list of files
      const callSymbol = context.checker.getSymbolAtLocation(node.expression)
      switch (callSymbol) {
        case getTestFilesSymbol:
          return transformGetFilesMatchingPatternCall(context, node, options)
        case newLuaSetSymbol:
          return transformLuaSetNewCall(context, node)
        case assumeSymbol:
          return createNilLiteral()
        case keysSymbol:
          return transformKeysCall(context, node)
        case keySetSymbol:
          return transformKeySetCall(context, node)
      }
      return context.superTransformExpression(node)
    },
    [ts.SyntaxKind.Identifier](node: ts.Identifier, context: TransformationContext) {
      const symbol = context.checker.getSymbolAtLocation(node)
      if (symbol === nilSymbol) return createNilLiteral(node)
      if (node.originalKeywordKind === ts.SyntaxKind.UndefinedKeyword) {
        context.diagnostics.push(useNilInstead(node))
      }
      return context.superTransformExpression(node)
    },
    [ts.SyntaxKind.BinaryExpression](node: ts.BinaryExpression, context: TransformationContext) {
      if (node.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken) {
        context.diagnostics.push(useEqualsEquals(node))
      } else if (node.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsEqualsToken) {
        context.diagnostics.push(useNotEquals(node))
      }
      return context.superTransformExpression(node)
    },
  }

  return {
    beforeTransform,
    visitors,
    beforeEmit(program, __, ___, files) {
      if (options.replaceDotWithDash) {
        if (files.length === 0) return
        for (const file of files) {
          const outPath = file.outputPath
          if (!outPath.endsWith(".lua")) continue
          const fileName = path.basename(outPath, ".lua")
          // replace . with - in file name
          const newFileName = fileName.replace(/\./g, "-")
          if (fileName === newFileName) continue
          file.outputPath = path.join(path.dirname(outPath), newFileName + ".lua")
        }
      }
    },
  }
}

// noinspection JSUnusedGlobalSymbols
export default createPlugin
