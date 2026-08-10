import swaggerJsdoc from 'swagger-jsdoc'

// Builds the OpenAPI spec swagger-ui-express serves at /api/docs.
// swagger-jsdoc scans the `apis` glob below for JSDoc "@openapi" comment
// blocks above route handlers and stitches them into one spec — so
// documentation lives right next to the route it describes instead of in a
// separate file that drifts out of sync.
//
// Coverage note: auth, users, patients, departments, appointments,
// encounters, and lab orders/results routes are documented with @openapi
// blocks so far (Phases 2-5). Each later phase should add its own blocks to
// its route files as those endpoints are built, rather than documenting
// everything upfront before the endpoints exist.
export const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'Sana API',
      version: '1.0.0',
      description:
        'Intelligent event-driven hospital management system with an AI-powered diagnostic decision-support agent.',
    },
    servers: [{ url: '/api/v1' }],
    components: {
      securitySchemes: {
        // Matches the "Authorization: Bearer <token>" header the `auth`
        // middleware expects — lets the Swagger UI "Authorize" button work.
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
    },
    // Applied to every operation by default; individual routes can override
    // this with their own `security` block if they're actually public.
    security: [{ bearerAuth: [] }],
  },
  // Glob of files swagger-jsdoc scans for @openapi comment blocks.
  apis: ['./src/routes/*.routes.ts'],
})
