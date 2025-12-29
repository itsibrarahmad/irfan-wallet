require("dotenv").config();
const express = require("express");
const path = require("path");
const bodyParser = require("body-parser");
const bcrypt = require("bcrypt");
const session = require("express-session");

// Database Connection
const connectDB = require("./config/db");
const User = require("./models/User");
const Transaction = require("./models/Transaction");
const Notification = require("./models/Notification");
// let dbConnected = false;

// connectDB().then(() => {
//   dbConnected = true;
//   console.log("✅ Database connection successful");
// }).catch((err) => {
//   console.error("❌ Database connection failed:", err.message);
//   console.error("⚠️ App will still run but database operations will fail");
// });

const app = express();
const PORT = 3000;

// Middlewares
// Increase limits to allow base64 screenshot payloads from the client
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
app.use(bodyParser.json({ limit: '10mb' }));

// Session middleware
app.use(session({
  secret: "your-secret-key-change-this",
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 } // 24 hours
}));

// Static folder for CSS
app.use(express.static(path.join(__dirname, "style")));

// Middleware to check if user is authenticated
const isAuthenticated = (req, res, next) => {
  if (req.session.userId) {
    next();
  } else {
    res.status(401).json({ error: "Not authenticated. Please login first." });
  }
};

// Middleware to check admin
const isAdmin = (req, res, next) => {
  if (req.session && req.session.userId && req.session.role === 'admin') {
    return next();
  }
  return res.status(403).json({ error: 'Forbidden. Admins only.' });
};

// Routes
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "views", "login.html"));
});

app.get("/signup", (req, res) => {
  res.sendFile(path.join(__dirname, "views", "signup.html"));
});

app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "views", "login.html"));
});

// ================================
// Handle Signup Form (POST)
// ================================
app.post("/signup", async (req, res) => {
  try {
    console.log("Signup request received:", req.body);
    
    const { firstName, lastName, email, phone, easypaisa, password } = req.body;

    // Validate required fields
    if (!firstName || !lastName || !email || !phone || !easypaisa || !password) {
      return res.status(400).json({ error: "All fields are required!" });
    }

    // Validate email format
    const emailRegex = /^\S+@\S+\.\S+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: "Invalid email format!" });
    }

    console.log("Checking if email exists:", email);
    const exists = await User.findOne({ email });
    if (exists) {
      return res.status(409).json({ error: "Email already exists!" });
    }

    console.log("Hashing password...");
    const hashedPassword = await bcrypt.hash(password, 10);

    console.log("Creating User...");
    // create user with default role = 'user'
    await User.create({
      firstName,
      lastName,
      email,
      phone,
      easypaisa,
      password: hashedPassword,
      role: 'user'
    });

    console.log("User created successfully");
      res.status(201).json({ message: "Signup successful! User saved." });

      // Notify admins about new user signup
      try {
        const admins = await User.find({ role: 'admin' }).select('_id firstName lastName');
        const notifications = [];
        const userName = `${firstName} ${lastName}`;
        admins.forEach(a => {
          notifications.push({
            recipient: a._id,
            type: 'new_user',
            refId: null,
            message: `New user registered: ${userName} (${email})`
          });
        });
        if (notifications.length) await Notification.insertMany(notifications);
      } catch (nerr) {
        console.error('Error creating signup notifications:', nerr);
      }
  } catch (error) {
    console.error("Signup error details:", error);
    console.error("Error stack:", error.stack);
    res.status(500).json({ error: "Error saving user. Please try again. Details: " + error.message });
  }
});

// Handle Login Form (POST)
app.post("/login", async (req, res) => {
  try {
    console.log("Login request received:", req.body);
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: "Password is wrong." });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(403).json({ error: "Your account has been deactivated by admin. Please contact support." });
    }

    // Set session
    req.session.userId = user._id;
    req.session.userName = user.firstName;
    req.session.userEmail = user.email;
    req.session.role = user.role || 'user';

    return res.status(200).json({ message: "Login successful.", user: { firstName: user.firstName, email: user.email } });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ error: "Server error during login. Please try again." });
  }
});

// Dashboard route — unified dashboard supporting both user and admin roles
app.get('/dashboard', isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'dashboard.html'));
});

