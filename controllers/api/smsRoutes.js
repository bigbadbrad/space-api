// Our delivery status endpoint
const router = require("express").Router();


// Helper function to normalize phone numbers by removing '+1' country code
function normalizePhoneNumber(phoneNumber) {
    if (phoneNumber.startsWith('+1')) {
      return phoneNumber.slice(2); // Remove '+1' from the beginning of the phone number
    }
    return phoneNumber;
  }

// New Route for Delivery Status Webhook
router.post("/delivery-status", async (req, res) => {
  try {
      const data = req.body.data;

      console.log('Delivery status webhook received:', data);

      const messageId = data.payload.id;
      const status = data.payload.status;
      const recipient = data.payload.to.phone_number;

      console.log(`Message ID: ${messageId}, Status: ${status}, Recipient: ${recipient}`);

      // Log status or perform further actions based on status (optional)
      // Example: Store status in the database, alert the user, or retry failed messages

      res.status(200).json({ message: 'Delivery status received' });
  } catch (error) {
      console.error('Error processing delivery status webhook:', error);
      res.status(500).json({ error: error.toString() });
  }
});

module.exports = router;
