require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const crypto = require("crypto");
const Razorpay = require("razorpay");
const nodemailer = require("nodemailer");

const connectDB = require("./config/db");
const Booking = require("./models/Booking");

const app = express();
connectDB();

app.use(cors({
  origin: "https://h2osalon.vercel.app/" // ya specific frontend URL: "https://your-frontend.vercel.app"
}));


app.use(bodyParser.json());


app.get("/", (req, res) => {
  res.send("🚀 Backend is running successfully");
});

/* ===============================
   ADMIN DASHBOARD APIs
================================ */

// 🔹 Get all bookings
app.get("/api/admin/bookings", async (req, res) => {
  try {
    const bookings = await Booking.find().sort({ createdAt: -1 });
    res.json(bookings);
  } catch (err) {
    console.error("Admin bookings error:", err);
    res.status(500).json({ success: false });
  }
});

// 🔹 Get total earnings (only paid)
app.get("/api/admin/earnings", async (req, res) => {
  try {
    const result = await Booking.aggregate([
      { $match: { paymentStatus: "paid" } },
      {
        $group: {
          _id: null,
          total: { $sum: "$amount" },
        },
      },
    ]);

    res.json({ total: result[0]?.total || 0 });
  } catch (err) {
    console.error("Admin earnings error:", err);
    res.status(500).json({ success: false });
  }
});





/* ===============================
   Razorpay Setup
================================ */
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

/* ===============================
   Nodemailer (TLS ERROR FIXED)
================================ */
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS, // 16-char app password (NO spaces)
  },
  tls: {
    rejectUnauthorized: false, // 🔥 FIX for self-signed certificate error
  },
});

const sendReceipt = async (booking) => {
  try {
    await transporter.sendMail({
      from: `"H₂O The Men's Salon" <${process.env.EMAIL_USER}>`,
      to: booking.email,
      subject: "H₂O The Men's Salon – Payment Receipt",
      html: `
        <h2>Payment Successful ✅</h2>
        <p>Hello <b>${booking.fullName}</b>,</p>
        <p>Thank you for booking with <b>H₂O The Men's Salon</b>.</p>
        <hr/>
        <p><b>Service:</b> ${booking.service} - ${booking.subService}</p>
        <p><b>Date:</b> ${booking.date}</p>
        <p><b>Time:</b> ${booking.time}</p>
        <p><b>Amount Paid:</b> ₹${booking.amount}</p>
        <hr/>
        <p>We look forward to serving you ✂️</p>
      `,
    });

    console.log("📧 Receipt email sent successfully");
  } catch (err) {
    console.error("📧 Email Error:", err.message);
  }
};

/* ===============================
   BOOK APPOINTMENT
================================ */
app.post("/api/book", async (req, res) => {
  try {
    const { date, time, barber } = req.body;

    const slotExists = await Booking.findOne({ date, time, barber });
    if (slotExists) {
      return res.json({
        success: false,
        message: "This time slot is already booked",
      });
    }

    const booking = new Booking(req.body);
    await booking.save();

    res.json({
      success: true,
      bookingId: booking._id,
      amount: booking.amount,
    });
  } catch (err) {
    console.error("Booking Error:", err);
    res.json({ success: false });
  }
});

/* ===============================
   CREATE RAZORPAY ORDER
================================ */
app.post("/api/create-order", async (req, res) => {
  try {
    const { amount, bookingId } = req.body;

    const order = await razorpay.orders.create({
      amount: amount * 100,
      currency: "INR",
      receipt: bookingId,
    });

    await Booking.findByIdAndUpdate(bookingId, {
      razorpayOrderId: order.id,
    });

    res.json(order);
  } catch (err) {
    console.error("Order Error:", err);
    res.status(500).json({ success: false });
  }
});

/* ===============================
   VERIFY PAYMENT + SEND EMAIL
================================ */
app.post("/api/verify-payment", async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    const sign = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSign = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(sign)
      .digest("hex");

    if (expectedSign !== razorpay_signature) {
      return res.json({ success: false });
    }

    const booking = await Booking.findOneAndUpdate(
      { razorpayOrderId: razorpay_order_id },
      {
        paymentStatus: "paid",
        razorpayPaymentId: razorpay_payment_id,
      },
      { new: true }
    );

    // 📧 SEND RECEIPT
    await sendReceipt(booking);

    res.json({ success: true });
  } catch (err) {
    console.error("Verify Error:", err);
    res.json({ success: false });
  }
});

/* ===============================
   SERVER START
================================ */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