// Admin-only dashboard route — also serves unified dashboard (role check is client-side)
app.get('/admin/dashboard', isAuthenticated, isAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'dashboard.html'));
});

// Logout route
app.get("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: "Error logging out." });
    }
    res.json({ message: "Logout successful." });
  });
});

// API: Get current user data
app.get("/api/user", isAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    res.json({
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: `${user.firstName} ${user.lastName}`,
      email: user.email,
      phone: user.phone,
      easypaisa: user.easypaisa,
      role: user.role
    });
  } catch (err) {
    console.error("Error fetching user data:", err);
    res.status(500).json({ error: "Error fetching user data." });
  }
});

// API: Get admins list (admin-only)
app.get('/api/admins', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const admins = await User.find({ role: 'admin' }).select('firstName lastName email');
    res.json(admins);
  } catch (err) {
    console.error('Error fetching admins:', err);
    res.status(500).json({ error: 'Error fetching admins' });
  }
});

// API: Get all users list (admin-only)
app.get('/api/users', isAuthenticated, isAdmin, async (req, res) => {
  try {
    // fetch basic user info
    const users = await User.find({}).select('firstName lastName email phone role isActive');

    // aggregate transactions to compute deposit & withdrawal counts per user
    const counts = await Transaction.aggregate([
      {
        $group: {
          _id: '$userId',
          deposits: { $sum: { $cond: [{ $eq: ['$type', 'deposit'] }, 1, 0] } },
          withdrawals: { $sum: { $cond: [{ $eq: ['$type', 'withdrawal'] }, 1, 0] } },
          depositsAmount: { $sum: { $cond: [{ $eq: ['$type', 'deposit'] }, '$amount', 0] } },
          withdrawalsAmount: { $sum: { $cond: [{ $eq: ['$type', 'withdrawal'] }, '$amount', 0] } }
        }
      }
    ]);

    const countsMap = {};
    counts.forEach(c => { countsMap[c._id.toString()] = c; });

    const usersWithCounts = users.map(u => {
      const id = (u._id || '').toString();
      const c = countsMap[id] || { deposits: 0, withdrawals: 0, depositsAmount: 0, withdrawalsAmount: 0 };
      return {
        _id: u._id,
        firstName: u.firstName,
        lastName: u.lastName,
        email: u.email,
        phone: u.phone,
        role: u.role,
        isActive: u.isActive !== false,
        deposits: c.deposits || 0,
        withdrawals: c.withdrawals || 0,
        depositsAmount: c.depositsAmount || 0,
        withdrawalsAmount: c.withdrawalsAmount || 0
      };
    });

    res.json(usersWithCounts);
  } catch (err) {
    console.error('Error fetching users:', err);
    res.status(500).json({ error: 'Error fetching users' });
  }
});

// API: Toggle user active status (admin-only)
app.patch('/api/admin/users/:id/toggle-active', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    user.isActive = !user.isActive;
    await user.save();
    
    res.json({ message: `User ${user.isActive ? 'activated' : 'deactivated'}`, isActive: user.isActive });
  } catch (err) {
    console.error('Error toggling user active:', err);
    res.status(500).json({ error: 'Error toggling user active status' });
  }
});

// API: Get user detail with transactions (admin-only)
app.get('/api/admin/users/:id', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('firstName lastName email phone easypaisa role isActive password');
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    const transactions = await Transaction.find({ userId: req.params.id }).sort({ createdAt: -1 });
    
    // Calculate profit/loss
    let totalProfit = 0;
    let totalLoss = 0;
    transactions.forEach(t => {
      if (t.type === 'deposit' && t.status === 'approved') {
        totalProfit += t.amount;
      } else if (t.type === 'withdrawal' && t.status === 'approved') {
        totalLoss += t.amount;
      }
    });
    const netBalance = totalProfit - totalLoss;
    
    res.json({
      user: {
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        easypaisa: user.easypaisa,
        role: user.role,
        isActive: user.isActive,
        passwordHash: user.password // Return hashed password (do not reveal plaintext)
      },
      transactions,
      summary: {
        totalDeposits: transactions.filter(t => t.type === 'deposit' && t.status === 'approved').length,
        totalWithdrawals: transactions.filter(t => t.type === 'withdrawal' && t.status === 'approved').length,
        totalDepositAmount: totalProfit,
        totalWithdrawalAmount: totalLoss,
        netBalance: netBalance,
        isProfit: netBalance >= 0
      }
    });
  } catch (err) {
    console.error('Error fetching user detail:', err);
    res.status(500).json({ error: 'Error fetching user detail' });
  }
});

