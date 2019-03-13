'use strict'
const fp = require('fastify-plugin')

const SCHEMA_FIELDS = ['body', 'querystring', 'params', 'headers']

function schemaConstraint (instace, opts, next) {
  const config = Object.assign({
    body: {},
    querystring: {},
    params: {},
    headers: {}
  }, opts)

  let almostOne = false
  for (let field of SCHEMA_FIELDS) {
    const fieldOptions = config[field]
    almostOne = almostOne || fieldOptions.constraint != null
    if (fieldOptions.constraint !== undefined && typeof fieldOptions.constraint !== 'function') {
      return next(new TypeError(`The "${field}.constraint" option must be a function`))
    }
    if (fieldOptions.statusCode !== undefined && typeof fieldOptions.statusCode !== 'number') {
      return next(new TypeError(`The "${field}.statusCode" option must be a number`))
    }
    if (fieldOptions.errorMessage !== undefined && typeof fieldOptions.errorMessage !== 'string') {
      return next(new TypeError(`The "${field}.errorMessage" option must be a string`))
    }
  }

  if (!almostOne) return next(new Error('Options are required for fastify-schema-constraint'))

  const lazyValidators = {}
  instace.addHook('preHandler', applyContraints)
  next()

  function applyContraints (req, reply, next) {
    if (!reply.context.schema) {
      return next()
    }
    let field
    try {
      for (field of SCHEMA_FIELDS) {
        contraintValidation(field, req, reply.context.schema[field])
      }
      next()
    } catch (error) {
      if (config[field].errorMessage) {
        error.message = config[field].errorMessage
      }
      error.statusCode = config[field].statusCode || 400
      next(error)
    }
  }

  function contraintValidation (paramName, req, schema) {
    const fn = config[paramName].constraint
    if (!fn || !schema) {
      // ignore if the constraint function or the route schema are not set
      return true
    }

    let mustBeId
    try {
      mustBeId = fn(req)
    } catch (clientError) {
      throw new Error(`Schema constraint function error for ${paramName}: ${clientError.message}`)
    }

    if (typeof mustBeId !== 'string') {
      // ignore the returned value
      return true
    }

    const mandatorySchema = schema.oneOf.find(_ => _.$id === mustBeId)
    if (!mandatorySchema) {
      throw new Error(`JSON schema $id ${mustBeId} not found in the 'schema.${paramName}.oneOf' route settings`)
    }

    const lazyKey = `${paramName}-${mandatorySchema.$id}`
    let validatorFunction
    if (lazyValidators[lazyKey] != null) {
      validatorFunction = lazyValidators[lazyKey]
    } else {
      // TODO: don't use private fields instace._schemaCompiler
      validatorFunction = instace._schemaCompiler(mandatorySchema)
      lazyValidators[lazyKey] = validatorFunction
    }

    // NB: querystring field is named as req.query
    const validationResult = validatorFunction && validatorFunction(req[paramName.replace('string', '')])
    if (validationResult === false || (validationResult && validationResult.error)) {
      throw new Error(`Schema constraint failure: the ${paramName} doesn't match the JSON schema ${mustBeId}`)
    }

    return true
  }
}

module.exports = fp(schemaConstraint, {
  fastify: '>=2.0.0',
  name: 'fastify-schema-constraint'
})
