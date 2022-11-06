
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

function varNameForImport(source) {
    return source.split('/').pop()
    // remove invalid chars
    // deal with names starting with numbers
    // deal with naming duplication
}

module.exports = function MakeBabelTransformDependencyImports(/*opts: Opts*/) {
    return function BabelTransformDependencyImports(babel) {
        const t = babel.types
        const createRequire = babel.parse(createRequireCode).program.body
        const filenameAndDirname = babel.parse(filenameAndDirnameCode).program.body
        const exportsStart = babel.parse(exportsStartCode).program.body
        const exportsEnd = babel.parse(exportsEndCode).program.body
        
        let identifiers
        let imports
        let importNum
        let addFilenameAndDirname
        let addCreateRequire
        return {
            pre(state) {
                identifiers = {}
                imports = []
                importNum = 0
                addFilenameAndDirname = false
                addCreateRequire = false

                // wrap everything in a scoping code block to prevent naming conficts when exporting at the end
                const body = state.ast.program.body
                state.ast.program.body = [t.BlockStatement([...body])]

                // // grab the whole file contents
                // const body = state.ast.program.body
                // // add a block statement containing a copy of this content at the start of the body
                // state.path.unshiftContainer('body', t.BlockStatement([...body]))
                //  /// truncate the body to 1 item, removing the original content
                // body.length = 1
            },
            visitor: {
                CallExpression(path) {
                    const callee = path.node.callee
                    if (callee.type === 'Identifier' && callee.name === 'require') {
                        imports.push(path.node.arguments)
                        //const newEx = t.AwaitExpression(
                        //    t.CallExpression(
                        //        t.Import(),
                        //        path.node.arguments
                        //    )
                        //)
                        const newEx = t.MemberExpression(
                            t.Identifier('__sxy_cjs_to_esm_imports'),
                            t.NumericLiteral(importNum), // pretty hard to read output code
                            true
                        )
                        path.replaceWith(newEx)
                        importNum++
                        // do we wanna cache???
                      
                        //
                    }
                },
                Identifier(path) {
                    identifiers[path.node.name] = true
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
              
                //console.log('imports', imports)
                //console.log('identifiers', identifiers)
              
                const importsStatement = t.VariableDeclaration(
                    'const',
                    [t.VariableDeclarator(
                        t.Identifier('__sxy_cjs_to_esm_imports'),
                        t.AwaitExpression(
                            t.CallExpression(
                                t.MemberExpression(
                                    t.Identifier('Promise'),
                                    t.Identifier('all')
                                ),
                                [t.ArrayExpression(imports.map( imp => {
                                    let source = imp[0].value
                                    if ( ! /(.js|.cjs|.mjs|.json)$/.test(source)) {
                                        if (source.split('/').pop().includes('.')) {
                                            console.log(`babel-plugin-sxy-transform-cjs-to-esm warning:`
                                                + ` require location ${source} file contains a dot, but we did not`
                                                + ` recognise the extension. Adding .js`)
                                        }
                                        source += '.js'
                                    }
                                    return t.AwaitExpression(
                                        t.CallExpression(
                                            t.Import(),
                                            [t.StringLiteral(source)]
                                        )
                                    )
                                }))]
                            )
                        )
                    )],
                )
                
              
                
                state.path.unshiftContainer('body', importsStatement)
                
                //for (const imp of imports) {
                //  	const importDeclaration = t.ImportDeclaration(
                //        [t.ImportDefaultSpecifier(
                //            t.Identifier(varNameForImport(imp[0].value))
                //        )],
               //        imp[0]
                //    )
                 //   state.path.unshiftContainer('body', importDeclaration)
                //}
              
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
                    if (name === 'default') continue /// cannot export named variables called default - this is reserved for the default export
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
