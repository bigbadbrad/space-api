// /controllers/api/index.js
const router = require("express").Router();

// Existing routes (keeping for compatibility)
const userRoutes = require("./userRoutes");
const smsRoutes = require('./smsRoutes');
const paymentRoutes = require("./paymentRoutes");
const apiKeyRoutes = require("./apiKeyRoutes");

// New ABM routes
const abmRoutes = require('./abmRoutes');
const appRoutes = require('./appRoutes');
const hooksRoutes = require('./hooksRoutes');

// Legacy routes (keep if still needed)
router.use("/users", userRoutes);
router.use('/sms', smsRoutes);
router.use("/stripe", paymentRoutes);
router.use('/keys', apiKeyRoutes);

// New ABM system routes
router.use("/abm", abmRoutes);
router.use("/app", appRoutes);
router.use("/hooks", hooksRoutes);

module.exports = router;