// API: Change password (works without being logged in) — verifies current password
app.post('/api/change-password', async (req, res) => {
  try {
    const { email, currentPassword, newPassword } = req.body;

    if (!email || !currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Email, current password and new password are required.' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters long.' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }

    // Hash and update password
    const hashed = await bcrypt.hash(newPassword, 10);
    user.password = hashed;
    await user.save();

    res.json({ message: 'Password updated successfully. Please login with your new password.' });
  } catch (err) {
    console.error('Error fetching users:', err);
    res.status(500).json({ error: 'Error fetching users' });
  }
});

// API: Submit transaction (deposit/withdrawal)
app.post('/api/transactions', isAuthenticated, async (req, res) => {
  try {
    const { type, amount, screenshot } = req.body;

    // Basic validation: type and amount are always required.
    if (!type || !amount) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // If this is a deposit, user must provide a screenshot/proof.
    if (type === 'deposit' && !screenshot) {
      return res.status(400).json({ error: 'Payment screenshot is required for deposits' });
    }

    if (type !== 'deposit' && type !== 'withdrawal') {
      return res.status(400).json({ error: 'Invalid transaction type' });
    }

    if (amount < 100) {
      return res.status(400).json({ error: 'Minimum amount is 100 PKR' });
    }

    const transactionData = {
      userId: req.session.userId,
      type,
      amount,
      status: 'pending'
    };

    // Only set screenshot when provided (deposits will have it; withdrawals may omit it)
    if (screenshot) transactionData.screenshot = screenshot;

    const transaction = new Transaction(transactionData);

    await transaction.save();
    // Create notifications for admins and the user
    try {
      const admins = await User.find({ role: 'admin' }).select('_id firstName lastName');
      const notifications = [];
      const user = await User.findById(req.session.userId).select('firstName lastName');
      const userName = user ? `${user.firstName} ${user.lastName}` : 'User';

      admins.forEach(a => {
        notifications.push({
          recipient: a._id,
          type: 'transaction',
          refId: transaction._id,
          message: `New ${transaction.type} request from ${userName}: PKR ${transaction.amount}`
        });
      });

      notifications.push({
        recipient: req.session.userId,
        type: 'transaction',
        refId: transaction._id,
        message: `Your ${transaction.type} request of PKR ${transaction.amount} was submitted and is pending review.`
      });

      if (notifications.length) {
        await Notification.insertMany(notifications);
        console.log(`📣 Created ${notifications.length} notifications for transaction ${transaction._id}`);
      }
    } catch (nerr) {
      console.error('Error creating notifications:', nerr);
    }

    res.json({ message: 'Transaction submitted successfully', transactionId: transaction._id });
  } catch (err) {
    console.error('Error submitting transaction:', err);
    res.status(500).json({ error: 'Error submitting transaction' });
  }
});

// API: Get user's transactions
app.get('/api/transactions', isAuthenticated, async (req, res) => {
  try {
    const transactions = await Transaction.find({ userId: req.session.userId }).sort({ createdAt: -1 });
    res.json(transactions);
  } catch (err) {
    console.error('Error fetching transactions:', err);
    res.status(500).json({ error: 'Error fetching transactions' });
  }
});

// API: Get all pending transactions (admin-only)
app.get('/api/admin/transactions', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const status = req.query.status || 'pending';
    const transactions = await Transaction.find({ status }).populate('userId', 'firstName lastName email phone').sort({ createdAt: -1 });
    res.json(transactions);
  } catch (err) {
    console.error('Error fetching admin transactions:', err);
    res.status(500).json({ error: 'Error fetching transactions' });
  }
});

