const mongoose = require("mongoose");
require("dotenv").config(); // Load .env variables

const connectDB = async () => {
  const mongoURI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/h2o_salon";

  try {
    await mongoose.connect(mongoURI); // No options needed in Mongoose 7+
    console.log("✅ MongoDB Connected Successfully");
  } catch (error) {
    console.error("❌ MongoDB Connection Failed", error);
  }
};

module.exports = connectDB;
