import axios from 'axios'
import userModel from '../models/userModel.js'
import mongoose from 'mongoose'

// Payment mapping schema to store payment request details
const paymentSchema = new mongoose.Schema({
    paymentRequestId: { type: String, required: true, unique: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'user', required: true },
    planId: { type: String, required: true },
    credits: { type: Number, required: true },
    amount: { type: Number, required: true },
    status: { type: String, default: 'pending' },
    createdAt: { type: Date, default: Date.now }
})

const PaymentModel = mongoose.models.payment || mongoose.model('payment', paymentSchema)

// Create payment link using Cashfree Payment Gateway (simpler for individuals in India)
export const createPaymentLink = async (req, res) => {
    try {
        const { userId, planId, credits, amount } = req.body

        if (!userId || !planId || !credits || !amount) {
            return res.json({ success: false, message: 'Missing Details' })
        }

        const user = await userModel.findById(userId)
        if (!user) {
            return res.json({ success: false, message: 'User not found' })
        }

        // Use Cashfree Payment Gateway (works for individuals in India)
        const clientId = process.env.CASHFREE_APP_ID
        const clientSecret = process.env.CASHFREE_SECRET_KEY
        const isProduction = process.env.NODE_ENV === 'production'
        const baseUrl = isProduction 
            ? 'https://api.cashfree.com/pg' 
            : 'https://sandbox.cashfree.com/pg'

        if (!clientId || !clientSecret) {
            // Fallback: Return manual payment details
            return res.json({
                success: true,
                manualPayment: true,
                paymentDetails: {
                    amount: amount,
                    planId: planId,
                    credits: credits,
                    instructions: 'Please make the payment and contact support with your transaction ID to receive credits.',
                    upiId: process.env.UPI_ID || 'your-upi-id@paytm',
                    bankDetails: process.env.BANK_DETAILS || 'Contact support for bank details'
                },
                message: 'Payment gateway not configured. Manual payment option available.'
            })
        }

        // Create payment session
        const orderId = `order_${Date.now()}_${userId}`
        const paymentData = {
            order_id: orderId,
            order_amount: amount,
            order_currency: 'INR',
            customer_details: {
                customer_id: userId,
                customer_name: user.name,
                customer_email: user.email,
                customer_phone: user.phone || ''
            },
            order_meta: {
                return_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/payment-success?order_id={order_id}&order_token={order_token}`,
                notify_url: `${process.env.BACKEND_URL || 'http://localhost:4000'}/api/payment/webhook`
            }
        }

        const response = await axios.post(
            `${baseUrl}/orders`,
            paymentData,
            {
                headers: {
                    'x-client-id': clientId,
                    'x-client-secret': clientSecret,
                    'x-api-version': '2022-09-01',
                    'Content-Type': 'application/json'
                }
            }
        )

        if (response.data && response.data.payment_session_id) {
            // Store payment details
            await PaymentModel.create({
                paymentRequestId: orderId,
                userId: userId,
                planId: planId,
                credits: credits,
                amount: amount,
                status: 'pending'
            })

            res.json({
                success: true,
                paymentSessionId: response.data.payment_session_id,
                orderId: orderId,
                paymentLink: response.data.payment_link,
                message: 'Payment link created successfully'
            })
        } else {
            res.json({ success: false, message: 'Failed to create payment link' })
        }
    } catch (error) {
        console.log('Payment Link Error:', error.response?.data || error.message)
        res.json({ 
            success: false, 
            message: error.response?.data?.message || error.message || 'Failed to create payment link' 
        })
    }
}

// Verify payment webhook from Cashfree
export const verifyPayment = async (req, res) => {
    try {
        const { order_id, order_status } = req.body

        // Find payment record
        const paymentRecord = await PaymentModel.findOne({ paymentRequestId: order_id })
        
        if (!paymentRecord) {
            return res.json({ success: false, message: 'Payment record not found' })
        }

        if (order_status === 'PAID' && paymentRecord.status === 'pending') {
            // Update user credits
            await userModel.findByIdAndUpdate(paymentRecord.userId, {
                $inc: { creditBalance: paymentRecord.credits }
            })

            // Update payment status
            paymentRecord.status = 'completed'
            await paymentRecord.save()

            res.json({ success: true, message: 'Payment verified and credits added' })
        } else {
            res.json({ success: false, message: 'Payment verification failed' })
        }
    } catch (error) {
        console.log('Payment Verification Error:', error.message)
        res.json({ success: false, message: error.message })
    }
}

// Verify payment status (called from frontend after redirect)
export const checkPaymentStatus = async (req, res) => {
    try {
        const { order_id, userId } = req.body

        if (!order_id || !userId) {
            return res.json({ success: false, message: 'Missing Details' })
        }

        // Find payment record
        const paymentRecord = await PaymentModel.findOne({ 
            paymentRequestId: order_id,
            userId: userId 
        })

        if (!paymentRecord) {
            return res.json({ success: false, message: 'Payment record not found' })
        }

        // Check with Cashfree API
        const clientId = process.env.CASHFREE_APP_ID
        const clientSecret = process.env.CASHFREE_SECRET_KEY
        const isProduction = process.env.NODE_ENV === 'production'
        const baseUrl = isProduction 
            ? 'https://api.cashfree.com/pg' 
            : 'https://sandbox.cashfree.com/pg'

        if (clientId && clientSecret) {
            try {
                const response = await axios.get(
                    `${baseUrl}/orders/${order_id}`,
                    {
                        headers: {
                            'x-client-id': clientId,
                            'x-client-secret': clientSecret,
                            'x-api-version': '2022-09-01'
                        }
                    }
                )

                if (response.data && response.data.order_status === 'PAID') {
                    if (paymentRecord.status === 'pending') {
                        // Update user credits
                        await userModel.findByIdAndUpdate(userId, {
                            $inc: { creditBalance: paymentRecord.credits }
                        })

                        paymentRecord.status = 'completed'
                        await paymentRecord.save()
                    }

                    const user = await userModel.findById(userId)
                    res.json({
                        success: true,
                        message: 'Payment successful',
                        credits: user.creditBalance
                    })
                } else {
                    res.json({ success: false, message: 'Payment not completed', status: paymentRecord.status })
                }
            } catch (apiError) {
                // If API check fails, use stored status
                if (paymentRecord.status === 'completed') {
                    const user = await userModel.findById(userId)
                    res.json({
                        success: true,
                        message: 'Payment already processed',
                        credits: user.creditBalance
                    })
                } else {
                    res.json({ success: false, message: 'Payment not completed', status: paymentRecord.status })
                }
            }
        } else {
            // Manual payment - check if already processed
            if (paymentRecord.status === 'completed') {
                const user = await userModel.findById(userId)
                res.json({
                    success: true,
                    message: 'Payment already processed',
                    credits: user.creditBalance
                })
            } else {
                res.json({ 
                    success: false, 
                    message: 'Payment pending verification',
                    status: 'pending'
                })
            }
        }
    } catch (error) {
        console.log('Payment Status Error:', error.message)
        res.json({ success: false, message: error.message })
    }
}

// Manual payment verification (for admin or support)
export const verifyManualPayment = async (req, res) => {
    try {
        const { order_id, transaction_id, userId, credits } = req.body

        if (!order_id || !userId || !credits) {
            return res.json({ success: false, message: 'Missing Details' })
        }

        // Verify payment record
        const paymentRecord = await PaymentModel.findOne({ 
            paymentRequestId: order_id,
            userId: userId 
        })

        if (!paymentRecord) {
            return res.json({ success: false, message: 'Payment record not found' })
        }

        if (paymentRecord.status === 'completed') {
            return res.json({ success: false, message: 'Payment already processed' })
        }

        // Update user credits
        await userModel.findByIdAndUpdate(userId, {
            $inc: { creditBalance: credits }
        })

        // Update payment status
        paymentRecord.status = 'completed'
        if (transaction_id) {
            paymentRecord.transactionId = transaction_id
        }
        await paymentRecord.save()

        const user = await userModel.findById(userId)
        res.json({
            success: true,
            message: 'Payment verified and credits added',
            credits: user.creditBalance
        })
    } catch (error) {
        console.log('Manual Payment Verification Error:', error.message)
        res.json({ success: false, message: error.message })
    }
}

