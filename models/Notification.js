const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, required: true }, // e.g. 'transaction', 'system'
  refId: { type: mongoose.Schema.Types.ObjectId, default: null }, // reference to transaction or other
  message: { type: String, required: true },
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
}, { collection: 'notifications' });

module.exports = mongoose.model('Notification', notificationSchema);
