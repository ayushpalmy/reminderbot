const express = require('express');
const router = express.Router();
const { verifyWebhookSignature } = require('../services/razorpayService');
const { updateUserPlan, createSubscription } = require('../services/subscriptionService');
const { getUserByPhone } = require('../services/userService');
const { sendWhatsAppMessage } = require('../services/whatsappService');

/**
 * POST /api/razorpay/webhook
 * Receive payment notifications from Razorpay
 */
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    console.log('\n[RAZORPAY WEBHOOK] Received webhook event');
    
    const signature = req.headers['x-razorpay-signature'];
    const body = req.body.toString();
    
    // Verify webhook signature
    const isValid = verifyWebhookSignature(signature, body);
    
    if (!isValid) {
      console.log('[RAZORPAY WEBHOOK] Invalid signature, ignoring');
      return res.status(400).json({ error: 'Invalid signature' });
    }
    
    const event = JSON.parse(body);
    console.log('[RAZORPAY WEBHOOK] Event type:', event.event);
    
    // Handle payment link paid event
    if (event.event === 'payment_link.paid') {
      const paymentLink = event.payload.payment_link.entity;
      const payment = event.payload.payment.entity;
      
      console.log('[RAZORPAY WEBHOOK] Payment link paid:', paymentLink.id);
      console.log('[RAZORPAY WEBHOOK] Payment ID:', payment.id);
      console.log('[RAZORPAY WEBHOOK] Amount:', payment.amount / 100, 'INR');
      
      // Extract user info from notes
      const userId = paymentLink.notes?.user_id;
      const phoneNumber = paymentLink.notes?.phone_number;
      
      if (!userId || !phoneNumber) {
        console.error('[RAZORPAY WEBHOOK] Missing user info in notes');
        return res.status(400).json({ error: 'Missing user info' });
      }
      
      console.log('[RAZORPAY WEBHOOK] Processing upgrade for user:', userId);
      
      // Update user plan to personal
      await updateUserPlan(parseInt(userId), 'personal');
      
      // Create/update subscription
      await createSubscription(parseInt(userId), 'personal', 'active', payment.id);
      
      // Send success message on WhatsApp
      const successMessage = '🎉 Payment successful! Your Personal plan is now active. You can now set unlimited reminders.';
      await sendWhatsAppMessage(phoneNumber, successMessage);
      
      console.log('[RAZORPAY WEBHOOK] ✓ User upgraded successfully');
      
    } else if (event.event === 'payment.failed') {
      console.log('[RAZORPAY WEBHOOK] Payment failed event received');
      // Optional: Handle failed payments
    } else {
      console.log('[RAZORPAY WEBHOOK] Unhandled event type:', event.event);
    }
    
    // Always return 200 to Razorpay
    res.status(200).json({ status: 'ok' });
    
  } catch (error) {
    console.error('[RAZORPAY WEBHOOK] Error processing webhook:', error);
    // Still return 200 to prevent Razorpay from retrying
    res.status(200).json({ status: 'error', message: error.message });
  }
});

module.exports = router;
