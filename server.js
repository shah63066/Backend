const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const connectDB = require("./config/db");
const Booking = require("./models/Booking");

const app = express();
connectDB();

app.use(cors());
app.use(bodyParser.json());

// API Route to Save Booking
app.post("/api/book", async (req, res) => {
  try {
    console.log("Saving booking to database:", req.body);

    const newBooking = new Booking(req.body);
    await newBooking.save();

    console.log("Saved Successfully!");

    res.json({ success: true });
  } catch (error) {
    console.log("Save Error:", error);
    res.json({ success: false });
  }
});


// Test Route
app.get("/", (req, res) => {
  res.send("Booking Backend Running");
});

const PORT = 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
