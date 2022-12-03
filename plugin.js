"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const path = require("path");
const ts = require("typescript");
const typescript_to_lua_1 = require("typescript-to-lua");
const expression_list_1 = require("typescript-to-lua/dist/transformation/visitors/expression-list");
const utils_1 = require("typescript-to-lua/dist/utils");
const useNilInstead = (0, utils_1.createSerialDiagnosticFactory)((node) => ({
    file: ts.getOriginalNode(node).getSourceFile(),
    start: ts.getOriginalNode(node).getStart(),
    length: ts.getOriginalNode(node).getWidth(),
    messageText: "Use nil instead of undefined.",
    category: ts.DiagnosticCategory.Warning,
}));
const useEqualsEquals = (0, utils_1.createSerialDiagnosticFactory)((node) => ({
    file: ts.getOriginalNode(node).getSourceFile(),
    start: ts.getOriginalNode(node).getStart(),
    length: ts.getOriginalNode(node).getWidth(),
    messageText: "Use == instead of ===.",
    category: ts.DiagnosticCategory.Warning,
}));
const useNotEquals = (0, utils_1.createSerialDiagnosticFactory)((node) => ({
    file: ts.getOriginalNode(node).getSourceFile(),
    start: ts.getOriginalNode(node).getStart(),
    length: ts.getOriginalNode(node).getWidth(),
    messageText: "Use != instead of !==.",
    category: ts.DiagnosticCategory.Warning,
}));
const spreadNotSupported = (0, utils_1.createSerialDiagnosticFactory)((node) => ({
    file: ts.getOriginalNode(node).getSourceFile(),
    start: ts.getOriginalNode(node).getStart(),
    length: ts.getOriginalNode(node).getWidth(),
    messageText: "Spread is not supported in newLuaSet.",
    category: ts.DiagnosticCategory.Error,
}));
const firstParamShouldBeRegex = (0, utils_1.createSerialDiagnosticFactory)((node) => ({
    file: ts.getOriginalNode(node).getSourceFile(),
    start: ts.getOriginalNode(node).getStart(),
    length: ts.getOriginalNode(node).getWidth(),
    messageText: "This must be called with a string literal, representing a regex.",
    category: ts.DiagnosticCategory.Error,
}));
function transformLuaSetNewCall(context, node) {
    let args = node.arguments ?? [];
    if (args.length === 1 && ts.isSpreadElement(args[0]) && ts.isArrayLiteralExpression(args[0].expression)) {
        args = args[0].expression.elements;
    }
    if (args.some(ts.isSpreadElement)) {
        context.diagnostics.push(spreadNotSupported(node));
    }
    const expressions = (0, expression_list_1.transformExpressionList)(context, args);
    return (0, typescript_to_lua_1.createTableExpression)(expressions.map((e) => (0, typescript_to_lua_1.createTableFieldExpression)((0, typescript_to_lua_1.createBooleanLiteral)(true), e)), node);
}
function transformKeysCall(context, node) {
    const typeArgs = node.typeArguments;
    if (!typeArgs || typeArgs.length !== 1) {
        return (0, typescript_to_lua_1.createTableExpression)(undefined, node);
    }
    const type = context.checker.getTypeFromTypeNode(typeArgs[0]);
    const keys = context.checker.getPropertiesOfType(type);
    return (0, typescript_to_lua_1.createTableExpression)(keys.map((k) => (0, typescript_to_lua_1.createTableFieldExpression)((0, typescript_to_lua_1.createStringLiteral)(k.name))), node);
}
function transformKeySetCall(context, node) {
    const typeArgs = node.typeArguments;
    if (!typeArgs || typeArgs.length !== 1) {
        return (0, typescript_to_lua_1.createTableExpression)(undefined, node);
    }
    const type = context.checker.getTypeFromTypeNode(typeArgs[0]);
    const keys = context.checker.getPropertiesOfType(type);
    return (0, typescript_to_lua_1.createTableExpression)(keys.map((k) => (0, typescript_to_lua_1.createTableFieldExpression)((0, typescript_to_lua_1.createBooleanLiteral)(true), (0, typescript_to_lua_1.createStringLiteral)(k.name))), node);
}
function transformGetFilesMatchingPatternCall(context, node, options) {
    const firstParam = node.arguments[0];
    if (!firstParam || !ts.isStringLiteral(firstParam)) {
        context.diagnostics.push(firstParamShouldBeRegex(node));
        return context.superTransformExpression(node);
    }
    const patternRegex = new RegExp(firstParam.text);
    const rootDir = (0, typescript_to_lua_1.getSourceDir)(context.program);
    const sourceFiles = context.program.getSourceFiles();
    const fields = sourceFiles
        .filter((f) => patternRegex.test(f.fileName))
        .map((f) => {
        let filePath = path.relative(rootDir, f.fileName).replace(/\\/g, "/");
        // remove extension
        filePath = filePath.substring(0, filePath.lastIndexOf("."));
        // replace remaining . with -
        if (options.replaceDotWithDash) {
            filePath = filePath.replace(/\./g, "-");
        }
        return (0, typescript_to_lua_1.createTableFieldExpression)((0, typescript_to_lua_1.createStringLiteral)(filePath));
    });
    return (0, typescript_to_lua_1.createTableExpression)(fields);
}
function createPlugin(options) {
    let newLuaSetSymbol;
    let getTestFilesSymbol;
    let nilSymbol;
    let assumeSymbol;
    let keysSymbol;
    let keySetSymbol;
    const beforeTransform = (program) => {
        const checker = program.getTypeChecker();
        const extensionsFile = program.getSourceFile(path.resolve(__dirname, "index.d.ts"));
        if (!extensionsFile)
            return;
        const definedSymbolsByName = new Map();
        for (const f of extensionsFile.statements) {
            if (ts.isFunctionDeclaration(f)) {
                definedSymbolsByName.set(f.name.getText(), checker.getSymbolAtLocation(f.name));
            }
            else if (ts.isVariableStatement(f)) {
                for (const d of f.declarationList.declarations) {
                    definedSymbolsByName.set(d.name.getText(), checker.getSymbolAtLocation(d.name));
                }
            }
        }
        newLuaSetSymbol = definedSymbolsByName.get("newLuaSet");
        getTestFilesSymbol = definedSymbolsByName.get("getProjectFilesMatchingRegex");
        nilSymbol = definedSymbolsByName.get("nil");
        assumeSymbol = definedSymbolsByName.get("assume");
        keysSymbol = definedSymbolsByName.get("keys");
        keySetSymbol = definedSymbolsByName.get("keySet");
    };
    const visitors = {
        [ts.SyntaxKind.CallExpression](node, context) {
            // handle special case when call = __getTestFiles(), replace with list of files
            const callSymbol = context.checker.getSymbolAtLocation(node.expression);
            switch (callSymbol) {
                case getTestFilesSymbol:
                    return transformGetFilesMatchingPatternCall(context, node, options);
                case newLuaSetSymbol:
                    return transformLuaSetNewCall(context, node);
                case assumeSymbol:
                    return (0, typescript_to_lua_1.createNilLiteral)();
                case keysSymbol:
                    return transformKeysCall(context, node);
                case keySetSymbol:
                    return transformKeySetCall(context, node);
            }
            return context.superTransformExpression(node);
        },
        [ts.SyntaxKind.Identifier](node, context) {
            const symbol = context.checker.getSymbolAtLocation(node);
            if (symbol === nilSymbol)
                return (0, typescript_to_lua_1.createNilLiteral)(node);
            if (options.warnUseNil && node.originalKeywordKind === ts.SyntaxKind.UndefinedKeyword) {
                context.diagnostics.push(useNilInstead(node));
            }
            return context.superTransformExpression(node);
        },
    };
    if (options.warnUseDoubleEquals) {
        visitors[ts.SyntaxKind.BinaryExpression] = (node, context) => {
            if (node.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken) {
                context.diagnostics.push(useEqualsEquals(node));
            }
            else if (node.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsEqualsToken) {
                context.diagnostics.push(useNotEquals(node));
            }
            return context.superTransformExpression(node);
        };
    }
    if (options.simplifyDelete) {
        visitors[ts.SyntaxKind.DeleteExpression] = (node, context) => {
            if (ts.isOptionalChain(node.expression))
                return context.superTransformExpression(node);
            const deleteCall = context.superTransformExpression(node);
            assert((0, typescript_to_lua_1.isCallExpression)(deleteCall));
            // replace with set property to nil
            const table = deleteCall.params[0];
            const key = deleteCall.params[1];
            context.addPrecedingStatements((0, typescript_to_lua_1.createAssignmentStatement)((0, typescript_to_lua_1.createTableIndexExpression)(table, key), (0, typescript_to_lua_1.createNilLiteral)(), node));
            return (0, typescript_to_lua_1.createBooleanLiteral)(true);
        };
        visitors[ts.SyntaxKind.SourceFile] = (node, context) => {
            const [result] = context.superTransformNode(node);
            context.usedLuaLibFeatures.delete(typescript_to_lua_1.LuaLibFeature.Delete);
            return result;
        };
    }
    const beforeEmit = (program, _, __, files) => {
        if (options.replaceDotWithDash) {
            if (files.length === 0)
                return;
            for (const file of files) {
                const outPath = file.outputPath;
                if (!outPath.endsWith(".lua"))
                    continue;
                const fileName = path.basename(outPath, ".lua");
                // replace . with - in file name
                const newFileName = fileName.replace(/\./g, "-");
                if (fileName === newFileName)
                    continue;
                file.outputPath = path.join(path.dirname(outPath), newFileName + ".lua");
            }
        }
    };
    return {
        beforeTransform,
        visitors,
        beforeEmit,
    };
}
// noinspection JSUnusedGlobalSymbols
exports.default = createPlugin;
//# sourceMappingURL=plugin.js.map