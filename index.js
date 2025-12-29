

require("dotenv").config();
const express = require("express");
const path = require("path");
const bodyParser = require("body-parser");
const bcrypt = require("bcrypt");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const helmet = require("helmet");

// Database
const connectDB = require("./config/db");
const User = require("./models/User");
const Transaction = require("./models/Transaction");
const Notification = require("./models/Notification");

const app = express();
const PORT = process.env.PORT || 3000;

// -------------------- Middleware --------------------
app.use(helmet()); // Security headers
app.use(bodyParser.urlencoded({ extended: true, limit: "10mb" }));
app.use(bodyParser.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname, "style")));

// -------------------- Session --------------------
app.use(
  session({
    secret: process.env.SESSION_SECRET || "fallback_secret_change_me",
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGO_URL,
      ttl: 24 * 60 * 60, // 1 day
      autoRemove: "native",
    }),
    cookie: { maxAge: 1000 * 60 * 60 * 24 }, // 24 hours
  })
);

// -------------------- Auth Middleware --------------------
const isAuthenticated = (req, res, next) => {
  if (req.session.userId) return next();
  return res.status(401).json({ error: "Not authenticated. Please login." });
};

const isAdmin = (req, res, next) => {
  if (req.session.role === "admin") return next();
  return res.status(403).json({ error: "Forbidden. Admins only." });
};

// -------------------- HTML Routes --------------------
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "views", "login.html")));
app.get("/signup", (req, res) => res.sendFile(path.join(__dirname, "views", "signup.html")));
app.get("/login", (req, res) => res.sendFile(path.join(__dirname, "views", "login.html")));
app.get("/dashboard", isAuthenticated, (req, res) =>
  res.sendFile(path.join(__dirname, "views", "dashboard.html"))
);
app.get("/admin/dashboard", isAuthenticated, isAdmin, (req, res) =>
  res.sendFile(path.join(__dirname, "views", "dashboard.html"))
);

// -------------------- Auth APIs --------------------
// Signup
app.post("/signup", async (req, res) => {
  try {
    const { firstName, lastName, email, phone, easypaisa, password } = req.body;

    if (!firstName || !lastName || !email || !phone || !easypaisa || !password)
      return res.status(400).json({ error: "All fields are required" });

    if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: "Invalid email" });

    const exists = await User.findOne({ email });
    if (exists) return res.status(409).json({ error: "Email already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      firstName,
      lastName,
      email,
      phone,
      easypaisa,
      password: hashedPassword,
      role: "user",
    });

    // Notify admins
    const admins = await User.find({ role: "admin" }).select("_id firstName lastName");
    const notifications = admins.map((a) => ({
      recipient: a._id,
      type: "new_user",
      refId: null,
      message: `New user registered: ${firstName} ${lastName} (${email})`,
    }));
    if (notifications.length) await Notification.insertMany(notifications);

    res.status(201).json({ message: "Signup successful", userId: user._id });
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ error: "Server error during signup" });
  }
});

// Login
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email & password required" });

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ error: "User not found" });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: "Wrong password" });
    if (!user.isActive) return res.status(403).json({ error: "Account deactivated" });

    req.session.userId = user._id;
    req.session.userName = user.firstName;
    req.session.userEmail = user.email;
    req.session.role = user.role || "user";

    res.json({ message: "Login successful", user: { firstName: user.firstName, email: user.email } });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Server error during login" });
  }
});

// Logout
app.get("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ error: "Error logging out" });
    res.json({ message: "Logout successful" });
  });
});

// -------------------- User APIs --------------------
// Current user info
app.get("/api/user", isAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    res.json({
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: `${user.firstName} ${user.lastName}`,
      email: user.email,
      phone: user.phone,
      easypaisa: user.easypaisa,
      role: user.role,
    });
  } catch (err) {
    console.error("Error fetching user:", err);
    res.status(500).json({ error: "Error fetching user data" });
  }
});

// Admin: list admins
app.get("/api/admins", isAuthenticated, isAdmin, async (req, res) => {
  try {
    const admins = await User.find({ role: "admin" }).select("firstName lastName email");
    res.json(admins);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error fetching admins" });
  }
});

