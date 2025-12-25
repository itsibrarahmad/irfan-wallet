const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phone: { type: String, required: true },
  easypaisa: { type: String, required: true },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  password: { type: String, required: true },
  isActive: { type: Boolean, default: true }, // Admin can activate/deactivate users
}, { collection: "users" }); // explicitly set collection name

module.exports = mongoose.model("User", userSchema);
