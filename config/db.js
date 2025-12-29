// config/db.js
const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    await mongoose.connect("mongodb+srv://itsibrarahmad_db_user:1234567890@cluster0.wiui2xk.mongodb.net/?appName=Cluster0");
    console.log("✅ MongoDB connected");
    return Promise.resolve();
  } catch (error) {
    console.error("❌ MongoDB connection error:", error.message);
    return Promise.reject(error);
  }
};

module.exports = connectDB;
