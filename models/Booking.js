const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,          // ✅ REQUIRED FOR RECEIPT
      lowercase: true,
      trim: true,
    },

    phone: {
      type: String,
      required: true,
    },

    date: {
      type: String, // yyyy-mm-dd
      required: true,
    },

    service: {
      type: String,
      required: true,
    },

    subService: {
      type: String,
      required: true,
    },

    barber: {
      type: String,
      required: true,
    },

    time: {
      type: String, // HH:mm
      required: true,
    },

    amount: {
      type: Number,
      required: true,
    },

    // Payment related
    paymentStatus: {
      type: String,
      enum: ["pending", "paid"],
      default: "pending",
    },

    razorpayOrderId: {
      type: String,
    },

    razorpayPaymentId: {
      type: String,
    },
  },
  {
    timestamps: true, // createdAt & updatedAt
  }
);

// ❌ Prevent double booking for same barber, date & time
bookingSchema.index({ barber: 1, date: 1, time: 1 }, { unique: true });

module.exports = mongoose.model("Booking", bookingSchema);
