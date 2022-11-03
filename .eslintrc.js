
module.exports = {
    "globals": {
        "sxy": "readonly",
        "test": "readonly" // alt for mocha: it
    },
    "env": {
        "browser": true,
        "commonjs": true,
        "es2021": true,
        "node": true,
        "mocha": true
    },
    "extends": [
        "sandi-cjs"
    ],
    "parserOptions": {
        "ecmaVersion": 12
    },
    "rules": {
    }
}
