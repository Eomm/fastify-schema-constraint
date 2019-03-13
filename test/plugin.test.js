'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const fastifySchemaConstraint = require('../plugin')

test('wrong config', t => {
  t.plan(7)

  t.test('no config', t => {
    t.plan(2)
    const fastify = Fastify()
    fastify.register(fastifySchemaConstraint)
    fastify.ready(err => {
      t.equal(err.constructor, Error)
      t.equal(err.message, 'Options are required for fastify-schema-constraint')
    })
  })

  t.test('field type constraint validation', t => {
    t.plan(2)
    const fastify = Fastify()
    fastify.register(fastifySchemaConstraint, {
      body: { constraint: 'not a function' }
    })
    fastify.ready(err => {
      t.equal(err.constructor, TypeError)
      t.equal(err.message, 'The "body.constraint" option must be a function')
    })
  })

  t.test('field type statusCode validation', t => {
    t.plan(2)
    const fastify = Fastify()
    fastify.register(fastifySchemaConstraint, {
      body: { statusCode: 'not a number' }
    })
    fastify.ready(err => {
      t.equal(err.constructor, TypeError)
      t.equal(err.message, 'The "body.statusCode" option must be a number')
    })
  })

  t.test('field type errorMessage validation', t => {
    t.plan(2)
    const fastify = Fastify()
    fastify.register(fastifySchemaConstraint, {
      body: { errorMessage: 0x42 }
    })
    fastify.ready(err => {
      t.equal(err.constructor, TypeError)
      t.equal(err.message, 'The "body.errorMessage" option must be a string')
    })
  })

  t.test('field type changing field error message for querystring', t => {
    t.plan(2)
    const fastify = Fastify()
    fastify.register(fastifySchemaConstraint, {
      querystring: { errorMessage: 0x42 }
    })
    fastify.ready(err => {
      t.equal(err.constructor, TypeError)
      t.equal(err.message, 'The "querystring.errorMessage" option must be a string')
    })
  })

  t.test('field type changing field error message for params', t => {
    t.plan(2)
    const fastify = Fastify()
    fastify.register(fastifySchemaConstraint, {
      params: { statusCode: 'not a number' }
    })
    fastify.ready(err => {
      t.equal(err.constructor, TypeError)
      t.equal(err.message, 'The "params.statusCode" option must be a number')
    })
  })

  t.test('field type changing field error message for headers', t => {
    t.plan(2)
    const fastify = Fastify()
    fastify.register(fastifySchemaConstraint, {
      headers: { constraint: 'not a function' }
    })
    fastify.ready(err => {
      t.equal(err.constructor, TypeError)
      t.equal(err.message, 'The "headers.constraint" option must be a function')
    })
  })
})

