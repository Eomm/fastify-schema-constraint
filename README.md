# fastify-schema-constraint

[![Build Status](https://github.com/Eomm/fastify-schema-constraint/workflows/ci/badge.svg)](https://github.com/Eomm/fastify-schema-constraint/actions)
[![npm](https://img.shields.io/npm/v/fastify-schema-constraint)](https://www.npmjs.com/package/fastify-schema-constraint)
[![JavaScript Style Guide](https://img.shields.io/badge/code_style-standard-brightgreen.svg)](https://standardjs.com)

Choose the right JSON schema to apply to your routes based on your constraints.
With this plugin, you will be able to set multiple schemas per `route` and, programmatically,
choose which one applies.

Ex: you can choose which JSON schema to apply, based on the `req.headers` values.


## Install

```
npm install fastify-schema-constraint
```

### Compatibility

| Plugin version | Fastify version |
| ------------- |:---------------:|
| `^1.0.0` | `^2.0.0` |
| `^2.0.0` | `^3.0.0` |
| `^3.0.0` | `^4.0.0` |

## Usage

This plugin will act on `preHandler` hook and will verify if the payload of the `body`, `querystring`,
`params` or `headers` fulfil the constraint condition.

```js
// Define the set of your JSON Schema. They MUST be in an array assigned to `oneOf` property
const routeSchema = {
  oneOf: [
    { $id: '#schema1', type: 'object', properties: { mul5: { type: 'number', multipleOf: 5 } } },
    { $id: '#schema2', type: 'object', properties: { mul3: { type: 'number', multipleOf: 3 } } },
    { $id: '#schema3', type: 'object', properties: { mul2: { type: 'number', multipleOf: 2 } } }
  ]
}

// Define your constraint logic
const constraint = {
  body: {
    constraint: function (request) {
      switch(request.headers.myHeader){
        case 1: return '#schema1'
        case 2: return '#schema3'
        case 3: return '#schema2'
        default: return null // it means "don't apply any constraint"
      }
    },
    statusCode: 412, // Optionally define a custom status code in case of errors
    errorMessage: 'This constraint return only #schema1' // Optionally define a custom error message
  },
  querystring: { ... },
  params: { ... },
  headers: { ... }
}

const fastify = Fastify()
fastify.register(require('fastify-schema-constraint'), constraint)
fastify.route({
  url: '/:mul5',
  method: 'POST',
  handler: (_, reply) => { reply.send('hi') },
  schema: {
    body: routeSchema,
    querystring: routeSchema,
    params: routeSchema,
    headers: routeSchema
  }
})
```

### Options

The options accept a json in this format:

```js
const constraint = {
  body: { ... }, // constraint to apply on body
  querystring: { ... }, // constraint to apply on query string
  params: { ... }, // constraint to apply on path parameters
  headers: { ... } // constraint to apply on headers
}
```

All the fields are optional, but you must provide **almost one** of these settings.
If you provide a constraint for `body`, but the route doesn't have any schema configured
the plugin will skip the constraint.

Each constraint field accepts a json in this format:

```js
{
  constraint: function (request) {
    // This field is mandatory and must be set with a function.
    // The input paramenter is the Fastify request.
    // This function must be sync and must return a string with the JSON Schema $id to constraint
    return '#idToApply'
  },
  statusCode: 412, // Optionally: set a custom status code in case of errors, default 400
  errorMessage: 'This constraint return only #idToApply' // Optionally: set a custom error message
}
```

**NB:**

+ if the constraint function returns something different than a string, the validation will be skipped!
+ if the constraint function throws an error, an error will be thrown
+ if the returned `$id` isn't present in the `oneOf` array an error will be thrown
+ if the payload verified doesn't match with the returned `$id`, an error will be thrown


## License

Copyright [Manuel Spigolon](https://github.com/Eomm), Licensed under [MIT](./LICENSE).
