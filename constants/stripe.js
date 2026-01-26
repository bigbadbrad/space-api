const configureStripe = require("stripe");

const SECRET_KEY = process.env.SECRET_KEY;

const STRIPE_SECRET_KEY =
  process.env.NODE_ENV === "production"
    ? `${SECRET_KEY}`
    : "sk_test_51MzSqbLlfd4Nf47fArscsA6Yt7x9vXOANBawIcUARFYaAlGDxyE9qCXW0klPl7DEUs8k8ZrBZFk1iB6bB3vKAgZk00qBXrwVKi";

const stripe = configureStripe(STRIPE_SECRET_KEY);

module.exports = stripe;