test('constraint in action', t => {
  const callsToBodyConstraint = 2
  t.plan(9 + callsToBodyConstraint)

  const opts = {
    body: {
      constraint: function (req) {
        t.ok(req, 'Request in constraint must be set')
        return '#schema1'
      },
      statusCode: 412,
      errorMessage: 'This constraint return only #schema1'
    },
    querystring: { constraint: function (req) { return `#schema${req.query.schemaNumber}` } },
    params: { constraint: function (req) { return `#schema${req.params.schemaNumber}` } },
    headers: { constraint: function (req) { return `#schema${req.headers.schemanumber}` } } // NB: lowercase
  }

  const testSchema = {
    oneOf: [
      { $id: '#schema1', type: 'object', required: ['mul5'], properties: { mul5: { type: 'number', multipleOf: 5 }, schemaNumber: { type: 'number' } } },
      { $id: '#schema2', type: 'object', required: ['mul3'], properties: { mul3: { type: 'number', multipleOf: 3 }, schemaNumber: { type: 'number' } } },
      { $id: '#schema3', type: 'object', required: ['mul2'], properties: { mul2: { type: 'number', multipleOf: 2 }, schemaNumber: { type: 'number' } } }
    ]
  }

  t.test('start', t => {
    t.plan(1)
    const fastify = Fastify()
    fastify.register(fastifySchemaConstraint, opts)
    fastify.ready(t.error)
  })

  t.test('all the schemas', t => {
    t.plan(3)
    const fastify = Fastify()
    fastify.register(fastifySchemaConstraint, opts)
    fastify.route({
      url: '/:schemaNumber/:mul5',
      method: 'POST',
      handler: (_, reply) => { reply.send('hi') },
      schema: {
        body: testSchema,
        querystring: testSchema,
        params: testSchema,
        headers: testSchema
      }
    })

    fastify.inject({
      method: 'POST',
      url: '/1/15',
      payload: { mul5: 10, schemaNumber: 1 },
      query: { mul3: 9, schemaNumber: 2 },
      headers: { mul2: 4, schemaNumber: 3 }
    }, (err, res) => {
      t.error(err)
      t.equal(res.statusCode, 200)
      t.equal(res.payload, 'hi')
    })
  })

  t.test('custom error message and status', t => {
    t.plan(3)
    const fastify = Fastify()
    fastify.register(fastifySchemaConstraint, opts)
    fastify.route({
      url: '/',
      method: 'POST',
      handler: (_, reply) => { reply.send('hi') },
      schema: { body: testSchema }
    })

    fastify.inject({
      method: 'POST',
      url: '/',
      payload: { mul2: 4, schemaNumber: 42 }
    }, (err, res) => {
      t.error(err)
      t.equal(res.statusCode, 412)
      t.deepEqual(JSON.parse(res.payload), {
        statusCode: 412,
        error: 'Precondition Failed',
        message: 'This constraint return only #schema1'
      })
    })
  })

  t.test('default error message when schema is not found', t => {
    t.plan(3)
    const fastify = Fastify()
    fastify.register(fastifySchemaConstraint, opts)
    fastify.route({
      url: '/',
      method: 'POST',
      handler: (_, reply) => { reply.send('hi') },
      schema: { querystring: testSchema }
    })

    fastify.inject({
      method: 'POST',
      url: '/',
      query: { mul2: 4, schemaNumber: 404 }
    }, (err, res) => {
      t.error(err)
      t.equal(res.statusCode, 400)
      t.deepEqual(JSON.parse(res.payload), {
        statusCode: 400,
        error: 'Bad Request',
        message: `JSON schema $id #schema404 not found in the 'schema.querystring.oneOf' route settings`
      })
    })
  })

  t.test('default error message when schema does not match', t => {
    t.plan(3)
    const fastify = Fastify()
    fastify.register(fastifySchemaConstraint, opts)
    fastify.route({
      url: '/:schemaNumber/:mul2',
      method: 'POST',
      handler: (_, reply) => { reply.send('hi') },
      schema: { params: testSchema }
    })

    fastify.inject({ method: 'POST', url: '/1/44' },
      (err, res) => {
        t.error(err)
        t.equal(res.statusCode, 400)
        t.deepEqual(JSON.parse(res.payload), {
          statusCode: 400,
          error: 'Bad Request',
          message: `Schema constraint failure: the params doesn't match the JSON schema #schema1`
        })
      })
  })

  t.test('default error message when constraint function throws an error', t => {
    t.plan(3)

    const pluginOpts = {
      headers: {
        constraint: function (req) {
          throw new Error('Unexpected error')
        },
        statusCode: 500
      }
    }

    const fastify = Fastify()
    fastify.register(fastifySchemaConstraint, pluginOpts)
    fastify.route({
      url: '/',
      method: 'POST',
      handler: (_, reply) => { reply.send('hi') },
      schema: { headers: testSchema }
    })

    fastify.inject({
      method: 'POST',
      url: '/',
      headers: { mul2: 4, schemaNumber: 2 }
    },
    (err, res) => {
      t.error(err)
      t.equal(res.statusCode, 500)
      t.deepEqual(JSON.parse(res.payload), {
        statusCode: 500,
        error: 'Internal Server Error',
        message: `Schema constraint function error for headers: Unexpected error`
      })
    })
  })

  t.test('nothing happen if the function constraint does not return a string', t => {
    t.plan(3)

    const pluginOpts = {
      headers: {
        constraint: function (req) {
          return { not: 'a string' }
        }
      }
    }

    const fastify = Fastify()
    fastify.register(fastifySchemaConstraint, pluginOpts)
    fastify.route({
      url: '/',
      method: 'POST',
      handler: (_, reply) => { reply.send('hi') },
      schema: { headers: testSchema }
    })

    fastify.inject({
      method: 'POST',
      url: '/',
      headers: { mul2: 4, schemaNumber: 1 }
    },
    (err, res) => {
      t.error(err)
      t.equal(res.statusCode, 200)
      t.equal(res.payload, 'hi')
    })
  })

  t.test('constraint not triggered if missing the schemas', t => {
    t.plan(3)
    const fastify = Fastify()
    fastify.register(fastifySchemaConstraint, opts)
    fastify.route({
      url: '/',
      method: 'POST',
      handler: (_, reply) => { reply.send('hi') }
    })

    fastify.inject({
      method: 'POST',
      url: '/',
      query: { mul2: 4, schemaNumber: 404 }
    }, (err, res) => {
      t.error(err)
      t.equal(res.statusCode, 200)
      t.equal(res.payload, 'hi')
    })
  })

  t.test('lazy schema compile', t => {
    t.plan(6)
    const fastify = Fastify()
    fastify.register(fastifySchemaConstraint, opts)
    fastify.route({
      url: '/',
      method: 'POST',
      handler: (_, reply) => { reply.send('hi') },
      schema: { headers: testSchema }
    })

    fastify.inject({
      method: 'POST',
      url: '/',
      headers: { mul2: 4, schemaNumber: 3 }
    }, (err, res) => {
      t.error(err)
      t.equal(res.statusCode, 200)
      t.equal(res.payload, 'hi')
    })

    fastify.inject({
      method: 'POST',
      url: '/',
      headers: { mul2: 4, schemaNumber: 3 }
    }, (err, res) => {
      t.error(err)
      t.equal(res.statusCode, 200)
      t.equal(res.payload, 'hi')
    })
  })
})