// API: Approve/Reject transaction (admin-only)
app.patch('/api/admin/transactions/:id', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const { status, comment, screenshot } = req.body;

    if (!status || (status !== 'approved' && status !== 'rejected')) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const updateData = {
      status,
      adminComment: comment || '',
      approvedAt: new Date(),
      approvedBy: req.session.userId
    };

    // If admin provided a screenshot, use it (only for approved transactions)
    if (status === 'approved' && screenshot) {
      updateData.screenshot = screenshot;
    }

    const transaction = await Transaction.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    res.json({ message: `Transaction ${status}`, transaction });
    // Notify the transaction owner about the status change
    try {
      const ownerId = transaction.userId;
      const ownerMessage = status === 'approved'
        ? `Your ${transaction.type} of PKR ${transaction.amount} was approved.`
        : `Your ${transaction.type} of PKR ${transaction.amount} was rejected. ${updateData.adminComment || ''}`;

      await Notification.create({
        recipient: ownerId,
        type: 'transaction',
        refId: transaction._id,
        message: ownerMessage
      });
    } catch (nerr) {
      console.error('Error creating owner notification:', nerr);
    }
  } catch (err) {
    console.error('Error updating transaction:', err);
    res.status(500).json({ error: 'Error updating transaction' });
  }
});

// Notifications endpoints
app.get('/api/notifications/count', isAuthenticated, async (req, res) => {
  try {
    const count = await Notification.countDocuments({ recipient: req.session.userId, read: false });
    res.json({ count });
  } catch (err) {
    console.error('Error fetching notification count:', err);
    res.status(500).json({ error: 'Error fetching notification count' });
  }
});

app.get('/api/notifications', isAuthenticated, async (req, res) => {
  try {
    const items = await Notification.find({ recipient: req.session.userId }).sort({ createdAt: -1 }).limit(50);
    res.json(items);
  } catch (err) {
    console.error('Error fetching notifications:', err);
    res.status(500).json({ error: 'Error fetching notifications' });
  }
});

// Notifications summary (counts by type) for UI badges
app.get('/api/notifications/summary', isAuthenticated, async (req, res) => {
  try {
    const total = await Notification.countDocuments({ recipient: req.session.userId, read: false });
    const agg = await Notification.aggregate([
      { $match: { recipient: req.session.userId, read: false } },
      { $group: { _id: '$type', count: { $sum: 1 } } }
    ]);
    const byType = {};
    agg.forEach(a => { byType[a._id] = a.count; });
    res.json({ total, byType });
  } catch (err) {
    console.error('Error fetching notification summary:', err);
    res.status(500).json({ error: 'Error fetching notification summary' });
  }
});

app.patch('/api/notifications/:id/mark-read', isAuthenticated, async (req, res) => {
  try {
    const notif = await Notification.findById(req.params.id);
    if (!notif) return res.status(404).json({ error: 'Notification not found' });
    if (notif.recipient.toString() !== req.session.userId.toString()) return res.status(403).json({ error: 'Forbidden' });
    notif.read = true;
    await notif.save();
    res.json({ message: 'Marked read' });
  } catch (err) {
    console.error('Error marking notification read:', err);
    res.status(500).json({ error: 'Error' });
  }
});

app.patch('/api/notifications/mark-all', isAuthenticated, async (req, res) => {
  try {
    await Notification.updateMany({ recipient: req.session.userId, read: false }, { $set: { read: true } });
    res.json({ message: 'All notifications marked read' });
  } catch (err) {
    console.error('Error marking all notifications:', err);
    res.status(500).json({ error: 'Error' });
  }
});

// Mark all unread notifications of a specific type as read
app.patch('/api/notifications/mark-type', isAuthenticated, async (req, res) => {
  try {
    const { type } = req.body;
    if (!type) return res.status(400).json({ error: 'Type is required' });
    await Notification.updateMany({ recipient: req.session.userId, type: type, read: false }, { $set: { read: true } });
    res.json({ message: 'Notifications marked read for type', type });
  } catch (err) {
    console.error('Error marking notifications by type:', err);
    res.status(500).json({ error: 'Error' });
  }
});

// Start server
// app.listen(PORT, () => {
//   console.log(`🚀 Server running at http://localhost:${PORT}`);
// });
const startServer = async () => {
  try {
    await connectDB();   // ⏳ wait for MongoDB
    app.listen(process.env.PORT || 3000, () => {
      console.log("🚀 Server started & MongoDB connected");
    });
  } catch (err) {
    console.error("❌ Server failed to start because DB failed:", err.message);
  }
};

startServer();
