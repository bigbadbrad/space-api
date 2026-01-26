const configureStripe = require("stripe");

const SECRET_KEY = process.env.SECRET_KEY;

const STRIPE_SECRET_KEY =
  process.env.NODE_ENV === "production"
    ? `${SECRET_KEY}`
    : "";

const stripe = configureStripe(STRIPE_SECRET_KEY);

module.exports = stripe;
