// config/db.js
const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    await mongoose.connect("mongodb://127.0.0.1:27017/Bitpro");
    console.log("✅ MongoDB connected");
    return Promise.resolve();
  } catch (error) {
    console.error("❌ MongoDB connection error:", error.message);
    return Promise.reject(error);
  }
};

module.exports = connectDB;
