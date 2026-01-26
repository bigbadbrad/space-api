//  /controllers/api/paymentRoutes.js
const router = require("express").Router();
const { Op } = require('sequelize');
const fetch = require('node-fetch');
const { Order, User, OrderDetails, Product, Subscription } = require("../../models");
const Stripe = require('stripe');
const { authenticateToken } = require('../../middleware/auth.middleware');
const { GoogleAdsApi, enums, resources } = require('google-ads-api');
const { sendSmsReceipt } = require('../../services/paymentService');

// Configure your Stripe secret key
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2022-11-15', // ✅ required for meterEvents support
});
const stripePriceId = process.env.STRIPE_PRICE_ID;
const stripeAdditionalPriceId = process.env.STRIPE_ADDITIONAL_PRICE_ID;

// Initialize Google Ads API client
const client = new GoogleAdsApi({
  client_id: process.env.GOOGLE_ADS_CLIENT_ID,
  client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET,
  developer_token: process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
});

// Helper function to send conversion event to Google Ads
const sendConversionEventToGoogleAds = async (customerId, conversionActionId, conversionValue, gclid) => {
  const customer = client.Customer({
      customer_id: customerId,
      refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN,
  });

  const conversion = new resources.ClickConversion({
      conversion_action: `customers/${customerId}/conversionActions/${conversionActionId}`,
      conversion_date_time: new Date().toISOString(),
      conversion_value: conversionValue,
      currency_code: 'USD',
      gclid: gclid,
  });

  try {
      const response = await customer.conversionUploads.uploadClickConversions({
          conversions: [conversion],
          partial_failure: true,
      });
      console.log('Successfully sent conversion event to Google Ads:', response);
  } catch (error) {
      console.error('Error sending conversion event to Google Ads:', error);
  }
};


// Endpoint to process a payment  
router.post("/", async (req, res) => {
  // Log when the request is received
  console.log('Received payment request with body:', req.body);

  const { token, amount, gclid } = req.body;

  try {

    // Log before calling Stripe
    console.log('Attempting to create charge with Stripe');

    // Create the charge using Stripe
    const charge = await stripe.charges.create({
        amount: amount, // amount in cents
        currency: 'usd',
        source: token, // obtained with Stripe.js on the frontend
        description: 'Payment for order'
    });

    res.status(200).json({ success: true, message: 'Payment successful', charge });
  } catch (error) {
      console.error('Payment Error:', error);
      res.status(500).json({ success: false, message: 'Payment failed', error });
  }
});


// Endpoint to process a payment and create a subscription
router.post('/subscription', authenticateToken, async (req, res) => {
  console.log('Received subscription request with body:', req.body);

  const { paymentMethodId, staffCount: rawStaffCount } = req.body;
  const userId = req.user.id;

  // Default logic: first staff included
  const staffCount = Math.max(parseInt(rawStaffCount || 1, 10), 1);
  const additionalStaff = Math.max(staffCount - 1, 0); // only bill for extra staff

  try {
    // Retrieve the user
    const user = await User.findByPk(userId);

    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    // Create a Customer in Stripe if not already created
    let customerId = user.stripeCustomerId;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
      });

      customerId = customer.id;

      // Save the customer ID in your database
      user.stripeCustomerId = customerId;
      await user.save();
    }

    // Attach the payment method to the customer
    await stripe.paymentMethods.attach(paymentMethodId, {
      customer: customerId,
    });

    // Set the default payment method on the customer
    await stripe.customers.update(customerId, {
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
    });

    const staffQty = Math.max(staffCount - 1, 0);

    // Create subscription with both base and metered price
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [
        { price: stripePriceId, quantity: 1 },
        { price: stripeAdditionalPriceId, quantity: staffQty },
      ],
      expand: ['latest_invoice'],
    });

    const additionalItem = subscription.items.data.find(
      (item) => item.price.id === stripeAdditionalPriceId
    );

    // After successful subscription, create a record in your database
    const startDate = new Date();
    const endDate = new Date();
    endDate.setFullYear(endDate.getFullYear() + 1);

    const dbSubscription = await Subscription.create({
      user_id: userId,
      startDate: startDate,
      endDate: endDate,
      status: 'active',
      amount: 60.00 + (additionalStaff * 10.00),
      currency: 'USD',
      stripeSubscriptionId: subscription.id,
      stripeItemId: additionalItem?.id || null,
    });

    // ✅ Mark user as 'active'
    user.status = 'active';
    await user.save();

    // Send SMS receipt
    await sendSmsReceipt(userId, 60.00);

    res.status(200).json({ success: true, message: 'Subscription successful', subscription: dbSubscription });
  } catch (error) {
    console.error('Subscription Error:', error);
    res.status(500).json({ success: false, message: 'Subscription failed', error: error.message });
  }
});


// SUBCRIPTION STATUS
// GET /api/payment/subscription-status
const TRIAL_PERIOD_DAYS = 7;

router.get('/subscription-status', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findByPk(userId);

    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    const userPhone = user.phone;
    const whitelist = require('../../config/whitelist').whitelistedPhoneNumbers;
    const whitelisted = whitelist.includes(userPhone);

    const now = Date.now();
    const createdAt = new Date(user.createdAt).getTime();
    const trialValid = now - createdAt < TRIAL_PERIOD_DAYS * 24 * 60 * 60 * 1000;

    console.log(`🧪 Trial valid: ${trialValid}`);
    console.log(`🟢 Whitelisted: ${whitelisted}`);

    if (whitelisted || trialValid) {
      return res.status(200).json({
        hasActiveSubscription: true,
        subscription: null,
        whitelisted,
        trialValid,
      });
    }

    // Check for active subscription
    const subscription = await Subscription.findOne({
      where: {
        user_id: userId,
        status: 'active',
        endDate: {
          [Op.gt]: new Date(),
        },
      },
    });

    console.log(`📦 Active subscription: ${!!subscription}`);

    return res.status(200).json({
      hasActiveSubscription: !!subscription,
      subscription,
      whitelisted: false,
      trialValid: false,
    });
  } catch (error) {
    console.error('Error checking subscription status:', error);
    res.status(500).json({ error: error.toString() });
  }
});

module.exports = router;
