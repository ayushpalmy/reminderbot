const Razorpay = require('razorpay');
const crypto = require('crypto');

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

/**
 * Create a Razorpay payment link
 * @param {string} phoneNumber - Customer's phone number
 * @param {string} customerId - User ID for reference
 * @returns {Promise<Object>}
 */
async function createPaymentLink(phoneNumber, customerId) {
  try {
    const paymentLink = await razorpay.paymentLink.create({
      amount: 4900, // ₹49 in paise
      currency: 'INR',
      description: 'ReminderBot Personal Plan - ₹49/month',
      customer: {
        contact: phoneNumber,
      },
      notify: {
        sms: false,
        email: false,
        whatsapp: false,
      },
      reminder_enable: false,
      notes: {
        user_id: customerId.toString(),
        phone_number: phoneNumber,
        plan: 'personal',
      },
      callback_url: '',
      callback_method: 'get',
    });

    console.log('[RAZORPAY] ✓ Payment link created:', paymentLink.id);
    console.log('[RAZORPAY] Short URL:', paymentLink.short_url);
    
    return paymentLink;
  } catch (error) {
    console.error('[RAZORPAY] Error creating payment link:', error);
    throw error;
  }
}

/**
 * Verify Razorpay webhook signature
 * @param {string} signature - X-Razorpay-Signature header
 * @param {string} body - Raw request body
 * @returns {boolean}
 */
function verifyWebhookSignature(signature, body) {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    
    if (!webhookSecret) {
      console.error('[RAZORPAY] Webhook secret not configured');
      return false;
    }

    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(body)
      .digest('hex');

    const isValid = expectedSignature === signature;
    
    if (isValid) {
      console.log('[RAZORPAY] ✓ Webhook signature verified');
    } else {
      console.log('[RAZORPAY] ✗ Invalid webhook signature');
    }
    
    return isValid;
  } catch (error) {
    console.error('[RAZORPAY] Error verifying webhook signature:', error);
    return false;
  }
}

/**
 * Get payment link details
 * @param {string} paymentLinkId 
 * @returns {Promise<Object>}
 */
async function getPaymentLink(paymentLinkId) {
  try {
    const paymentLink = await razorpay.paymentLink.fetch(paymentLinkId);
    return paymentLink;
  } catch (error) {
    console.error('[RAZORPAY] Error fetching payment link:', error);
    throw error;
  }
}

module.exports = {
  createPaymentLink,
  verifyWebhookSignature,
  getPaymentLink,
};
