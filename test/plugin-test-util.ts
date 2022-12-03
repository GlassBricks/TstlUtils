import path = require("path")
import * as fs from "fs"
import {LuaTarget} from "typescript-to-lua"
import {TapCallback, TestBuilder} from "./tstl-test-util"
import {PluginOptions} from "../plugin"

const srcDir = path.resolve(__dirname, "..")

let declFileContents: Record<string, string> | undefined

function getDeclFileContents(): Record<string, string> {
  if (!declFileContents) {
    declFileContents = {}
    const files = fs.readdirSync(srcDir).filter((file) => file.endsWith(".d.ts"))
    for (const file of files) {
      const filePath = path.join(srcDir, file)
      declFileContents[filePath] = fs.readFileSync(filePath, "utf8")
    }
  }
  return declFileContents
}

export const setupPluginTest: TapCallback = (builder: TestBuilder) => {
  builder.withLanguageExtensions().setOptions({
    strict: true,
    luaTarget: LuaTarget.Lua52,
    luaPlugins: [
      {
        name: path.join(srcDir, "plugin.ts"),
        replaceDotWithDash: true,
        simplifyDelete: true,
        warnUseNil: true,
        warnUseDoubleEquals: true,
      } satisfies PluginOptions,
    ],
  })
  for (const [name, content] of Object.entries(getDeclFileContents())) {
    builder.addExtraFile(name, content)
  }
}