// Admin: list all users
app.get("/api/users", isAuthenticated, isAdmin, async (req, res) => {
  try {
    const users = await User.find({}).select("firstName lastName email phone role isActive");

    const counts = await Transaction.aggregate([
      {
        $group: {
          _id: "$userId",
          deposits: { $sum: { $cond: [{ $eq: ["$type", "deposit"] }, 1, 0] } },
          withdrawals: { $sum: { $cond: [{ $eq: ["$type", "withdrawal"] }, 1, 0] } },
          depositsAmount: { $sum: { $cond: [{ $eq: ["$type", "deposit"] }, "$amount", 0] } },
          withdrawalsAmount: { $sum: { $cond: [{ $eq: ["$type", "withdrawal"] }, "$amount", 0] } },
        },
      },
    ]);

    const countsMap = {};
    counts.forEach((c) => (countsMap[c._id.toString()] = c));

    const usersWithCounts = users.map((u) => {
      const id = u._id.toString();
      const c = countsMap[id] || { deposits: 0, withdrawals: 0, depositsAmount: 0, withdrawalsAmount: 0 };
      return {
        ...u.toObject(),
        deposits: c.deposits,
        withdrawals: c.withdrawals,
        depositsAmount: c.depositsAmount,
        withdrawalsAmount: c.withdrawalsAmount,
      };
    });

    res.json(usersWithCounts);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error fetching users" });
  }
});

// Admin: toggle user active
app.patch("/api/admin/users/:id/toggle-active", isAuthenticated, isAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    user.isActive = !user.isActive;
    await user.save();
    res.json({ message: `User ${user.isActive ? "activated" : "deactivated"}`, isActive: user.isActive });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error toggling user active" });
  }
});

// Admin: user detail + transactions
app.get("/api/admin/users/:id", isAuthenticated, isAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("firstName lastName email phone easypaisa role isActive password");
    if (!user) return res.status(404).json({ error: "User not found" });

    const transactions = await Transaction.find({ userId: req.params.id }).sort({ createdAt: -1 });
    let totalProfit = 0,
      totalLoss = 0;
    transactions.forEach((t) => {
      if (t.type === "deposit" && t.status === "approved") totalProfit += t.amount;
      else if (t.type === "withdrawal" && t.status === "approved") totalLoss += t.amount;
    });

    res.json({
      user: user.toObject(),
      transactions,
      summary: {
        totalDeposits: transactions.filter((t) => t.type === "deposit" && t.status === "approved").length,
        totalWithdrawals: transactions.filter((t) => t.type === "withdrawal" && t.status === "approved").length,
        totalDepositAmount: totalProfit,
        totalWithdrawalAmount: totalLoss,
        netBalance: totalProfit - totalLoss,
        isProfit: totalProfit - totalLoss >= 0,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error fetching user detail" });
  }
});

// Change password
app.post("/api/change-password", async (req, res) => {
  try {
    const { email, currentPassword, newPassword } = req.body;
    if (!email || !currentPassword || !newPassword)
      return res.status(400).json({ error: "All fields required" });
    if (newPassword.length < 8) return res.status(400).json({ error: "Password too short" });

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ error: "User not found" });

    const match = await bcrypt.compare(currentPassword, user.password);
    if (!match) return res.status(401).json({ error: "Current password wrong" });

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    res.json({ message: "Password updated successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error changing password" });
  }
});

