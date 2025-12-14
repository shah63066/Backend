
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
  origin: "https://h2osalon.vercel.app",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  credentials: true
}));


app.use(bodyParser.json());


app.get("/", (req, res) => {
  res.send("🚀 Backend is running successfully");
});

/* ADMIN DASHBOARD APIs */

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



/*
 SALON CHATBOT API */
app.post("/api/chat", async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) {
      return res.json({ reply: "Please type a message." });
    }

    const msg = message.toLowerCase().trim();

    // ✅ Define responses for all keywords
    const replies = {
      services: `💇 Our Services include:
• Haircut
• Beard Trim
• Hair Spa
• Facial
• Hair Color`,
      prices: `💇 Our Services & Prices:
• Haircut – ₹200
• Beard Trim – ₹100
• Hair Spa – ₹800
• Facial – ₹1200
• Hair Color – ₹1500
For detailed pricing, visit: https://h2osalon.vercel.app/`,
      timing: "⏰ We are open daily from 9:00 AM to 9:00 PM.",
      booking:
        "📅 You can book an appointment from our website using the Book Appointment button.",
      location:
        "📍 H₂O The Men's Salon\nDevalay Complex, Beltar Mirzapur, UP, India.",
      payment:
        "💳 We accept online payments via Razorpay (UPI, Card, NetBanking).",
      barber:
        "✂️ Our professional barbers are available all days. You can select your barber while booking.",
    };

    // Check which keyword the user typed
    let reply =
      "Sorry, please ask about services, prices, timing, booking or location.";

    if (msg.includes("service") || msg.includes("services")) {
      reply = replies.services;
    } else if (msg.includes("price") || msg.includes("prices") || msg.includes("rate")) {
      reply = replies.prices;
    } else if (msg.includes("time") || msg.includes("timing") || msg.includes("open")) {
      reply = replies.timing;
    } else if (msg.includes("book") || msg.includes("appointment")) {
      reply = replies.booking;
    } else if (msg.includes("location") || msg.includes("address")) {
      reply = replies.location;
    } else if (msg.includes("payment") || msg.includes("pay")) {
      reply = replies.payment;
    } else if (msg.includes("barber") || msg.includes("staff")) {
      reply = replies.barber;
    }

    res.json({ reply });
  } catch (error) {
    console.error("Chatbot Error:", error);
    res.status(500).json({ reply: "Server error. Please try again later." });
  }
});





/* Razorpay Setup */
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

/* Nodemailer (TLS ERROR FIXED) */
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS, // 16-char app password (NO spaces)
  },
  tls: {
    rejectUnauthorized: false, //  FIX for self-signed certificate error
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

/* BOOK APPOINTMENT*/
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

/* CREATE RAZORPAY ORDER */
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

/* VERIFY PAYMENT + SEND EMAIL */
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

/* SERVER START*/
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
