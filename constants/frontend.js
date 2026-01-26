const FRONTEND_DEV_URLS = ["http://localhost:3000"];

const FRONTEND_PROD_URLS = [
  "https://www.populartests.com",
  "https://populartests.com",
];

module.exports =
  process.env.NEXT_PUBLIC_NODE_ENV === "production"
    ? FRONTEND_PROD_URLS
    : FRONTEND_DEV_URLS;
