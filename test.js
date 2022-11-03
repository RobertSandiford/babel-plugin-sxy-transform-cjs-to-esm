
const babel = require("@babel/core")

const MakeBabelTransformDependencyImports = require('./index.js')

// const m = require('./testPackage/index.js')
// console.log(m)

const { code } = babel.transformFileSync('./testPackage/index.js', {
    plugins: [
        MakeBabelTransformDependencyImports()
    ]
})

console.log(code)