// -------------------- Transactions --------------------
// Submit transaction
app.post("/api/transactions", isAuthenticated, async (req, res) => {
  try {
    const { type, amount, screenshot } = req.body;
    if (!type || !amount) return res.status(400).json({ error: "Missing required fields" });
    if (type === "deposit" && !screenshot) return res.status(400).json({ error: "Screenshot required for deposit" });
    if (!["deposit", "withdrawal"].includes(type)) return res.status(400).json({ error: "Invalid type" });
    if (amount < 100) return res.status(400).json({ error: "Minimum amount 100" });

    const transaction = await Transaction.create({
      userId: req.session.userId,
      type,
      amount,
      screenshot: screenshot || null,
      status: "pending",
    });

    const admins = await User.find({ role: "admin" }).select("_id firstName lastName");
    const user = await User.findById(req.session.userId).select("firstName lastName");

    const notifications = [
      ...admins.map((a) => ({
        recipient: a._id,
        type: "transaction",
        refId: transaction._id,
        message: `New ${type} request from ${user.firstName} ${user.lastName}: PKR ${amount}`,
      })),
      {
        recipient: req.session.userId,
        type: "transaction",
        refId: transaction._id,
        message: `Your ${type} request of PKR ${amount} is pending.`,
      },
    ];
    if (notifications.length) await Notification.insertMany(notifications);

    res.json({ message: "Transaction submitted", transactionId: transaction._id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error submitting transaction" });
  }
});

// Get user's transactions
app.get("/api/transactions", isAuthenticated, async (req, res) => {
  try {
    const transactions = await Transaction.find({ userId: req.session.userId }).sort({ createdAt: -1 });
    res.json(transactions);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error fetching transactions" });
  }
});

// Admin: Get pending transactions
app.get("/api/admin/transactions", isAuthenticated, isAdmin, async (req, res) => {
  try {
    const status = req.query.status || "pending";
    const transactions = await Transaction.find({ status }).populate("userId", "firstName lastName email phone").sort({ createdAt: -1 });
    res.json(transactions);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error fetching transactions" });
  }
});

// Admin: Approve/reject transaction
app.patch("/api/admin/transactions/:id", isAuthenticated, isAdmin, async (req, res) => {
  try {
    const { status, comment, screenshot } = req.body;
    if (!["approved", "rejected"].includes(status)) return res.status(400).json({ error: "Invalid status" });

    const update = {
      status,
      adminComment: comment || "",
      approvedAt: new Date(),
      approvedBy: req.session.userId,
    };
    if (status === "approved" && screenshot) update.screenshot = screenshot;

    const transaction = await Transaction.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!transaction) return res.status(404).json({ error: "Transaction not found" });

    const ownerMessage =
      status === "approved"
        ? `Your ${transaction.type} of PKR ${transaction.amount} was approved.`
        : `Your ${transaction.type} of PKR ${transaction.amount} was rejected. ${update.adminComment}`;

    await Notification.create({
      recipient: transaction.userId,
      type: "transaction",
      refId: transaction._id,
      message: ownerMessage,
    });

    res.json({ message: `Transaction ${status}`, transaction });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error updating transaction" });
  }
});

// -------------------- Notifications --------------------
app.get("/api/notifications/count", isAuthenticated, async (req, res) => {
  try {
    const count = await Notification.countDocuments({ recipient: req.session.userId, read: false });
    res.json({ count });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error fetching notification count" });
  }
});

app.get("/api/notifications", isAuthenticated, async (req, res) => {
  try {
    const items = await Notification.find({ recipient: req.session.userId }).sort({ createdAt: -1 }).limit(50);
    res.json(items);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error fetching notifications" });
  }
});

app.get("/api/notifications/summary", isAuthenticated, async (req, res) => {
  try {
    const total = await Notification.countDocuments({ recipient: req.session.userId, read: false });
    const agg = await Notification.aggregate([
      { $match: { recipient: req.session.userId, read: false } },
      { $group: { _id: "$type", count: { $sum: 1 } } },
    ]);
    const byType = {};
    agg.forEach((a) => (byType[a._id] = a.count));
    res.json({ total, byType });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error fetching notification summary" });
  }
});

app.patch("/api/notifications/:id/mark-read", isAuthenticated, async (req, res) => {
  try {
    const notif = await Notification.findById(req.params.id);
    if (!notif) return res.status(404).json({ error: "Notification not found" });
    if (notif.recipient.toString() !== req.session.userId.toString())
      return res.status(403).json({ error: "Forbidden" });

    notif.read = true;
    await notif.save();
    res.json({ message: "Marked read" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error marking notification read" });
  }
});

app.patch("/api/notifications/mark-all", isAuthenticated, async (req, res) => {
  try {
    await Notification.updateMany({ recipient: req.session.userId, read: false }, { $set: { read: true } });
    res.json({ message: "All notifications marked read" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error marking all notifications" });
  }
});

app.patch("/api/notifications/mark-type", isAuthenticated, async (req, res) => {
  try {
    const { type } = req.body;
    if (!type) return res.status(400).json({ error: "Type is required" });

    await Notification.updateMany({ recipient: req.session.userId, type, read: false }, { $set: { read: true } });
    res.json({ message: `All ${type} notifications marked read` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error marking notifications by type" });
  }
});

// -------------------- Server Start --------------------
const startServer = async () => {
  try {
    await connectDB();
    console.log("✅ MongoDB connected");

    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error("❌ Server failed to start:", err.message);
    process.exit(1);
  }
};

startServer();
