
const { readFileSync } = require('fs')
const mm = require('module')
const { parse } = require('cjs-module-lexer')

const filenameAndDirnameCode =
`import { fileURLToPath } from 'url';
import { dirname } from 'path';
let __filename = fileURLToPath(import.meta.url);
let __dirname = dirname(__filename);`

const createRequireCode =
`import { createRequire } from 'module';
const require = createRequire(import.meta.url)`

const exportsStartCode =
`let exports = {};
let module = { exports };`

const exportsEndCode =
`export default module.exports;`

const exportNamesFromFileCache = {}
function getExportNamesFromFile(file) {
    const cache = exportNamesFromFileCache
    if (file in cache) {
        return cache[file]
    } else {
        const code = readFileSync(file, 'utf8')
        return cache[file] = getExportNamesFromCode(code, file)
    }
}

function getExportNamesFromCode(code, filename) {
    const combinedExports = {}

    const { exports, reexports: reExports } = parse(code)

    for (const reExport of reExports) {
        const _require = mm.createRequire(filename)
        const target = _require.resolve(reExport)
        const secondaryNames = getExportNamesFromFile(target)
        for (const e of secondaryNames) {
            combinedExports[e] = true
        }
    }
    for (const e of exports) {
        combinedExports[e] = true
    }
    return Object.keys(combinedExports)
}

module.exports = function MakeBabelTransformDependencyImports(/*opts: Opts*/) {
    return function BabelTransformDependencyImports(babel) {
        const t = babel.types
        const createRequire = babel.parse(createRequireCode).program.body
        const filenameAndDirname = babel.parse(filenameAndDirnameCode).program.body
        const exportsStart = babel.parse(exportsStartCode).program.body
        const exportsEnd = babel.parse(exportsEndCode).program.body
        
        let addFilenameAndDirname
        let addCreateRequire
        return {
            pre(state) {
                addFilenameAndDirname = false
                addCreateRequire = false

                // grab the whole file contents
                const body = state.ast.program.body
                // add a block statement containing a copy of this content at the start of the body
                state.path.unshiftContainer('body', t.BlockStatement([...body]))
                 /// truncate the body to 1 item, removing the original content
                body.length = 1
            },
            visitor: {
                CallExpression(path) {
                    const callee = path.node.callee
                    if (callee.type === 'Identifier' && callee.name === 'require') {
                        const newEx = t.AwaitExpression(
                            t.CallExpression(
                                t.Import(),
                                path.node.arguments
                            )
                        )
                        path.replaceWith(newEx)
                        //
                    }
                },
                Identifier(path) {
                    if (path.node.name === '__filename' || path.node.name === '__dirname') {
                        addFilenameAndDirname = true
                    }
                },
                MemberExpression(path) {
                    const node = path.node
                    if (
                        node.object.type === 'Identifier' && node.object.name === 'require'
                       && node.property.type === 'Identifier' && node.property.name === 'resolve'
                    ) {
                        addCreateRequire = true
                    }
                }
            },
            post(state) {
                // reverse the order, because we are unshifting 
                if (addCreateRequire) {
                    state.path.unshiftContainer('body', createRequire)
                }
                if (addFilenameAndDirname) {
                    state.path.unshiftContainer('body', filenameAndDirname)
                }
                state.path.unshiftContainer('body', exportsStart)

                const names = getExportNamesFromCode(state.code, state.opts.filename)

                for (const name of names) {
                    const namedExport = t.ExportNamedDeclaration(
                        t.VariableDeclaration(
                            'const',
                            [t.VariableDeclarator(
                                t.Identifier(name),
                                t.MemberExpression(
                                    t.MemberExpression(
                                        t.identifier('module'),
                                        t.identifier('exports')
                                    ),
                                    t.StringLiteral(name),
                                    true
                                )
                            )]
                        )
                    )
                    state.path.pushContainer('body', namedExport)
                }

                state.path.pushContainer('body', exportsEnd)
            }
        }
    }
}
