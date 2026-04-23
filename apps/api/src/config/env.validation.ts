import * as Joi from 'joi';

export const validationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  APP_PORT: Joi.number().default(3001),
  APP_URL: Joi.string().uri().required(),
  FRONTEND_URL: Joi.string().uri().required(),
  FEEDBACK_BASE_URL: Joi.string().uri().required(),

  // Database
  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().default(5432),
  DB_USER: Joi.string().required(),
  DB_PASSWORD: Joi.string().required(),
  DB_NAME: Joi.string().required(),
  DB_SSL: Joi.boolean().default(false),

  // Redis
  REDIS_HOST: Joi.string().required(),
  REDIS_PORT: Joi.number().default(6379),
  REDIS_PASSWORD: Joi.string().optional(),

  // JWT
  JWT_SECRET: Joi.string().min(32).required(),
  JWT_EXPIRES_IN: Joi.string().default('7d'),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('30d'),

  // Encryption
  ENCRYPTION_KEY: Joi.string().length(32).required(),

  // WhatsApp
  WHATSAPP_PROVIDER: Joi.string().valid('twilio', 'meta').default('twilio'),
  TWILIO_ACCOUNT_SID: Joi.string().when('WHATSAPP_PROVIDER', {
    is: 'twilio', then: Joi.required(), otherwise: Joi.optional(),
  }),
  TWILIO_AUTH_TOKEN: Joi.string().when('WHATSAPP_PROVIDER', {
    is: 'twilio', then: Joi.required(), otherwise: Joi.optional(),
  }),
  TWILIO_WHATSAPP_FROM: Joi.string().when('WHATSAPP_PROVIDER', {
    is: 'twilio', then: Joi.required(), otherwise: Joi.optional(),
  }),
  META_WHATSAPP_TOKEN: Joi.string().when('WHATSAPP_PROVIDER', {
    is: 'meta', then: Joi.required(), otherwise: Joi.optional(),
  }),
  META_PHONE_NUMBER_ID: Joi.string().when('WHATSAPP_PROVIDER', {
    is: 'meta', then: Joi.required(), otherwise: Joi.optional(),
  }),

  // Stripe
  STRIPE_SECRET_KEY: Joi.string().optional(),
  STRIPE_WEBHOOK_SECRET: Joi.string().optional(),

  // Email
  SMTP_HOST: Joi.string().required(),
  SMTP_PORT: Joi.number().default(587),
  SMTP_USER: Joi.string().email().required(),
  SMTP_PASS: Joi.string().required(),
  EMAIL_FROM: Joi.string().email().required(),

  // Rate Limiting
  THROTTLE_TTL: Joi.number().default(60),
  THROTTLE_LIMIT: Joi.number().default(30),
});
